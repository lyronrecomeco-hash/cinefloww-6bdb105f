import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * extract-video: Real-time CineVeo API lookup.
 * Searches the CineVeo catalog API by tmdb_id and returns the stream_url directly.
 * Supports: movies, series, animes.
 * No proxy, no token — raw URL for direct player consumption.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CINEVEO_API = "https://cineveo.lat/api/catalog.php";
const CUSER = "lyneflix-vods";
const CPASS = "uVljs2d";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = SB_URL && SB_SERVICE_ROLE
  ? createClient(SB_URL, SB_SERVICE_ROLE, { auth: { persistSession: false } })
  : null;

// ── Types ──
interface CineveoEpisode {
  id_link: number;
  season: number;
  episode: number;
  language: string;
  quality: string;
  stream_url: string;
}

interface CineveoItem {
  id: number;
  tmdb_id: number;
  title: string;
  type: string;
  stream_url?: string;
  episodes_count?: number;
  episodes?: CineveoEpisode[];
}

interface ApiPage {
  data: CineveoItem[];
  totalPages: number;
}

const inferTypeFromUrl = (url: string) => (url.toLowerCase().includes(".m3u8") ? "m3u8" : "mp4");

async function getCachedVideo(
  tmdbId: number,
  contentType: "movie" | "series",
  season?: number,
  episode?: number,
): Promise<{ url: string; type: string; provider: string; cached: boolean } | null> {
  if (!db) return null;

  try {
    const nowIso = new Date().toISOString();
    const { data: liveRows } = await db
      .from("video_cache")
      .select("video_url, video_type, provider, season, episode, created_at")
      .eq("tmdb_id", tmdbId)
      .eq("content_type", contentType)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(50);

    const matchLive = (liveRows ?? []).find((row: any) => {
      if (contentType === "movie") return true;
      return Number(row.season ?? 0) === Number(season ?? 1) && Number(row.episode ?? 0) === Number(episode ?? 1);
    });

    if (matchLive?.video_url) {
      return {
        url: matchLive.video_url,
        type: matchLive.video_type || inferTypeFromUrl(matchLive.video_url),
        provider: matchLive.provider || "video-cache",
        cached: true,
      };
    }

    const { data: backupRows } = await db
      .from("video_cache_backup")
      .select("video_url, video_type, provider, season, episode, backed_up_at")
      .eq("tmdb_id", tmdbId)
      .eq("content_type", contentType)
      .order("backed_up_at", { ascending: false })
      .limit(50);

    const matchBackup = (backupRows ?? []).find((row: any) => {
      if (contentType === "movie") return true;
      return Number(row.season ?? 0) === Number(season ?? 1) && Number(row.episode ?? 0) === Number(episode ?? 1);
    });

    if (matchBackup?.video_url) {
      return {
        url: matchBackup.video_url,
        type: matchBackup.video_type || inferTypeFromUrl(matchBackup.video_url),
        provider: matchBackup.provider || "video-cache-backup",
        cached: true,
      };
    }
  } catch (err) {
    console.log(`[extract] cache lookup failed for tmdb=${tmdbId}: ${err}`);
  }

  return null;
}

