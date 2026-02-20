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

interface PeerInfo {
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

export function useWebRTC({ roomId, profileId, profileName, isHost, enabled }: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const analyserIntervalRef = useRef<ReturnType<typeof setInterval>>();

  // Update peers state from ref
  const syncPeersState = useCallback(() => {
    const peerList: PeerInfo[] = [];
    peersRef.current.forEach((peer) => {
      peerList.push({
        peerId: peer.peerId,
        peerName: peer.peerName,
        isMuted: peer.isMuted,
        isMutedByHost: peer.isMutedByHost,
        isSpeaking: false,
      });
    });
    setPeers(peerList);
  }, []);

  // Create peer connection for a remote user
  const createPeerConnection = useCallback((remotePeerId: string, remotePeerName: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    const audioElement = new Audio();
    audioElement.autoplay = true;
    (audioElement as any).playsInline = true;

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle remote tracks
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        audioElement.srcObject = stream;
        audioElement.play().catch(() => {});
      }
    };

    // Send ICE candidates via broadcast
    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "webrtc-ice",
          payload: {
            from: profileId,
            to: remotePeerId,
            candidate: event.candidate.toJSON(),
          },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        removePeer(remotePeerId);
      }
    };

    const peerConn: PeerConnection = {
      peerId: remotePeerId,
      peerName: remotePeerName,
      pc,
      audioElement,
      isMuted: false,
      isMutedByHost: false,
    };

    peersRef.current.set(remotePeerId, peerConn);
    syncPeersState();
    return pc;
  }, [profileId, syncPeersState]);

  // Remove peer
  const removePeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (peer) {
      peer.pc.close();
      peer.audioElement.srcObject = null;
      peersRef.current.delete(peerId);
      syncPeersState();
    }
  }, [syncPeersState]);

  // Start call - acquire mic and join signaling
  const startCall = useCallback(async () => {
    if (!roomId || !profileId || !enabled) return;
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsCallActive(true);

      // Setup signaling channel
      const channelName = `voice-${roomId}`;
      const channel = supabase.channel(channelName, {
        config: { presence: { key: profileId } },
      });

      // Presence - discover peers
      channel.on("presence", { event: "join" }, ({ key, newPresences }) => {
        if (key === profileId) return;
        const info = newPresences[0] as any;
        // Initiator: only the peer with "lower" ID sends offer
        if (profileId! < key) {
          initiateCall(key, info.name || "Anônimo");
        }
      });

      channel.on("presence", { event: "leave" }, ({ key }) => {
        removePeer(key);
      });

      // SDP offer
      channel.on("broadcast", { event: "webrtc-offer" }, async ({ payload }) => {
        if (payload.to !== profileId) return;
        const pc = createPeerConnection(payload.from, payload.fromName || "Anônimo");
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        channel.send({
          type: "broadcast",
          event: "webrtc-answer",
          payload: { from: profileId, fromName: profileName || "Anônimo", to: payload.from, sdp: answer },
        });
      });

      // SDP answer
      channel.on("broadcast", { event: "webrtc-answer" }, async ({ payload }) => {
        if (payload.to !== profileId) return;
        const peer = peersRef.current.get(payload.from);
        if (peer) {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        }
      });

      // ICE candidates
      channel.on("broadcast", { event: "webrtc-ice" }, async ({ payload }) => {
        if (payload.to !== profileId) return;
        const peer = peersRef.current.get(payload.from);
        if (peer && payload.candidate) {
          try {
            await peer.pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch {}
        }
      });

      // Host mute command
      channel.on("broadcast", { event: "host-mute" }, ({ payload }) => {
        if (payload.targetId === profileId) {
          // I was muted by host
          if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = false));
          }
          setIsMuted(true);
        }
        // Update peer state for UI
        const peer = peersRef.current.get(payload.targetId);
        if (peer) {
          peer.isMutedByHost = payload.muted;
          if (payload.muted) peer.isMuted = true;
          syncPeersState();
        }
      });

      // Host unmute command
      channel.on("broadcast", { event: "host-unmute" }, ({ payload }) => {
        if (payload.targetId === profileId) {
          // Host unmuted me, re-enable
          if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = true));
          }
          setIsMuted(false);
        }
        const peer = peersRef.current.get(payload.targetId);
        if (peer) {
          peer.isMutedByHost = false;
          peer.isMuted = false;
          syncPeersState();
        }
      });

      // Host kick command
      channel.on("broadcast", { event: "host-kick" }, ({ payload }) => {
        if (payload.targetId === profileId) {
          endCall();
        }
      });

      // Peer self-mute notification
      channel.on("broadcast", { event: "peer-mute-state" }, ({ payload }) => {
        if (payload.from === profileId) return;
        const peer = peersRef.current.get(payload.from);
        if (peer) {
          peer.isMuted = payload.muted;
          syncPeersState();
        }
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

      // Initiate call to a discovered peer
      async function initiateCall(remotePeerId: string, remoteName: string) {
        const pc = createPeerConnection(remotePeerId, remoteName);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        channel.send({
          type: "broadcast",
          event: "webrtc-offer",
          payload: { from: profileId, fromName: profileName || "Anônimo", to: remotePeerId, sdp: offer },
        });
      }
    } catch (e: any) {
      if (e.name === "NotAllowedError") {
        setError("Permissão de microfone negada. Ative nas configurações do navegador.");
      } else {
        setError("Erro ao iniciar chamada: " + (e.message || "desconhecido"));
      }
    }
  }, [roomId, profileId, profileName, enabled, createPeerConnection, removePeer, syncPeersState]);

  // End call
  const endCall = useCallback(() => {
    // Close all peer connections
    peersRef.current.forEach((peer) => {
      peer.pc.close();
      peer.audioElement.srcObject = null;
    });
    peersRef.current.clear();
    setPeers([]);

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);

    // Unsubscribe channel
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }

    clearInterval(analyserIntervalRef.current);
    setIsCallActive(false);
    setIsMuted(false);
  }, []);

  // Toggle self mute
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const newMuted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !newMuted));
    setIsMuted(newMuted);

    // Notify peers
    channelRef.current?.send({
      type: "broadcast",
      event: "peer-mute-state",
      payload: { from: profileId, muted: newMuted },
    });
  }, [isMuted, profileId]);

  // Host: mute a participant (they can't unmute themselves)
  const hostMute = useCallback((targetId: string) => {
    if (!isHost || !channelRef.current) return;
    channelRef.current.send({
      type: "broadcast",
      event: "host-mute",
      payload: { targetId, muted: true },
    });
    // Update local state
    const peer = peersRef.current.get(targetId);
    if (peer) {
      peer.isMutedByHost = true;
      peer.isMuted = true;
      syncPeersState();
    }
    // Update DB
    supabase.from("watch_room_participants")
      .update({ muted_by_host: true })
      .eq("profile_id", targetId)
      .eq("room_id", roomId!)
      .then(() => {});
  }, [isHost, roomId, syncPeersState]);

  // Host: unmute a participant
  const hostUnmute = useCallback((targetId: string) => {
    if (!isHost || !channelRef.current) return;
    channelRef.current.send({
      type: "broadcast",
      event: "host-unmute",
      payload: { targetId },
    });
    const peer = peersRef.current.get(targetId);
    if (peer) {
      peer.isMutedByHost = false;
      peer.isMuted = false;
      syncPeersState();
    }
    supabase.from("watch_room_participants")
      .update({ muted_by_host: false })
      .eq("profile_id", targetId)
      .eq("room_id", roomId!)
      .then(() => {});
  }, [isHost, roomId, syncPeersState]);

  // Host: kick a participant
  const hostKick = useCallback((targetId: string) => {
    if (!isHost || !channelRef.current) return;
    channelRef.current.send({
      type: "broadcast",
      event: "host-kick",
      payload: { targetId },
    });
    removePeer(targetId);
    // Remove from DB
    supabase.from("watch_room_participants")
      .delete()
      .eq("profile_id", targetId)
      .eq("room_id", roomId!)
      .then(() => {});
  }, [isHost, roomId, removePeer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endCall();
    };
  }, [endCall]);

  // Auto-start call when enabled and room exists
  useEffect(() => {
    if (enabled && roomId && profileId && !isCallActive) {
      startCall();
    }
  }, [enabled, roomId, profileId]);

  return {
    isCallActive,
    isMuted,
    peers,
    error,
    localStream,
    startCall,
    endCall,
    toggleMute,
    hostMute,
    hostUnmute,
    hostKick,
  };
}
