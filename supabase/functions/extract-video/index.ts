/**
 * extract-video: On-demand video link resolution.
 * Priority:
 * 1) Static M3U index lookup (ultra-fast, no DB)
 * 2) CineVeo catalog scan fallback
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CINEVEO_API_BASE = "https://cinetvembed.cineveo.site/api";
const CINEVEO_USER = "lyneflix-vods";
const CINEVEO_PASS = "uVljs2d";
const M3U_BUCKETS = 100;

function fetchWithTimeout(url: string, opts: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 8000, ...fetchOpts } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...fetchOpts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function pickStreamUrl(record: any): string | null {
  return record?.stream_url || record?.streamUrl || record?.url || record?.video_url || record?.link || record?.embed_url || null;
}

function pickEpisodeStream(
  episodes: any[],
  season?: number,
  episode?: number,
): { url: string } | null {
  if (!Array.isArray(episodes) || episodes.length === 0) return null;
  const normalized = episodes
    .map((ep) => ({
      season: Number(ep?.season ?? ep?.temporada ?? ep?.s ?? 1) || 1,
      episode: Number(ep?.episode ?? ep?.ep ?? ep?.e ?? 1) || 1,
      url: pickStreamUrl(ep),
    }))
    .filter((ep) => !!ep.url);
  if (!normalized.length) return null;
  let candidates = normalized;
  if (season && episode) {
    const exact = normalized.filter((ep) => ep.season === season && ep.episode === episode);
    if (exact.length) candidates = exact;
  }
  return candidates[0]?.url ? { url: candidates[0].url } : null;
}

interface CineVeoResult {
  url: string;
  type: "mp4" | "m3u8";
  provider?: string;
}

async function fetchM3UBucket(contentType: string, tmdbId: number): Promise<any | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const bucket = Math.abs(tmdbId) % M3U_BUCKETS;
  const kind = contentType === "movie" ? "movie" : "series";
  const url = `${supabaseUrl}/storage/v1/object/public/catalog/m3u-index/${kind}/${bucket}.json`;

  try {
    const res = await fetchWithTimeout(url, {
      timeout: 2500,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function resolveFromM3UIndex(
  tmdbId: number,
  contentType: string,
  season?: number,
  episode?: number,
): Promise<CineVeoResult | null> {
  const bucketData = await fetchM3UBucket(contentType, tmdbId);
  const row = bucketData?.items?.[String(tmdbId)];
  if (!row) return null;

  if (contentType === "movie") {
    if (!row.url) return null;
    return {
      url: row.url,
      type: row.type === "mp4" ? "mp4" : "m3u8",
      provider: row.provider || "cineveo-m3u",
    };
  }

  const key = season && episode ? `${season}:${episode}` : null;
  if (key && row.episodes?.[key]?.url) {
    const hit = row.episodes[key];
    return {
      url: hit.url,
      type: hit.type === "mp4" ? "mp4" : "m3u8",
      provider: hit.provider || "cineveo-m3u",
    };
  }

  if (row.default?.url) {
    return {
      url: row.default.url,
      type: row.default.type === "mp4" ? "mp4" : "m3u8",
      provider: row.default.provider || "cineveo-m3u",
    };
  }

  return null;
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
  return { url: streamUrl, type, provider: "cineveo-api" };
}

async function tryCineveoCatalog(
  tmdbId: number,
  contentType: string,
  season?: number,
  episode?: number,
): Promise<CineVeoResult | null> {
  const tmdbStr = String(tmdbId);
  const isMovie = contentType === "movie";

  // Capped to prevent timeouts — if not in first few pages, it's not there
  const MOVIES_SOFT_MAX = 5;
  const SERIES_SOFT_MAX = 5;
  const PRIMARY_BATCH_SIZE = 5;
  const SECONDARY_BATCH_SIZE = 3;
  const MAX_BATCHES = 2;

  const primaryType = isMovie ? "movies" : "series";
  const secondaryType = isMovie ? "series" : "movies";
  const primaryTotal = isMovie ? MOVIES_SOFT_MAX : SERIES_SOFT_MAX;
  const secondaryTotal = isMovie ? SERIES_SOFT_MAX : MOVIES_SOFT_MAX;

  let primaryPage = 1;
  let secondaryPage = 1;
  let primaryDone = false;
  let secondaryDone = false;
  let primaryEmptyStreak = 0;
  let secondaryEmptyStreak = 0;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    if (primaryDone && secondaryDone) break;

    const fetches: Array<{ apiType: string; page: number; promise: Promise<any[] | null> }> = [];

    if (!primaryDone) {
      for (let i = 0; i < PRIMARY_BATCH_SIZE && primaryPage <= primaryTotal; i++, primaryPage++) {
        fetches.push({ apiType: primaryType, page: primaryPage, promise: fetchCatalogPage(primaryType, primaryPage) });
      }
      if (primaryPage > primaryTotal) primaryDone = true;
    }

    if (!secondaryDone) {
      for (let i = 0; i < SECONDARY_BATCH_SIZE && secondaryPage <= secondaryTotal; i++, secondaryPage++) {
        fetches.push({ apiType: secondaryType, page: secondaryPage, promise: fetchCatalogPage(secondaryType, secondaryPage) });
      }
      if (secondaryPage > secondaryTotal) secondaryDone = true;
    }

    if (fetches.length === 0) break;

    const results = await Promise.allSettled(fetches.map((f) => f.promise));

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status !== "fulfilled") continue;
      const rows = Array.isArray(r.value) ? r.value : [];
      const apiType = fetches[i].apiType;

      if (apiType === primaryType) primaryEmptyStreak = rows.length === 0 ? primaryEmptyStreak + 1 : 0;
      if (apiType === secondaryType) secondaryEmptyStreak = rows.length === 0 ? secondaryEmptyStreak + 1 : 0;

      if (!rows.length) continue;

      const found = findInItems(rows, tmdbStr, apiType, season, episode);
      if (found) {
        console.log(`[extract] Found tmdb_id=${tmdbId} in ${apiType} page=${fetches[i].page}`);
        return found;
      }
    }

    if (primaryEmptyStreak >= 4) primaryDone = true;
    if (secondaryEmptyStreak >= 4) secondaryDone = true;
  }

  console.log(`[extract] tmdb_id=${tmdbId} not found`);
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tmdb_id, content_type, season, episode } = await req.json();

    if (!tmdb_id) {
      return new Response(JSON.stringify({ error: "tmdb_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cType = content_type || "movie";

    // 1) Ultra-fast static M3U lookup first
    const m3uResult = await resolveFromM3UIndex(tmdb_id, cType, season, episode);
    if (m3uResult) {
      console.log(`[extract] M3U hit tmdb_id=${tmdb_id} type=${cType}`);
      return new Response(JSON.stringify({
        url: m3uResult.url,
        type: m3uResult.type,
        provider: m3uResult.provider || "cineveo-m3u",
        cached: false,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2) Fallback: deep CineVeo scan
    console.log(`[extract] Scan fallback tmdb_id=${tmdb_id} type=${cType}`);
    const result = await tryCineveoCatalog(tmdb_id, cType, season, episode);

    if (result) {
      return new Response(JSON.stringify({
        url: result.url,
        type: result.type,
        provider: result.provider || "cineveo-api",
        cached: false,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      url: null,
      provider: "none",
      message: "Nenhum vídeo encontrado",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[extract] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Extraction failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