// ── Fetch a single API page ──
async function fetchApiPage(apiType: string, page: number): Promise<ApiPage | null> {
  try {
    const url = `${CINEVEO_API}?username=${CUSER}&password=${CPASS}&type=${apiType}&page=${page}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    clearTimeout(t);
    if (!res.ok) {
      console.log(`[extract] API responded ${res.status} for ${apiType} page ${page}`);
      return null;
    }
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      console.log(`[extract] API returned non-JSON for ${apiType} page ${page}: ${text.substring(0, 200)}`);
      return null;
    }
    if (!json.success) {
      console.log(`[extract] API success=false for ${apiType} page ${page}: ${JSON.stringify(json).substring(0, 200)}`);
      return null;
    }
    const items = json.data || [];
    if (page === 1) {
      console.log(`[extract] ${apiType} p1: ${items.length} items, totalPages=${json.pagination?.total_pages || 0}`);
      if (items.length > 0) {
        console.log(`[extract] First item tmdb_id=${items[0].tmdb_id} title="${items[0].title}"`);
      }
    }
    return { data: items, totalPages: json.pagination?.total_pages || 0 };
  } catch (err) {
    console.log(`[extract] API fetch error for ${apiType} page ${page}: ${err}`);
    return null;
  }
}

// ── Find movie stream_url in a list of items ──
function findMovie(items: CineveoItem[], tmdbId: number): string | null {
  const item = items.find(i => i.tmdb_id === tmdbId);
  return item?.stream_url || null;
}

// ── Find episode stream_url in a list of items ──
function findEpisode(items: CineveoItem[], tmdbId: number, season: number, episode: number): string | null {
  const item = items.find(i => i.tmdb_id === tmdbId);
  if (!item) return null;

  // If item has episodes array, try to match
  if (item.episodes && item.episodes.length > 0) {
    // Try exact match first
    const exact = item.episodes.find(e => e.season === season && e.episode === episode);
    if (exact) return exact.stream_url;

    // If episode numbers are 0 (API quirk), match by index within season
    const seasonEps = item.episodes.filter(e => e.season === season);
    if (seasonEps.length > 0 && seasonEps[0].episode === 0) {
      const idx = episode - 1;
      if (idx >= 0 && idx < seasonEps.length) return seasonEps[idx].stream_url;
    }

    // Fallback: if only one season exists and episodes match by count
    if (seasonEps.length === 0 && item.episodes.length >= episode) {
      return item.episodes[episode - 1]?.stream_url || null;
    }
  }

  // CRITICAL FALLBACK: If no episodes data but item has stream_url, return it
  // This handles series where CineVeo only provides a single stream_url
  if (item.stream_url) {
    console.log(`[extract] Using item.stream_url fallback for tmdb=${tmdbId}`);
    return item.stream_url;
  }

  return null;
}

// ── Search API pages in parallel batches ──
async function searchApi(
  tmdbId: number,
  apiType: string,
  isMovie: boolean,
  season?: number,
  episode?: number,
): Promise<{ url: string; type: string } | null> {
  // Fetch page 1 to get total and check
  const p1 = await fetchApiPage(apiType, 1);
  if (!p1 || p1.data.length === 0) return null;

  const url1 = isMovie
    ? findMovie(p1.data, tmdbId)
    : findEpisode(p1.data, tmdbId, season || 1, episode || 1);
  if (url1) {
    return { url: url1, type: url1.endsWith(".m3u8") ? "m3u8" : "mp4" };
  }

  const totalPages = p1.totalPages;
  if (totalPages <= 1) return null;

  // Search remaining pages in parallel batches of 50
  const BATCH = 50;
  for (let start = 2; start <= totalPages; start += BATCH) {
    const end = Math.min(start + BATCH - 1, totalPages);
    const promises: Promise<string | null>[] = [];

    for (let p = start; p <= end; p++) {
      promises.push(
        fetchApiPage(apiType, p).then(res => {
          if (!res) return null;
          return isMovie
            ? findMovie(res.data, tmdbId)
            : findEpisode(res.data, tmdbId, season || 1, episode || 1);
        })
      );
    }

    const results = await Promise.all(promises);
    const match = results.find(r => r !== null);
    if (match) {
      return { url: match, type: match.endsWith(".m3u8") ? "m3u8" : "mp4" };
    }
  }

  return null;
}

// ── Main handler ──
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const tmdbId = body.tmdb_id;
    const cType = body.content_type || "movie";
    const season = body.season;
    const episode = body.episode;

    if (!tmdbId) {
      return new Response(JSON.stringify({ error: "tmdb_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isMovie = cType === "movie";
    let result: { url: string; type: string } | null = null;

    console.log(`[extract] tmdb=${tmdbId} type=${cType} s=${season} e=${episode}`);

    if (isMovie) {
      // Search movies catalog
      result = await searchApi(tmdbId, "movies", true);
    } else {
      // Try animes first (smaller catalog ~37 pages), then series (~87 pages)
      result = await searchApi(tmdbId, "animes", false, season, episode);
      if (!result) {
        result = await searchApi(tmdbId, "series", false, season, episode);
      }
    }

    if (result) {
      console.log(`[extract] Found: ${result.url.substring(0, 80)} (${result.type})`);
      return new Response(JSON.stringify({
        url: result.url,
        type: result.type,
        provider: "cineveo-api",
        cached: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Not found in any catalog
    console.log(`[extract] Not found in CineVeo API for tmdb=${tmdbId}`);
    return new Response(JSON.stringify({
      url: null,
      type: null,
      provider: null,
      error: "Conteúdo não encontrado no catálogo",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Extraction failed";
    console.error("[extract] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
