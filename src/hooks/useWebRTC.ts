import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PeerConnection {
  peerId: string;
  peerName: string;
  pc: RTCPeerConnection;
  audioElement: HTMLAudioElement;
  isMuted: boolean;
  isMutedByHost: boolean;
}

interface UseWebRTCOptions {
  roomId: string | null;
  profileId: string | null;
  profileName?: string;
  isHost: boolean;
  enabled: boolean;
}

export interface PeerInfo {
  peerId: string;
  peerName: string;
  isMuted: boolean;
  isMutedByHost: boolean;
  isSpeaking: boolean;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 5,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

const AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
    channelCount: 1,
  },
  video: false,
};

const MAX_RECONNECT = 3;
const RECONNECT_DELAY = 2000;

export function useWebRTC({ roomId, profileId, profileName, isHost, enabled }: UseWebRTCOptions) {
  const [isMuted, setIsMuted] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connectionQuality, setConnectionQuality] = useState<"good" | "fair" | "poor">("good");

  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const speakingRef = useRef<ReturnType<typeof setInterval>>();
  const reconnectRef = useRef<Map<string, number>>(new Map());
  const isMutedByHostRef = useRef(false);
  const isHostRef = useRef(isHost);
  const profileIdRef = useRef(profileId);
  const profileNameRef = useRef(profileName);
  const callStartedRef = useRef(false);

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { profileIdRef.current = profileId; }, [profileId]);
  useEffect(() => { profileNameRef.current = profileName; }, [profileName]);

  const syncPeers = useCallback(() => {
    const list: PeerInfo[] = [];
    peersRef.current.forEach((p) => {
      list.push({
        peerId: p.peerId,
        peerName: p.peerName,
        isMuted: p.isMuted,
        isMutedByHost: p.isMutedByHost,
        isSpeaking: false,
      });
    });
    setPeers(list);
  }, []);

  const startSpeakingDetection = useCallback(() => {
    if (speakingRef.current) clearInterval(speakingRef.current);
    speakingRef.current = setInterval(() => {
      const updated: PeerInfo[] = [];
      peersRef.current.forEach((peer) => {
        const speaking = !!(peer.audioElement?.srcObject &&
          !peer.audioElement.paused &&
          (peer.audioElement.srcObject as MediaStream).getAudioTracks().some(t => t.enabled) &&
          !peer.isMuted);
        updated.push({
          peerId: peer.peerId,
          peerName: peer.peerName,
          isMuted: peer.isMuted,
          isMutedByHost: peer.isMutedByHost,
          isSpeaking: speaking,
        });
      });
      setPeers(updated);
    }, 600);
  }, []);

  const removePeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (peer) {
      peer.pc.close();
      peer.audioElement.pause();
      peer.audioElement.srcObject = null;
      peersRef.current.delete(peerId);
      reconnectRef.current.delete(peerId);
      syncPeers();
    }
  }, [syncPeers]);

  const createPC = useCallback((remotePeerId: string, remoteName: string): RTCPeerConnection => {
    const existing = peersRef.current.get(remotePeerId);
    if (existing) {
      existing.pc.close();
      existing.audioElement.srcObject = null;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    const audio = new Audio();
    audio.autoplay = true;
    (audio as any).playsInline = true;
    audio.volume = 1.0;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
    }

    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (stream) {
        audio.srcObject = stream;
        audio.play().catch(() => {});
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "webrtc-ice",
          payload: { from: profileIdRef.current, to: remotePeerId, candidate: e.candidate.toJSON() },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") {
        reconnectRef.current.set(remotePeerId, 0);
        setConnectionQuality("good");
      } else if (state === "disconnected") {
        setConnectionQuality("fair");
        const attempts = reconnectRef.current.get(remotePeerId) || 0;
        if (attempts < MAX_RECONNECT) {
          reconnectRef.current.set(remotePeerId, attempts + 1);
          setTimeout(() => { if (pc.connectionState === "disconnected") pc.restartIce(); }, RECONNECT_DELAY);
        }
      } else if (state === "failed") {
        setConnectionQuality("poor");
        const attempts = reconnectRef.current.get(remotePeerId) || 0;
        if (attempts < MAX_RECONNECT) {
          reconnectRef.current.set(remotePeerId, attempts + 1);
          setTimeout(() => {
            removePeer(remotePeerId);
            if (profileIdRef.current && profileIdRef.current < remotePeerId) {
              sendOffer(remotePeerId, remoteName);
            }
          }, RECONNECT_DELAY);
        } else {
          removePeer(remotePeerId);
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        setConnectionQuality("good");
      }
    };

    peersRef.current.set(remotePeerId, {
      peerId: remotePeerId,
      peerName: remoteName,
      pc,
      audioElement: audio,
      isMuted: false,
      isMutedByHost: false,
    });
    syncPeers();
    return pc;
  }, [syncPeers, removePeer]);

  const sendOffer = useCallback(async (remotePeerId: string, remoteName: string) => {
    if (!channelRef.current || !profileIdRef.current) return;
    const pc = createPC(remotePeerId, remoteName);
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
      await pc.setLocalDescription(offer);
      channelRef.current.send({
        type: "broadcast",
        event: "webrtc-offer",
        payload: { from: profileIdRef.current, fromName: profileNameRef.current || "Anônimo", to: remotePeerId, sdp: offer },
      });
    } catch (e) {
      console.error("[WebRTC] Offer failed:", e);
    }
  }, [createPC]);

  const endCall = useCallback(() => {
    peersRef.current.forEach((p) => {
      p.pc.close();
      p.audioElement.pause();
      p.audioElement.srcObject = null;
    });
    peersRef.current.clear();
    reconnectRef.current.clear();
    setPeers([]);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }

    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }

    clearInterval(speakingRef.current);
    isMutedByHostRef.current = false;
    callStartedRef.current = false;
    setIsCallActive(false);
    setIsMuted(false);
    setConnectionQuality("good");
  }, []);

  // Main call startup
  useEffect(() => {
    if (!enabled || !roomId || !profileId || callStartedRef.current) return;

    let cancelled = false;
    callStartedRef.current = true;

    const start = async () => {
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        setIsCallActive(true);

        const channel = supabase.channel(`voice-${roomId}`, {
          config: { presence: { key: profileId } },
        });

        channel.on("presence", { event: "join" }, ({ key, newPresences }) => {
          if (key === profileIdRef.current) return;
          const info = newPresences[0] as any;
          if (profileIdRef.current! < key) {
            sendOffer(key, info.name || "Anônimo");
          }
        });

        channel.on("presence", { event: "leave" }, ({ key }) => {
          removePeer(key);
        });

        channel.on("broadcast", { event: "webrtc-offer" }, async ({ payload }) => {
          if (payload.to !== profileIdRef.current) return;
          const pc = createPC(payload.from, payload.fromName || "Anônimo");
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            channel.send({
              type: "broadcast",
              event: "webrtc-answer",
              payload: { from: profileIdRef.current, fromName: profileNameRef.current || "Anônimo", to: payload.from, sdp: answer },
            });
          } catch (e) {
            console.error("[WebRTC] Answer failed:", e);
          }
        });

        channel.on("broadcast", { event: "webrtc-answer" }, async ({ payload }) => {
          if (payload.to !== profileIdRef.current) return;
          const peer = peersRef.current.get(payload.from);
          if (peer) {
            try { await peer.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp)); } catch {}
          }
        });

        channel.on("broadcast", { event: "webrtc-ice" }, async ({ payload }) => {
          if (payload.to !== profileIdRef.current) return;
          const peer = peersRef.current.get(payload.from);
          if (peer && payload.candidate) {
            try { await peer.pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch {}
          }
        });

        channel.on("broadcast", { event: "host-mute" }, ({ payload }) => {
          if (payload.targetId === profileIdRef.current) {
            isMutedByHostRef.current = true;
            localStreamRef.current?.getAudioTracks().forEach(t => (t.enabled = false));
            setIsMuted(true);
          }
          const peer = peersRef.current.get(payload.targetId);
          if (peer) { peer.isMutedByHost = true; peer.isMuted = true; syncPeers(); }
        });

        channel.on("broadcast", { event: "host-unmute" }, ({ payload }) => {
          if (payload.targetId === profileIdRef.current) {
            isMutedByHostRef.current = false;
            localStreamRef.current?.getAudioTracks().forEach(t => (t.enabled = true));
            setIsMuted(false);
          }
          const peer = peersRef.current.get(payload.targetId);
          if (peer) { peer.isMutedByHost = false; peer.isMuted = false; syncPeers(); }
        });

        channel.on("broadcast", { event: "host-kick" }, ({ payload }) => {
          if (payload.targetId === profileIdRef.current) {
            setError("Você foi removido da chamada pelo host.");
            endCall();
          }
        });

        channel.on("broadcast", { event: "peer-mute-state" }, ({ payload }) => {
          if (payload.from === profileIdRef.current) return;
          const peer = peersRef.current.get(payload.from);
          if (peer) { peer.isMuted = payload.muted; syncPeers(); }
        });

        await channel.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track({
              profile_id: profileId,
              name: profileName || "Anônimo",
              online_at: new Date().toISOString(),
            });
          }
        });

        channelRef.current = channel;
        startSpeakingDetection();
      } catch (e: any) {
        callStartedRef.current = false;
        if (e.name === "NotAllowedError") setError("Permissão de microfone negada.");
        else if (e.name === "NotFoundError") setError("Nenhum microfone encontrado.");
        else setError("Erro ao iniciar chamada: " + (e.message || "desconhecido"));
      }
    };

    start();

    return () => {
      cancelled = true;
      endCall();
    };
  }, [enabled, roomId, profileId]); // stable deps only

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    if (isMutedByHostRef.current) {
      setError("O host silenciou você.");
      return;
    }
    const newMuted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach(t => (t.enabled = !newMuted));
    setIsMuted(newMuted);
    channelRef.current?.send({
      type: "broadcast",
      event: "peer-mute-state",
      payload: { from: profileIdRef.current, muted: newMuted },
    });
  }, [isMuted]);

  const hostMute = useCallback((targetId: string) => {
    if (!isHostRef.current || !channelRef.current) return;
    channelRef.current.send({ type: "broadcast", event: "host-mute", payload: { targetId, muted: true } });
    const peer = peersRef.current.get(targetId);
    if (peer) { peer.isMutedByHost = true; peer.isMuted = true; syncPeers(); }
    supabase.from("watch_room_participants").update({ muted_by_host: true }).eq("profile_id", targetId).eq("room_id", roomId!).then(() => {});
  }, [roomId, syncPeers]);

  const hostUnmute = useCallback((targetId: string) => {
    if (!isHostRef.current || !channelRef.current) return;
    channelRef.current.send({ type: "broadcast", event: "host-unmute", payload: { targetId } });
    const peer = peersRef.current.get(targetId);
    if (peer) { peer.isMutedByHost = false; peer.isMuted = false; syncPeers(); }
    supabase.from("watch_room_participants").update({ muted_by_host: false }).eq("profile_id", targetId).eq("room_id", roomId!).then(() => {});
  }, [roomId, syncPeers]);

  const hostKick = useCallback((targetId: string) => {
    if (!isHostRef.current || !channelRef.current) return;
    channelRef.current.send({ type: "broadcast", event: "host-kick", payload: { targetId } });
    removePeer(targetId);
    supabase.from("watch_room_participants").delete().eq("profile_id", targetId).eq("room_id", roomId!).then(() => {});
  }, [roomId, removePeer]);

  return {
    isCallActive,
    isMuted,
    peers,
    error,
    localStream: localStreamRef.current,
    connectionQuality,
    startCall: () => {},
    endCall,
    toggleMute,
    hostMute,
    hostUnmute,
    hostKick,
  };
}
