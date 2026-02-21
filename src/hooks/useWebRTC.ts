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
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: "all",
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

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 2000;

export function useWebRTC({ roomId, profileId, profileName, isHost, enabled }: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connectionQuality, setConnectionQuality] = useState<"good" | "fair" | "poor">("good");

  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const speakingIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const reconnectAttemptsRef = useRef<Map<string, number>>(new Map());
  const isMutedByHostRef = useRef(false);

  // Sync peers state from ref
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

  // Monitor speaking activity via audio analysis
  const startSpeakingDetection = useCallback(() => {
    if (speakingIntervalRef.current) clearInterval(speakingIntervalRef.current);

    speakingIntervalRef.current = setInterval(() => {
      const updatedPeers: PeerInfo[] = [];
      let changed = false;

      peersRef.current.forEach((peer) => {
        const info: PeerInfo = {
          peerId: peer.peerId,
          peerName: peer.peerName,
          isMuted: peer.isMuted,
          isMutedByHost: peer.isMutedByHost,
          isSpeaking: false,
        };

        // Check if peer audio is playing
        if (peer.audioElement && !peer.audioElement.paused && peer.audioElement.srcObject) {
          const tracks = (peer.audioElement.srcObject as MediaStream).getAudioTracks();
          info.isSpeaking = tracks.length > 0 && tracks[0].enabled && !peer.isMuted;
        }

        updatedPeers.push(info);
      });

      setPeers(updatedPeers);
    }, 500);
  }, []);

  // Create peer connection with retry logic
  const createPeerConnection = useCallback((remotePeerId: string, remotePeerName: string): RTCPeerConnection => {
    // Close existing connection if any
    const existing = peersRef.current.get(remotePeerId);
    if (existing) {
      existing.pc.close();
      existing.audioElement.srcObject = null;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    const audioElement = new Audio();
    audioElement.autoplay = true;
    (audioElement as any).playsInline = true;
    audioElement.volume = 1.0;

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
        audioElement.play().catch((e) => {
          console.warn("[WebRTC] Audio autoplay blocked, will retry on interaction:", e.message);
        });
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

    // Connection state monitoring with auto-reconnect
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`[WebRTC] Peer ${remotePeerId.slice(0, 6)} state: ${state}`);

      if (state === "connected") {
        reconnectAttemptsRef.current.set(remotePeerId, 0);
        setConnectionQuality("good");
      } else if (state === "disconnected") {
        setConnectionQuality("fair");
        // Auto-reconnect after brief disconnection
        const attempts = reconnectAttemptsRef.current.get(remotePeerId) || 0;
        if (attempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current.set(remotePeerId, attempts + 1);
          setTimeout(() => {
            if (pc.connectionState === "disconnected" && channelRef.current) {
              console.log(`[WebRTC] Reconnecting to ${remotePeerId.slice(0, 6)}... attempt ${attempts + 1}`);
              pc.restartIce();
            }
          }, RECONNECT_DELAY);
        }
      } else if (state === "failed") {
        setConnectionQuality("poor");
        const attempts = reconnectAttemptsRef.current.get(remotePeerId) || 0;
        if (attempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current.set(remotePeerId, attempts + 1);
          setTimeout(() => {
            removePeer(remotePeerId);
            // Re-initiate if we are the lower ID
            if (profileId && profileId < remotePeerId) {
              initiateCallToPeer(remotePeerId, remotePeerName);
            }
          }, RECONNECT_DELAY);
        } else {
          removePeer(remotePeerId);
        }
      }
    };

    // ICE connection state for quality monitoring
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "checking") {
        setConnectionQuality("fair");
      } else if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        setConnectionQuality("good");
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

  // Remove peer cleanly
  const removePeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (peer) {
      peer.pc.close();
      peer.audioElement.pause();
      peer.audioElement.srcObject = null;
      peer.audioElement.remove();
      peersRef.current.delete(peerId);
      reconnectAttemptsRef.current.delete(peerId);
      syncPeersState();
    }
  }, [syncPeersState]);

  // Initiate call to a specific peer
  const initiateCallToPeer = useCallback(async (remotePeerId: string, remoteName: string) => {
    if (!channelRef.current || !profileId) return;
    const pc = createPeerConnection(remotePeerId, remoteName);
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);
      channelRef.current.send({
        type: "broadcast",
        event: "webrtc-offer",
        payload: { from: profileId, fromName: profileName || "Anônimo", to: remotePeerId, sdp: offer },
      });
    } catch (e) {
      console.error("[WebRTC] Failed to create offer:", e);
    }
  }, [profileId, profileName, createPeerConnection]);

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
          initiateCallToPeer(key, info.name || "Anônimo");
        }
      });

      channel.on("presence", { event: "leave" }, ({ key }) => {
        removePeer(key);
      });

      // SDP offer
      channel.on("broadcast", { event: "webrtc-offer" }, async ({ payload }) => {
        if (payload.to !== profileId) return;
        const pc = createPeerConnection(payload.from, payload.fromName || "Anônimo");
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          channel.send({
            type: "broadcast",
            event: "webrtc-answer",
            payload: { from: profileId, fromName: profileName || "Anônimo", to: payload.from, sdp: answer },
          });
        } catch (e) {
          console.error("[WebRTC] Failed to handle offer:", e);
        }
      });

      // SDP answer
      channel.on("broadcast", { event: "webrtc-answer" }, async ({ payload }) => {
        if (payload.to !== profileId) return;
        const peer = peersRef.current.get(payload.from);
        if (peer) {
          try {
            await peer.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          } catch (e) {
            console.error("[WebRTC] Failed to set answer:", e);
          }
        }
      });

      // ICE candidates
      channel.on("broadcast", { event: "webrtc-ice" }, async ({ payload }) => {
        if (payload.to !== profileId) return;
        const peer = peersRef.current.get(payload.from);
        if (peer && payload.candidate) {
          try {
            await peer.pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch (e) {
            // Ignore late ICE candidates
          }
        }
      });

      // Host mute command
      channel.on("broadcast", { event: "host-mute" }, ({ payload }) => {
        if (payload.targetId === profileId) {
          isMutedByHostRef.current = true;
          if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = false));
          }
          setIsMuted(true);
        }
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
          isMutedByHostRef.current = false;
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
          setError("Você foi removido da chamada pelo host.");
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

      // Start speaking detection
      startSpeakingDetection();

    } catch (e: any) {
      if (e.name === "NotAllowedError") {
        setError("Permissão de microfone negada. Ative nas configurações do navegador.");
      } else if (e.name === "NotFoundError") {
        setError("Nenhum microfone encontrado. Conecte um dispositivo de áudio.");
      } else if (e.name === "NotReadableError") {
        setError("Microfone em uso por outro aplicativo. Feche outros apps e tente novamente.");
      } else {
        setError("Erro ao iniciar chamada: " + (e.message || "desconhecido"));
      }
    }
  }, [roomId, profileId, profileName, enabled, createPeerConnection, removePeer, syncPeersState, initiateCallToPeer, startSpeakingDetection]);

  // End call - full cleanup
  const endCall = useCallback(() => {
    // Close all peer connections
    peersRef.current.forEach((peer) => {
      peer.pc.close();
      peer.audioElement.pause();
      peer.audioElement.srcObject = null;
      peer.audioElement.remove();
    });
    peersRef.current.clear();
    reconnectAttemptsRef.current.clear();
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

    clearInterval(speakingIntervalRef.current);
    isMutedByHostRef.current = false;
    setIsCallActive(false);
    setIsMuted(false);
    setConnectionQuality("good");
  }, []);

  // Toggle self mute (blocked if muted by host)
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    if (isMutedByHostRef.current) {
      setError("O host silenciou você. Apenas o host pode reativar seu áudio.");
      return;
    }
    const newMuted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !newMuted));
    setIsMuted(newMuted);

    channelRef.current?.send({
      type: "broadcast",
      event: "peer-mute-state",
      payload: { from: profileId, muted: newMuted },
    });
  }, [isMuted, profileId]);

  // Host: mute a participant
  const hostMute = useCallback((targetId: string) => {
    if (!isHost || !channelRef.current) return;
    channelRef.current.send({
      type: "broadcast",
      event: "host-mute",
      payload: { targetId, muted: true },
    });
    const peer = peersRef.current.get(targetId);
    if (peer) {
      peer.isMutedByHost = true;
      peer.isMuted = true;
      syncPeersState();
    }
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
    connectionQuality,
    startCall,
    endCall,
    toggleMute,
    hostMute,
    hostUnmute,
    hostKick,
  };
}
