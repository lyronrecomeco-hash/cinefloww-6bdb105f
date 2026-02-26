import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const CINEVEO_API_BASE = "https://cinetvembed.cineveo.site/api";
const CINEVEO_USER = "lyneflix-vods";
const CINEVEO_PASS = "uVljs2d";

// ── Helpers ─────────────────────────────────────────────────────────
function fetchWithTimeout(url: string, opts: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 8000, ...fetchOpts } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...fetchOpts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function normalizeAudioLabel(input?: string): "dublado" | "legendado" | "cam" {
  const v = (input || "").toLowerCase();
  if (v.includes("dub") || v.includes("pt") || v.includes("port")) return "dublado";
  if (v.includes("cam")) return "cam";
  return "legendado";
}

function pickStreamUrl(record: any): string | null {
  return record?.stream_url || record?.streamUrl || record?.url || record?.video_url || record?.link || record?.embed_url || null;
}

function isLikelyBrokenCineveoUrl(url?: string, provider?: string): boolean {
  if (!url) return true;
  if ((provider || "").toLowerCase() !== "cineveo-api") return false;
  return /cdn\.cineveo\.site\/.*%2520/i.test(url);
}

function pickEpisodeStream(
  episodes: any[],
  season?: number,
  episode?: number,
): { url: string; audio: "dublado" | "legendado" | "cam" } | null {
  if (!Array.isArray(episodes) || episodes.length === 0) return null;
  const normalized = episodes
    .map((ep) => ({
      season: Number(ep?.season ?? ep?.temporada ?? ep?.s ?? 1) || 1,
      episode: Number(ep?.episode ?? ep?.ep ?? ep?.e ?? 1) || 1,
      audio: normalizeAudioLabel(ep?.language || ep?.audio || ep?.lang),
      url: pickStreamUrl(ep),
    }))
    .filter((ep) => !!ep.url);
  if (!normalized.length) return null;
  let candidates = normalized;
  if (season && episode) {
    const exact = normalized.filter((ep) => ep.season === season && ep.episode === episode);
    if (exact.length) candidates = exact;
  }
  const audioRank = (a: string) => a === "dublado" ? 3 : a === "legendado" ? 2 : 1;
  const best = candidates.sort((a, b) => audioRank(b.audio) - audioRank(a.audio))[0];
  return best?.url ? { url: best.url, audio: best.audio } : null;
}

// ── CineVeo Catalog: INTERLEAVED parallel scan ──────────────────────
// Scans BOTH movies and series simultaneously to handle content_type mismatches.
// Each batch fetches pages from both types concurrently.
interface CineVeoResult {
  url: string;
  type: "mp4" | "m3u8";
  apiType: string;
}

