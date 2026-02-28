/**
 * extract-video: Ultra-fast video link resolution.
 * Layers: 1) M3U index  2) Direct URL  3) CineVeo API (fallback for missing eps)
 * Layer 3 ensures ALL episodes available on CineVeo are returned even if not in shards.
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

// ── Direct CineVeo URL (pattern-based) ──

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

// ── Verify direct URL actually works (quick HEAD) ──

async function verifyUrl(url: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(url, {
      method: "HEAD",
      timeout: 3000,
      headers: { "User-Agent": UA },
    });
    // Accept 200-299 and 302/301 redirects as valid
    return res.ok || res.status === 301 || res.status === 302;
  } catch {
    return false;
  }
}

// ── CineVeo Catalog API detail (live lookup) ──

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
    const res = await fetchWithTimeout(detailUrl, { timeout: 8000, headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const payload = await res.json();
    const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
    if (items.length > 0) {
      const result = findInItems(items, String(tmdbId), apiType, season, episode);
      if (result) return result;
    }
  } catch (e) {
    console.warn(`[extract] CineVeo API ${apiType} failed:`, e);
  }
  // Try opposite type as fallback
  const altType = isMovie ? "series" : "movies";
  const altUrl = `${CINEVEO_API_BASE}/catalog.php?username=${CINEVEO_USER}&password=${CINEVEO_PASS}&type=${altType}&tmdb_id=${tmdbId}`;
  try {
    const res = await fetchWithTimeout(altUrl, { timeout: 6000, headers: { "User-Agent": UA, Accept: "application/json" } });
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
    const isSeries = cType !== "movie";

    // ⚡ LAYER 1: M3U index (fast, from storage shards)
    const m3uResult = await Promise.race([
      resolveFromM3UIndex(tmdb_id, cType, season, episode),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);

    if (m3uResult) {
      console.log(`[extract] M3U hit tmdb=${tmdb_id} s=${season} e=${episode}`);
      return new Response(
        JSON.stringify({ url: m3uResult.url, type: m3uResult.type, provider: m3uResult.provider || "cineveo-m3u", cached: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ⚡ LAYER 2: Direct URL pattern + HEAD verify (for series episodes)
    const directUrl = buildDirectCineVeoUrl(tmdb_id, cType, season, episode);

    if (!isSeries) {
      // Movies: trust the direct pattern (fast)
      console.log(`[extract] Direct movie tmdb=${tmdb_id}`);
      return new Response(
        JSON.stringify({ url: directUrl.url, type: directUrl.type, provider: directUrl.provider, cached: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Series: verify direct URL first, if fails → API fallback
    // Run HEAD verify and API lookup in PARALLEL for speed
    const [directValid, apiResult] = await Promise.all([
      verifyUrl(directUrl.url),
      tryCineVeoDetail(tmdb_id, cType, season, episode),
    ]);

    if (directValid) {
      console.log(`[extract] Direct series verified tmdb=${tmdb_id} s=${season} e=${episode}`);
      return new Response(
        JSON.stringify({ url: directUrl.url, type: directUrl.type, provider: "cineveo-direct-verified", cached: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (apiResult) {
      console.log(`[extract] API fallback hit tmdb=${tmdb_id} s=${season} e=${episode}`);
      return new Response(
        JSON.stringify({ url: apiResult.url, type: apiResult.type, provider: apiResult.provider || "cineveo-api", cached: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Last resort: return direct URL anyway (player handles errors)
    console.log(`[extract] Last resort direct tmdb=${tmdb_id} s=${season} e=${episode}`);
    return new Response(
      JSON.stringify({ url: directUrl.url, type: directUrl.type, provider: "cineveo-direct-unverified", cached: false }),
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
