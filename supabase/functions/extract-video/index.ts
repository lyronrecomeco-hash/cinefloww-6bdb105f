/**
 * extract-video: On-demand video link resolution.
 * Priority:
 * 1) Static M3U index lookup (ultra-fast, no DB)
 * 2) CineVeo catalog scan fallback (capped)
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

// ── M3U Index lookup (constant-time via shard) ──

async function fetchM3UBucket(contentType: string, tmdbId: number): Promise<any | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const bucket = Math.abs(tmdbId) % M3U_BUCKETS;
  const kind = contentType === "movie" ? "movie" : "series";
  const url = `${supabaseUrl}/storage/v1/object/public/catalog/m3u-index/${kind}/${bucket}.json`;

  try {
    const res = await fetchWithTimeout(url, {
      timeout: 3000,
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
  // Try both types in parallel for maximum hit rate
  const primaryType = contentType === "movie" ? "movie" : "series";
  const secondaryType = contentType === "movie" ? "series" : "movie";

  const [primaryBucket, secondaryBucket] = await Promise.all([
    fetchM3UBucket(primaryType, tmdbId),
    fetchM3UBucket(secondaryType, tmdbId),
  ]);

  // Check primary type first
  const primaryRow = primaryBucket?.items?.[String(tmdbId)];
  const result = extractFromRow(primaryRow, primaryType, season, episode);
  if (result) return result;

  // Fallback: check secondary type
  const secondaryRow = secondaryBucket?.items?.[String(tmdbId)];
  return extractFromRow(secondaryRow, secondaryType, season, episode);
}

function extractFromRow(
  row: any,
  contentType: string,
  season?: number,
  episode?: number,
): CineVeoResult | null {
  if (!row) return null;

  // Movie-style entry (flat url)
  if (row.url) {
    return {
      url: row.url,
      type: row.type === "mp4" ? "mp4" : "m3u8",
      provider: row.provider || "cineveo-m3u",
    };
  }

  // Series-style entry (episodes map + default)
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

// ── CineVeo API fallback (capped scan) ──

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
  const match = items.find(
    (item: any) => String(item?.tmdb_id) === tmdbStr || String(item?.tmdbId) === tmdbStr,
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

  const SOFT_MAX = 5;
  const BATCH_SIZE = 5;
  const MAX_BATCHES = 2;

  const primaryType = isMovie ? "movies" : "series";
  const secondaryType = isMovie ? "series" : "movies";

  let primaryPage = 1;
  let secondaryPage = 1;
  let primaryDone = false;
  let secondaryDone = false;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    if (primaryDone && secondaryDone) break;

    const fetches: Array<{ apiType: string; page: number; promise: Promise<any[] | null> }> = [];

    if (!primaryDone) {
      for (let i = 0; i < BATCH_SIZE && primaryPage <= SOFT_MAX; i++, primaryPage++) {
        fetches.push({ apiType: primaryType, page: primaryPage, promise: fetchCatalogPage(primaryType, primaryPage) });
      }
      if (primaryPage > SOFT_MAX) primaryDone = true;
    }

    if (!secondaryDone) {
      for (let i = 0; i < 3 && secondaryPage <= SOFT_MAX; i++, secondaryPage++) {
        fetches.push({ apiType: secondaryType, page: secondaryPage, promise: fetchCatalogPage(secondaryType, secondaryPage) });
      }
      if (secondaryPage > SOFT_MAX) secondaryDone = true;
    }

    if (fetches.length === 0) break;

    const results = await Promise.allSettled(fetches.map((f) => f.promise));

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status !== "fulfilled") continue;
      const rows = Array.isArray(r.value) ? r.value : [];
      if (!rows.length) continue;

      const found = findInItems(rows, tmdbStr, fetches[i].apiType, season, episode);
      if (found) {
        console.log(`[extract] Found tmdb_id=${tmdbId} in ${fetches[i].apiType} page=${fetches[i].page}`);
        return found;
      }
    }
  }

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

    // 1) Ultra-fast static M3U lookup (both types in parallel)
    const m3uResult = await resolveFromM3UIndex(tmdb_id, cType, season, episode);
    if (m3uResult) {
      console.log(`[extract] M3U hit tmdb_id=${tmdb_id} type=${cType}`);
      return new Response(
        JSON.stringify({
          url: m3uResult.url,
          type: m3uResult.type,
          provider: m3uResult.provider || "cineveo-m3u",
          cached: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2) Fallback: capped CineVeo API scan
    console.log(`[extract] Scan fallback tmdb_id=${tmdb_id} type=${cType}`);
    const result = await tryCineveoCatalog(tmdb_id, cType, season, episode);

    if (result) {
      return new Response(
        JSON.stringify({
          url: result.url,
          type: result.type,
          provider: result.provider,
          cached: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        url: null,
        provider: "none",
        message: "Nenhum vídeo encontrado",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[extract] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Extraction failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