async function fetchCatalogPage(apiType: string, page: number): Promise<any[] | null> {
  const url = `${CINEVEO_API_BASE}/catalog.php?username=${CINEVEO_USER}&password=${CINEVEO_PASS}&type=${apiType}&page=${page}`;
  try {
    const res = await fetchWithTimeout(url, {
      timeout: 10000,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const payload = await res.json();
    return Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  } catch {
    return null;
  }
}

function findInItems(items: any[], tmdbStr: string, apiType: string, season?: number, episode?: number): CineVeoResult | null {
  const match = items.find((item: any) =>
    String(item?.tmdb_id) === tmdbStr || String(item?.tmdbId) === tmdbStr
  );
  if (!match) return null;

  let streamUrl: string | null = null;
  if (apiType === "movies") {
    streamUrl = pickStreamUrl(match);
  } else {
    const epCandidate = pickEpisodeStream(match?.episodes || [], season, episode);
    streamUrl = epCandidate?.url || pickStreamUrl(match);
  }

  if (!streamUrl) return null;
  const type: "mp4" | "m3u8" = streamUrl.includes(".m3u8") ? "m3u8" : "mp4";
  return { url: streamUrl, type, apiType };
}

async function tryCineveoCatalog(
  tmdbId: number,
  contentType: string,
  season?: number,
  episode?: number,
): Promise<CineVeoResult | null> {
  const tmdbStr = String(tmdbId);
  const isMovie = contentType === "movie";

  // Prioritize expected type but scan both simultaneously
  const MOVIES_TOTAL = 1200; // approximate, slightly over to be safe
  const SERIES_TOTAL = 400;
  const PAGES_PER_BATCH = 15; // pages per type per batch
  const MAX_BATCHES = 25; // max 375 pages per type

  // Prioritize: scan the expected type with more pages
  const primaryType = isMovie ? "movies" : "series";
  const secondaryType = isMovie ? "series" : "movies";
  const primaryTotal = isMovie ? MOVIES_TOTAL : SERIES_TOTAL;
  const secondaryTotal = isMovie ? SERIES_TOTAL : MOVIES_TOTAL;

  let primaryPage = 1;
  let secondaryPage = 1;
  let primaryDone = false;
  let secondaryDone = false;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    if (primaryDone && secondaryDone) break;

    const fetches: Array<{ apiType: string; page: number; promise: Promise<any[] | null> }> = [];

    // Add primary type pages
    if (!primaryDone) {
      for (let i = 0; i < PAGES_PER_BATCH && primaryPage <= primaryTotal; i++, primaryPage++) {
        fetches.push({
          apiType: primaryType,
          page: primaryPage,
          promise: fetchCatalogPage(primaryType, primaryPage),
        });
      }
      if (primaryPage > primaryTotal) primaryDone = true;
    }

    // Add secondary type pages (fewer per batch to prioritize primary)
    if (!secondaryDone) {
      const secBatchSize = Math.min(PAGES_PER_BATCH, 10);
      for (let i = 0; i < secBatchSize && secondaryPage <= secondaryTotal; i++, secondaryPage++) {
        fetches.push({
          apiType: secondaryType,
          page: secondaryPage,
          promise: fetchCatalogPage(secondaryType, secondaryPage),
        });
      }
      if (secondaryPage > secondaryTotal) secondaryDone = true;
    }

    if (fetches.length === 0) break;

    // Execute all page fetches concurrently
    const results = await Promise.allSettled(fetches.map(f => f.promise));

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status !== "fulfilled" || !r.value || r.value.length === 0) continue;
      const found = findInItems(r.value, tmdbStr, fetches[i].apiType, season, episode);
      if (found) {
        console.log(`[cineveo-api] Found tmdb_id=${tmdbId} in ${fetches[i].apiType} page=${fetches[i].page}`);
        return found;
      }
    }
  }

  console.log(`[cineveo-api] tmdb_id=${tmdbId} not found (scanned ~${primaryPage - 1} ${primaryType} + ~${secondaryPage - 1} ${secondaryType} pages)`);
  return null;
}

