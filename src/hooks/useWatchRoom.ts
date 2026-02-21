import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  WatchRoom, RoomParticipant, 
  createRoom, joinRoom, leaveRoom, closeRoom, 
  sendHeartbeat, getActiveRoom, sendChatMessage, getChatMessages,
  getParticipantNames,
} from "@/lib/watchRoom";

interface PlaybackState {
  action: "play" | "pause" | "seek";
  position: number;
  timestamp: number;
}

interface ChatMessage {
  id: string;
  profile_id: string;
  profile_name?: string;
  message: string;
  created_at: string;
}

interface UseWatchRoomOptions {
  profileId: string | null;
  profileName?: string;
  onPlaybackSync?: (state: PlaybackState) => void;
}

export function useWatchRoom({ profileId, profileName, onPlaybackSync }: UseWatchRoomOptions) {
  const [room, setRoom] = useState<WatchRoom | null>(null);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval>>();
  const SYNC_TOLERANCE = 3; // seconds

  // Create a room
  const handleCreateRoom = useCallback(async (params: {
    tmdbId: number; contentType: string; title: string;
    posterPath?: string; season?: number; episode?: number;
  }) => {
    if (!profileId) return null;
    setLoading(true);
    setError(null);
    try {
      const newRoom = await createRoom({ hostProfileId: profileId, ...params });
      if (newRoom) {
        setRoom(newRoom);
        setIsHost(true);
      }
      return newRoom;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  // Join a room by code
  const handleJoinRoom = useCallback(async (code: string) => {
    if (!profileId) return null;
    setLoading(true);
    setError(null);
    try {
      const joinedRoom = await joinRoom(code, profileId);
      if (joinedRoom) {
        setRoom(joinedRoom);
        setIsHost(joinedRoom.host_profile_id === profileId);
      }
      return joinedRoom;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  // Leave room
  const handleLeaveRoom = useCallback(async () => {
    if (!room || !profileId) return;
    if (isHost) {
      await closeRoom(room.id);
    } else {
      await leaveRoom(room.id, profileId);
    }
    setRoom(null);
    setIsHost(false);
    setParticipants([]);
    setMessages([]);
  }, [room, profileId, isHost]);

  // Broadcast playback state (host only)
  const broadcastPlayback = useCallback((state: PlaybackState) => {
    if (!channelRef.current || !isHost) return;
    channelRef.current.send({
      type: "broadcast",
      event: "playback",
      payload: state,
    });
  }, [isHost]);

  // Send chat message
  const handleSendMessage = useCallback(async (message: string) => {
    if (!room || !profileId || !message.trim()) return;
    const msgId = crypto.randomUUID();
    const msgPayload: ChatMessage = {
      id: msgId,
      profile_id: profileId,
      profile_name: profileName || "Anônimo",
      message: message.trim(),
      created_at: new Date().toISOString(),
    };

    // Add to local state immediately (optimistic)
    setMessages(prev => [...prev.slice(-99), msgPayload]);

    // Broadcast to other participants for instant delivery
    channelRef.current?.send({
      type: "broadcast",
      event: "chat_message",
      payload: msgPayload,
    });

    // Persist to database
    try {
      await sendChatMessage(room.id, profileId, message.trim());
    } catch (err) {
      console.error("[WatchRoom] Failed to persist message:", err);
    }
  }, [room, profileId, profileName]);

  // Setup Realtime channel when room exists
  useEffect(() => {
    if (!room || !profileId) return;

    const channelName = `watch-room-${room.id}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: profileId } },
    });

    // Presence tracking
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const presenceList = Object.values(state).flat().map((p: any) => ({
        profile_id: p.profile_id,
        profile_name: p.profile_name,
      }));
      // Update participants from presence
      setParticipants(prev => {
        const updated = prev.map(p => ({
          ...p,
          _online: presenceList.some(pr => pr.profile_id === p.profile_id),
        }));
        return updated as any;
      });
    });

    // Playback sync via broadcast
    channel.on("broadcast", { event: "playback" }, ({ payload }) => {
      if (!isHost && payload) {
        onPlaybackSync?.(payload as PlaybackState);
      }
    });

    // Chat messages via broadcast (immediate delivery)
    channel.on("broadcast", { event: "chat_message" }, ({ payload }) => {
      if (payload && payload.profile_id !== profileId) {
        setMessages(prev => {
          // Deduplicate by id
          if (prev.some(m => m.id === payload.id)) return prev;
          return [...prev.slice(-99), payload as ChatMessage];
        });
      }
    });

    // Chat messages via realtime DB changes (backup/persistence)
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "watch_room_messages", filter: `room_id=eq.${room.id}` },
      (payload) => {
        const msg = payload.new as any;
        setMessages(prev => {
          // Deduplicate - might already have it from broadcast
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev.slice(-99), {
            id: msg.id,
            profile_id: msg.profile_id,
            profile_name: msg.profile_name,
            message: msg.message,
            created_at: msg.created_at,
          }];
        });
      }
    );

    // Participant changes
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "watch_room_participants", filter: `room_id=eq.${room.id}` },
      (payload) => {
        if (payload.eventType === "INSERT") {
          setParticipants(prev => [...prev, payload.new as RoomParticipant]);
        } else if (payload.eventType === "DELETE") {
          setParticipants(prev => prev.filter(p => p.id !== (payload.old as any).id));
        }
      }
    );

    // Room status changes
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "watch_rooms", filter: `id=eq.${room.id}` },
      (payload) => {
        const updated = payload.new as any;
        setRoom(prev => prev ? { ...prev, ...updated } : null);
        if (updated.status === "closed") {
          setRoom(null);
          setIsHost(false);
        }
      }
    );

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          profile_id: profileId,
          profile_name: profileName || "Anônimo",
          online_at: new Date().toISOString(),
        });
      }
    });

    channelRef.current = channel;

    // Load initial participants & messages
    supabase.from("watch_room_participants").select("*").eq("room_id", room.id)
      .then(({ data }) => { if (data) setParticipants(data as RoomParticipant[]); });
    getChatMessages(room.id).then(msgs => setMessages(msgs as ChatMessage[]));

    // Heartbeat every 30s
    heartbeatRef.current = setInterval(() => {
      sendHeartbeat(room.id, profileId);
    }, 30000);

    return () => {
      clearInterval(heartbeatRef.current);
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [room?.id, profileId, profileName, isHost, onPlaybackSync]);

  // Resolve participant names whenever participants change
  useEffect(() => {
    const ids = participants.map(p => p.profile_id).filter(id => !participantNames[id]);
    if (ids.length === 0) return;
    getParticipantNames(ids).then(names => {
      setParticipantNames(prev => ({ ...prev, ...names }));
    });
  }, [participants]);

  return {
    room,
    participants,
    participantNames,
    messages,
    isHost,
    loading,
    error,
    createRoom: handleCreateRoom,
    joinRoom: handleJoinRoom,
    leaveRoom: handleLeaveRoom,
    broadcastPlayback,
    sendMessage: handleSendMessage,
    SYNC_TOLERANCE,
  };
}
