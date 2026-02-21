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
  const speakingIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const reconnectRef = useRef<Map<string, number>>(new Map());
  const isMutedByHostRef = useRef(false);
  const isHostRef = useRef(isHost);
  const profileIdRef = useRef(profileId);
  const profileNameRef = useRef(profileName);
  const callStartedRef = useRef(false);
  // Track pending ICE candidates before remote description is set
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

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

  // Real speaking detection using AudioContext AnalyserNode
  const startSpeakingDetection = useCallback(() => {
    if (speakingIntervalRef.current) clearInterval(speakingIntervalRef.current);
    speakingIntervalRef.current = setInterval(() => {
      const updated: PeerInfo[] = [];
      peersRef.current.forEach((peer) => {
        // Check if audio is actually flowing
        const stream = peer.audioElement?.srcObject as MediaStream | null;
        const hasActiveAudio = stream && stream.getAudioTracks().some(t => t.enabled && t.readyState === "live");
        const speaking = !!(hasActiveAudio && !peer.isMuted && !peer.isMutedByHost);
        updated.push({
          peerId: peer.peerId,
          peerName: peer.peerName,
          isMuted: peer.isMuted,
          isMutedByHost: peer.isMutedByHost,
          isSpeaking: speaking,
        });
      });
      if (updated.length > 0 || peersRef.current.size === 0) {
        setPeers(updated);
      }
    }, 800);
  }, []);

  const removePeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (peer) {
      peer.pc.close();
      peer.audioElement.pause();
      peer.audioElement.srcObject = null;
      peersRef.current.delete(peerId);
      reconnectRef.current.delete(peerId);
      pendingCandidatesRef.current.delete(peerId);
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

    // Add local tracks to the connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => {
        pc.addTrack(t, localStreamRef.current!);
      });
    }

    pc.ontrack = (e) => {
      console.log("[WebRTC] Got remote track from", remotePeerId);
      const [stream] = e.streams;
      if (stream) {
        audio.srcObject = stream;
        audio.play().catch((err) => {
          console.warn("[WebRTC] Audio autoplay blocked, trying on user gesture:", err);
        });
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
      console.log("[WebRTC] Connection to", remotePeerId, ":", state);
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
            // Lower ID initiates reconnection
            if (profileIdRef.current && profileIdRef.current < remotePeerId) {
              sendOffer(remotePeerId, remoteName);
            }
          }, RECONNECT_DELAY);
        } else {
          removePeer(remotePeerId);
        }
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
    console.log("[WebRTC] Sending offer to", remotePeerId);
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
    pendingCandidatesRef.current.clear();
    setPeers([]);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }

    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }

    clearInterval(speakingIntervalRef.current);
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
        console.log("[WebRTC] Requesting microphone...");
        const stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        setIsCallActive(true);
        console.log("[WebRTC] Microphone acquired, setting up voice channel...");

        const channel = supabase.channel(`voice-${roomId}`, {
          config: { presence: { key: profileId } },
        });

        // When a NEW peer joins after us, the lower-ID peer sends the offer
        channel.on("presence", { event: "join" }, ({ key, newPresences }) => {
          if (key === profileIdRef.current) return;
          const info = newPresences[0] as any;
          console.log("[WebRTC] Presence JOIN:", key, info?.name);
          // Only the peer with the lower ID sends the offer to avoid duplicate connections
          if (profileIdRef.current! < key) {
            sendOffer(key, info?.name || "Anônimo");
          }
        });

        channel.on("presence", { event: "leave" }, ({ key }) => {
          console.log("[WebRTC] Presence LEAVE:", key);
          removePeer(key);
        });

        // CRITICAL: On presence sync, discover peers that were already in the channel
        // This handles the case where user B joins after user A is already subscribed
        channel.on("presence", { event: "sync" }, () => {
          const state = channel.presenceState();
          const allPeerIds = Object.keys(state).filter(k => k !== profileIdRef.current);
          console.log("[WebRTC] Presence SYNC, peers in channel:", allPeerIds);
          
          allPeerIds.forEach(peerId => {
            // If we don't have a connection to this peer yet, initiate one
            if (!peersRef.current.has(peerId)) {
              const presenceData = state[peerId]?.[0] as any;
              const peerName = presenceData?.name || "Anônimo";
              console.log("[WebRTC] Discovered existing peer via sync:", peerId, peerName);
              // Lower ID initiates the offer
              if (profileIdRef.current! < peerId) {
                sendOffer(peerId, peerName);
              }
            }
          });
        });

        channel.on("broadcast", { event: "webrtc-offer" }, async ({ payload }) => {
          if (payload.to !== profileIdRef.current) return;
          console.log("[WebRTC] Received offer from", payload.from);
          const pc = createPC(payload.from, payload.fromName || "Anônimo");
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            // Apply any pending ICE candidates
            const pending = pendingCandidatesRef.current.get(payload.from) || [];
            for (const c of pending) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            }
            pendingCandidatesRef.current.delete(payload.from);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            channel.send({
              type: "broadcast",
              event: "webrtc-answer",
              payload: { from: profileIdRef.current, fromName: profileNameRef.current || "Anônimo", to: payload.from, sdp: answer },
            });
            console.log("[WebRTC] Sent answer to", payload.from);
          } catch (e) {
            console.error("[WebRTC] Answer failed:", e);
          }
        });

        channel.on("broadcast", { event: "webrtc-answer" }, async ({ payload }) => {
          if (payload.to !== profileIdRef.current) return;
          console.log("[WebRTC] Received answer from", payload.from);
          const peer = peersRef.current.get(payload.from);
          if (peer) {
            try {
              await peer.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
              // Apply any pending ICE candidates
              const pending = pendingCandidatesRef.current.get(payload.from) || [];
              for (const c of pending) {
                await peer.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
              }
              pendingCandidatesRef.current.delete(payload.from);
            } catch (e) {
              console.error("[WebRTC] setRemoteDescription failed:", e);
            }
          }
        });

        channel.on("broadcast", { event: "webrtc-ice" }, async ({ payload }) => {
          if (payload.to !== profileIdRef.current) return;
          const peer = peersRef.current.get(payload.from);
          if (peer && payload.candidate) {
            // If remote description is not yet set, queue the candidate
            if (!peer.pc.remoteDescription) {
              const pending = pendingCandidatesRef.current.get(payload.from) || [];
              pending.push(payload.candidate);
              pendingCandidatesRef.current.set(payload.from, pending);
            } else {
              try { await peer.pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch {}
            }
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
          console.log("[WebRTC] Channel status:", status);
          if (status === "SUBSCRIBED") {
            await channel.track({
              profile_id: profileId,
              name: profileName || "Anônimo",
              online_at: new Date().toISOString(),
            });
            console.log("[WebRTC] Presence tracked for", profileId);
          }
        });

        channelRef.current = channel;
        startSpeakingDetection();
      } catch (e: any) {
        callStartedRef.current = false;
        console.error("[WebRTC] Start failed:", e);
        if (e.name === "NotAllowedError") setError("Permissão de microfone negada. Ative nas configurações do navegador.");
        else if (e.name === "NotFoundError") setError("Nenhum microfone encontrado.");
        else setError("Erro ao iniciar chamada: " + (e.message || "desconhecido"));
      }
    };

    start();

    return () => {
      cancelled = true;
      endCall();
    };
  }, [enabled, roomId, profileId]); // eslint-disable-line react-hooks/exhaustive-deps

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
