import { supabase } from "@/integrations/supabase/client";

export interface WatchRoom {
  id: string;
  host_profile_id: string;
  room_code: string;
  tmdb_id: number;
  content_type: string;
  season: number | null;
  episode: number | null;
  title: string;
  poster_path: string | null;
  status: string;
  max_participants: number;
  room_mode: "chat" | "call";
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface RoomParticipant {
  id: string;
  room_id: string;
  profile_id: string;
  role: string;
  joined_at: string;
  last_heartbeat: string;
}

export async function createRoom(params: {
  hostProfileId: string;
  tmdbId: number;
  contentType: string;
  title: string;
  posterPath?: string;
  season?: number;
  episode?: number;
  roomMode?: "chat" | "call";
}): Promise<WatchRoom | null> {
  const { data, error } = await supabase
    .from("watch_rooms")
    .insert({
      host_profile_id: params.hostProfileId,
      tmdb_id: params.tmdbId,
      content_type: params.contentType,
      title: params.title,
      poster_path: params.posterPath || null,
      season: params.season || null,
      episode: params.episode || null,
      room_code: "", // trigger generates it
      room_mode: params.roomMode || "chat",
    } as any)
    .select()
    .single();

  if (error) {
    console.error("[WatchRoom] Create error:", error.message);
    throw new Error(error.message);
  }

  // Auto-join as host
  if (data) {
    await supabase.from("watch_room_participants").insert({
      room_id: data.id,
      profile_id: params.hostProfileId,
      role: "host",
    });
  }

  return data as WatchRoom;
}

export async function joinRoom(roomCode: string, profileId: string): Promise<WatchRoom | null> {
  const { data: room, error } = await supabase
    .from("watch_rooms")
    .select("*")
    .eq("room_code", roomCode.toUpperCase().trim())
    .neq("status", "closed")
    .maybeSingle();

  if (error || !room) {
    throw new Error("Sala não encontrada ou já encerrada.");
  }

  const { error: joinError } = await supabase
    .from("watch_room_participants")
    .insert({
      room_id: room.id,
      profile_id: profileId,
      role: "viewer",
    });

  if (joinError) {
    if (joinError.message.includes("duplicate")) {
      // Already in the room
      return room as WatchRoom;
    }
    throw new Error(joinError.message);
  }

  return room as WatchRoom;
}

export async function leaveRoom(roomId: string, profileId: string) {
  await supabase
    .from("watch_room_participants")
    .delete()
    .eq("room_id", roomId)
    .eq("profile_id", profileId);
}

export async function closeRoom(roomId: string) {
  await supabase
    .from("watch_rooms")
    .update({ status: "closed" })
    .eq("id", roomId);
}

export async function getActiveRoom(profileId: string): Promise<WatchRoom | null> {
  // Check if user hosts an active room
  const { data } = await supabase
    .from("watch_rooms")
    .select("*")
    .eq("host_profile_id", profileId)
    .neq("status", "closed")
    .maybeSingle();

  return (data as WatchRoom) || null;
}

export async function getRoomParticipants(roomId: string): Promise<RoomParticipant[]> {
  const { data } = await supabase
    .from("watch_room_participants")
    .select("*")
    .eq("room_id", roomId);

  return (data as RoomParticipant[]) || [];
}

export async function sendHeartbeat(roomId: string, profileId: string) {
  await supabase
    .from("watch_room_participants")
    .update({ last_heartbeat: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("profile_id", profileId);
}

export async function sendChatMessage(roomId: string, profileId: string, message: string) {
  const { error } = await supabase
    .from("watch_room_messages")
    .insert({ room_id: roomId, profile_id: profileId, message: message.slice(0, 500) });

  if (error) throw new Error(error.message);
}

export async function getChatMessages(roomId: string, limit = 50) {
  const { data } = await supabase
    .from("watch_room_messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(limit);

  return data || [];
}

export async function getParticipantNames(profileIds: string[]): Promise<Record<string, string>> {
  if (!profileIds.length) return {};
  const { data } = await supabase
    .from("user_profiles")
    .select("id, name")
    .in("id", profileIds);
  const map: Record<string, string> = {};
  data?.forEach(p => { map[p.id] = p.name; });
  return map;
}
