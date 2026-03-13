import { supabase } from "@/integrations/supabase/client";

function getBaseDeviceId(): string {
  let id = localStorage.getItem("cineflow_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("cineflow_device_id", id);
  }
  return id;
}

function getActiveProfileId(): string | null {
  try {
    const raw = localStorage.getItem("lyneflix_active_profile");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.id === "string" ? parsed.id : null;
  } catch {
    return null;
  }
}

export function getScopedWatchProgressDeviceId(): string {
  const base = getBaseDeviceId();
  const profileId = getActiveProfileId();
  return profileId ? `${base}:${profileId}` : `${base}:guest`;
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
  const device_id = getScopedWatchProgressDeviceId();
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
  const device_id = getScopedWatchProgressDeviceId();
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

export async function getLatestSeriesProgress(
  tmdb_id: number,
  content_type: string
): Promise<{ season: number; episode: number; progress_seconds: number; duration_seconds: number; completed: boolean } | null> {
  const device_id = getScopedWatchProgressDeviceId();
  const normalized = content_type === "movie" ? "movie" : "series";
  const contentTypes = normalized === "series" ? ["series", "tv"] : ["movie"];

  const { data } = await supabase
    .from("watch_progress")
    .select("season, episode, progress_seconds, duration_seconds, completed, updated_at")
    .eq("device_id", device_id)
    .eq("tmdb_id", tmdb_id)
    .in("content_type", contentTypes)
    .not("season", "is", null)
    .not("episode", "is", null)
    .order("updated_at", { ascending: false })
    .limit(30);

  if (!data?.length) return null;

  const preferred = data.find((row) => !row.completed && Number(row.progress_seconds) > 30) ?? data[0];
  if (!preferred || preferred.season == null || preferred.episode == null) return null;

  return {
    season: preferred.season,
    episode: preferred.episode,
    progress_seconds: Number(preferred.progress_seconds),
    duration_seconds: Number(preferred.duration_seconds),
    completed: preferred.completed,
  };
}

export async function getEpisodeProgress(
  tmdb_id: number,
  content_type: string
): Promise<Map<string, { progress: number; duration: number; completed: boolean }>> {
  const device_id = getScopedWatchProgressDeviceId();
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