// ── Main handler ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tmdb_id, content_type, audio_type, season, episode, force_provider, title: reqTitle } = await req.json();

    if (!tmdb_id) {
      return new Response(JSON.stringify({ error: "tmdb_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cType = content_type || "movie";
    const aType = audio_type || "dublado";
    const isMovie = cType === "movie";
    // Broader cache search: check all possible content_type variants
    const cacheTypes = [cType];
    if (cType === "tv" || cType === "series") {
      cacheTypes.push("tv", "series");
    } else {
      cacheTypes.push("series"); // some movies are actually series in CineVeo
    }
    const uniqueCacheTypes = [...new Set(cacheTypes)];

    // ─── 1. Cache lookup (video_cache) ───────────────────────────────
    if (!force_provider) {
      const providerRank = (provider?: string) => {
        const p = (provider || "").toLowerCase();
        if (p === "manual") return 130;
        if (p === "cineveo-api") return 120;
        if (p === "cineveo-iptv") return 110;
        if (p === "cineveo") return 100;
        return 70;
      };

      const pickBest = (rows: any[]) => (rows || [])
        .filter((row: any) => row?.video_url && row?.video_type !== "mega-embed" && !isLikelyBrokenCineveoUrl(row?.video_url, row?.provider))
        .sort((a: any, b: any) => providerRank(b.provider) - providerRank(a.provider))[0] || null;

      let baseQuery = supabase
        .from("video_cache")
        .select("video_url, video_type, provider, created_at, season, episode")
        .eq("tmdb_id", tmdb_id)
        .in("content_type", uniqueCacheTypes)
        .gt("expires_at", new Date().toISOString());

      if (season) baseQuery = baseQuery.eq("season", season);
      else if (isMovie) baseQuery = baseQuery.eq("season", 0);
      if (episode) baseQuery = baseQuery.eq("episode", episode);
      else if (isMovie) baseQuery = baseQuery.eq("episode", 0);

      const { data: cachedRows } = await baseQuery.eq("audio_type", aType).order("created_at", { ascending: false }).limit(20);
      let bestCached = pickBest(cachedRows || []);

      if (!bestCached) {
        const { data: anyAudioRows } = await baseQuery.order("created_at", { ascending: false }).limit(20);
        bestCached = pickBest(anyAudioRows || []);
      }

      if (bestCached?.video_url) {
        console.log(`[extract] Cache hit for tmdb_id=${tmdb_id} provider=${bestCached.provider}`);
        return new Response(JSON.stringify({
          url: bestCached.video_url, type: bestCached.video_type,
          provider: bestCached.provider, cached: true,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ─── 1b. Backup cache fallback ─────────────────────────────────
      const { data: backupRows } = await supabase
        .from("video_cache_backup")
        .select("video_url, video_type, provider, season, episode")
        .eq("tmdb_id", tmdb_id)
        .in("content_type", uniqueCacheTypes)
        .limit(10);

      const bestBackup = pickBest(backupRows || []);
      if (bestBackup?.video_url) {
        console.log(`[extract] Backup cache hit for tmdb_id=${tmdb_id}`);
        await supabase.from("video_cache").upsert({
          tmdb_id, content_type: cType, audio_type: aType,
          season: season || 0, episode: episode || 0,
          video_url: bestBackup.video_url, video_type: bestBackup.video_type,
          provider: bestBackup.provider,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: "tmdb_id,content_type,audio_type,season,episode" });

        return new Response(JSON.stringify({
          url: bestBackup.video_url, type: bestBackup.video_type,
          provider: bestBackup.provider, cached: true,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ─── 2. CineVeo Catalog API (interleaved parallel scan) ─────────
    console.log(`[extract] Scanning CineVeo for tmdb_id=${tmdb_id} type=${cType}`);
    const result = await tryCineveoCatalog(tmdb_id, cType, season, episode);

    if (result) {
      const cacheContentType = result.apiType === "series" ? "series" : "movie";
      console.log(`[extract] Success: ${result.apiType} → ${result.url}`);

      await supabase.from("video_cache").upsert({
        tmdb_id, content_type: cacheContentType, audio_type: aType,
        season: season || 0, episode: episode || 0,
        video_url: result.url, video_type: result.type, provider: "cineveo-api",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "tmdb_id,content_type,audio_type,season,episode" });

      await supabase.from("resolve_logs").insert({
        tmdb_id, title: reqTitle || `TMDB ${tmdb_id}`, content_type: cacheContentType,
        season: season || 0, episode: episode || 0,
        provider: "cineveo-api", video_url: result.url, video_type: result.type, success: true,
      });

      return new Response(JSON.stringify({
        url: result.url, type: result.type, provider: "cineveo-api", cached: false,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── 3. Not found ───────────────────────────────────────────────
    await supabase.from("resolve_logs").insert({
      tmdb_id, title: reqTitle || `TMDB ${tmdb_id}`, content_type: cType,
      season: season || 0, episode: episode || 0,
      provider: "cineveo-api", success: false,
      error_message: "Não encontrado no catálogo CineVeo",
    });

    return new Response(JSON.stringify({
      url: null, provider: "none", message: "Nenhum vídeo encontrado via catálogo CineVeo",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[extract] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Extraction failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
