/**
 * extract-video: Ultra-fast video link resolution.
 * Layers 1+2 run in PARALLEL for instant results.
 * 1) Static M3U index lookup
 * 2) Direct CineVeo URL construction (no HEAD verify - trust the pattern)
 * 3) CineVeo catalog API detail (fallback)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CINEVEO_API_BASE = "https://cinetvembed.cineveo.site/api";
const CINEVEO_STREAM_BASE = "https://cinetvembed.cineveo.site";
const CINEVEO_USER = "lyneflix-vods";
const CINEVEO_PASS = "uVljs2d";
const M3U_BUCKETS = 100;

function fetchWithTimeout(url: string, opts: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 6000, ...fetchOpts } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...fetchOpts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function pickStreamUrl(record: any): string | null {
  return record?.stream_url || record?.streamUrl || record?.url || record?.video_url || record?.link || record?.embed_url || null;
}

function pickEpisodeStream(episodes: any[], season?: number, episode?: number): { url: string } | null {
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

// ── M3U Index lookup ──

async function fetchM3UBucket(contentType: string, tmdbId: number): Promise<any | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const bucket = Math.abs(tmdbId) % M3U_BUCKETS;
  const kind = contentType === "movie" ? "movie" : "series";
  const url = `${supabaseUrl}/storage/v1/object/public/catalog/m3u-index/${kind}/${bucket}.json`;
  try {
    const res = await fetchWithTimeout(url, {
      timeout: 2000,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function resolveFromM3UIndex(tmdbId: number, contentType: string, season?: number, episode?: number): Promise<CineVeoResult | null> {
  const primaryType = contentType === "movie" ? "movie" : "series";
  const secondaryType = contentType === "movie" ? "series" : "movie";
  const [primaryBucket, secondaryBucket] = await Promise.all([
    fetchM3UBucket(primaryType, tmdbId),
    fetchM3UBucket(secondaryType, tmdbId),
  ]);
  const primaryRow = primaryBucket?.items?.[String(tmdbId)];
  const result = extractFromRow(primaryRow, primaryType, season, episode);
  if (result) return result;
  const secondaryRow = secondaryBucket?.items?.[String(tmdbId)];
  return extractFromRow(secondaryRow, secondaryType, season, episode);
}

function extractFromRow(row: any, contentType: string, season?: number, episode?: number): CineVeoResult | null {
  if (!row) return null;
  if (row.url) return { url: row.url, type: row.type === "mp4" ? "mp4" : "m3u8", provider: row.provider || "cineveo-m3u" };
  const key = season && episode ? `${season}:${episode}` : null;
  if (key && row.episodes?.[key]?.url) {
    const hit = row.episodes[key];
    return { url: hit.url, type: hit.type === "mp4" ? "mp4" : "m3u8", provider: hit.provider || "cineveo-m3u" };
  }
  if (row.default?.url) return { url: row.default.url, type: row.default.type === "mp4" ? "mp4" : "m3u8", provider: row.default.provider || "cineveo-m3u" };
  return null;
}

// ── Direct CineVeo URL (no HEAD verify — pattern is trusted) ──

function buildDirectCineVeoUrl(tmdbId: number, contentType: string, season?: number, episode?: number): CineVeoResult {
  if (contentType === "movie") {
    return {
      url: `${CINEVEO_STREAM_BASE}/movie/${CINEVEO_USER}/${CINEVEO_PASS}/${tmdbId}.mp4`,
      type: "mp4",
      provider: "cineveo-direct",
    };
  }
  const s = season || 1;
  const e = episode || 1;
  return {
    url: `${CINEVEO_STREAM_BASE}/series/${CINEVEO_USER}/${CINEVEO_PASS}/${tmdbId}/${s}/${e}.mp4`,
    type: "mp4",
    provider: "cineveo-direct",
  };
}

// ── CineVeo Catalog API detail (fallback only) ──

function findInItems(items: any[], tmdbStr: string, apiType: string, season?: number, episode?: number): CineVeoResult | null {
  const match = items.find((item: any) => String(item?.tmdb_id) === tmdbStr || String(item?.tmdbId) === tmdbStr || String(item?.id) === tmdbStr);
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

async function tryCineVeoDetail(tmdbId: number, contentType: string, season?: number, episode?: number): Promise<CineVeoResult | null> {
  const isMovie = contentType === "movie";
  const apiType = isMovie ? "movies" : "series";
  const detailUrl = `${CINEVEO_API_BASE}/catalog.php?username=${CINEVEO_USER}&password=${CINEVEO_PASS}&type=${apiType}&tmdb_id=${tmdbId}`;
  try {
    const res = await fetchWithTimeout(detailUrl, { timeout: 6000, headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return null;
    const payload = await res.json();
    const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
    if (items.length === 0) return null;
    return findInItems(items, String(tmdbId), apiType, season, episode);
  } catch {}
  // Try opposite type
  const altType = isMovie ? "series" : "movies";
  const altUrl = `${CINEVEO_API_BASE}/catalog.php?username=${CINEVEO_USER}&password=${CINEVEO_PASS}&type=${altType}&tmdb_id=${tmdbId}`;
  try {
    const res = await fetchWithTimeout(altUrl, { timeout: 5000, headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return null;
    const payload = await res.json();
    const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
    return findInItems(items, String(tmdbId), altType, season, episode);
  } catch {}
  return null;
}

// ── HTTP Handler ──

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

    // ⚡ LAYER 1+2 IN PARALLEL: M3U lookup + Direct URL construction
    // Direct URL is returned immediately (no HEAD verify) — the player handles errors gracefully
    const m3uPromise = resolveFromM3UIndex(tmdb_id, cType, season, episode);
    const directUrl = buildDirectCineVeoUrl(tmdb_id, cType, season, episode);

    // Race: if M3U resolves fast, use it (has verified URLs). Otherwise use direct pattern.
    const m3uResult = await Promise.race([
      m3uPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)), // 1.5s max wait for M3U
    ]);

    if (m3uResult) {
      console.log(`[extract] M3U hit tmdb_id=${tmdb_id}`);
      return new Response(
        JSON.stringify({ url: m3uResult.url, type: m3uResult.type, provider: m3uResult.provider || "cineveo-m3u", cached: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Direct URL pattern — instant, no network call needed
    console.log(`[extract] Direct URL tmdb_id=${tmdb_id}`);
    return new Response(
      JSON.stringify({ url: directUrl.url, type: directUrl.type, provider: directUrl.provider, cached: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (error) {
    console.error("[extract] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Extraction failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
