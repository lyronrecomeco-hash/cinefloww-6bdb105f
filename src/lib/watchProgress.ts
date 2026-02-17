import { supabase } from "@/integrations/supabase/client";

// Generate a persistent device ID for anonymous watch tracking
function getDeviceId(): string {
  let id = localStorage.getItem("cineflow_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("cineflow_device_id", id);
  }
  return id;
}

export interface WatchProgressData {
  tmdb_id: number;
  content_type: string;
  season?: number;
  episode?: number;
  progress_seconds: number;
  duration_seconds: number;
  completed: boolean;
}

export async function saveWatchProgress(data: WatchProgressData) {
  const device_id = getDeviceId();
  const { error } = await supabase.from("watch_progress").upsert(
    {
      device_id,
      tmdb_id: data.tmdb_id,
      content_type: data.content_type,
      season: data.season || null,
      episode: data.episode || null,
      progress_seconds: data.progress_seconds,
      duration_seconds: data.duration_seconds,
      completed: data.completed,
    },
    { onConflict: "device_id,tmdb_id,content_type,season,episode" }
  );
  if (error) console.error("[watchProgress] save error:", error);
}

export async function getWatchProgress(
  tmdb_id: number,
  content_type: string,
  season?: number,
  episode?: number
): Promise<WatchProgressData | null> {
  const device_id = getDeviceId();
  let query = supabase
    .from("watch_progress")
    .select("*")
    .eq("device_id", device_id)
    .eq("tmdb_id", tmdb_id)
    .eq("content_type", content_type);

  if (season != null) query = query.eq("season", season);
  else query = query.is("season", null);
  if (episode != null) query = query.eq("episode", episode);
  else query = query.is("episode", null);

  const { data } = await query.maybeSingle();
  if (!data) return null;
  return {
    tmdb_id: data.tmdb_id,
    content_type: data.content_type,
    season: data.season ?? undefined,
    episode: data.episode ?? undefined,
    progress_seconds: Number(data.progress_seconds),
    duration_seconds: Number(data.duration_seconds),
    completed: data.completed,
  };
}

export async function getEpisodeProgress(
  tmdb_id: number,
  content_type: string
): Promise<Map<string, { progress: number; duration: number; completed: boolean }>> {
  const device_id = getDeviceId();
  const { data } = await supabase
    .from("watch_progress")
    .select("season, episode, progress_seconds, duration_seconds, completed")
    .eq("device_id", device_id)
    .eq("tmdb_id", tmdb_id)
    .eq("content_type", content_type);

  const map = new Map<string, { progress: number; duration: number; completed: boolean }>();
  data?.forEach((d) => {
    const key = `${d.season}-${d.episode}`;
    map.set(key, {
      progress: Number(d.progress_seconds),
      duration: Number(d.duration_seconds),
      completed: d.completed,
    });
  });
  return map;
}
