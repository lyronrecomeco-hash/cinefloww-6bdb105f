/**
 * extract-video: On-demand video link resolution.
 * Priority:
 * 1) Static M3U index lookup (ultra-fast, no DB)
 * 2) Direct CineVeo URL construction + HEAD verify (instant)
 * 3) CineVeo catalog API search (broader scan)
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

function extractFromRow(
  row: any,
  contentType: string,
  season?: number,
  episode?: number,
): CineVeoResult | null {
  if (!row) return null;

  if (row.url) {
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

// ── Direct CineVeo URL construction + verification ──

async function tryDirectCineVeoUrl(
  tmdbId: number,
  contentType: string,
  season?: number,
  episode?: number,
): Promise<CineVeoResult | null> {
  const isMovie = contentType === "movie";

  // Build candidate URLs to try
  const candidates: string[] = [];

  if (isMovie) {
    // Movie direct URL pattern
    candidates.push(`${CINEVEO_STREAM_BASE}/movie/${CINEVEO_USER}/${CINEVEO_PASS}/${tmdbId}.mp4`);
    candidates.push(`${CINEVEO_STREAM_BASE}/movie/${CINEVEO_USER}/${CINEVEO_PASS}/${tmdbId}`);
  } else {
    // Series with episode
    const s = season || 1;
    const e = episode || 1;
    candidates.push(`${CINEVEO_STREAM_BASE}/series/${CINEVEO_USER}/${CINEVEO_PASS}/${tmdbId}/${s}/${e}.mp4`);
    candidates.push(`${CINEVEO_STREAM_BASE}/series/${CINEVEO_USER}/${CINEVEO_PASS}/${tmdbId}/${s}/${e}`);
  }

  // Also try the opposite type (movie might be listed as series and vice versa)
  if (isMovie) {
    candidates.push(`${CINEVEO_STREAM_BASE}/series/${CINEVEO_USER}/${CINEVEO_PASS}/${tmdbId}/1/1.mp4`);
  } else {
    candidates.push(`${CINEVEO_STREAM_BASE}/movie/${CINEVEO_USER}/${CINEVEO_PASS}/${tmdbId}.mp4`);
  }

  // Try all candidates in parallel with HEAD requests
  const checks = candidates.map(async (url) => {
    try {
      const res = await fetchWithTimeout(url, {
        method: "HEAD",
        timeout: 5000,
        headers: { "User-Agent": UA },
      });
      // Accept 200, 206 (partial content), or 302 (redirect to actual file)
      if (res.ok || res.status === 302 || res.status === 301) {
        const ct = res.headers.get("content-type") || "";
        // Reject HTML pages (embed pages, not video files)
        if (ct.includes("text/html")) return null;
        return url;
      }
      return null;
    } catch {
      return null;
    }
  });

  const results = await Promise.all(checks);
  const validUrl = results.find((u) => u !== null);

  if (validUrl) {
    const type: "mp4" | "m3u8" = validUrl.includes(".m3u8") ? "m3u8" : "mp4";
    return { url: validUrl, type, provider: "cineveo-direct" };
  }

  return null;
}

// ── CineVeo Catalog API: detail endpoint (single item lookup) ──

async function tryCineVeoDetail(
  tmdbId: number,
  contentType: string,
  season?: number,
  episode?: number,
): Promise<CineVeoResult | null> {
  const isMovie = contentType === "movie";
  const apiType = isMovie ? "movies" : "series";
  
  // Try the detail/search endpoint if available
  const detailUrl = `${CINEVEO_API_BASE}/catalog.php?username=${CINEVEO_USER}&password=${CINEVEO_PASS}&type=${apiType}&tmdb_id=${tmdbId}`;
  
  try {
    const res = await fetchWithTimeout(detailUrl, {
      timeout: 8000,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const payload = await res.json();
    
    const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
    if (items.length === 0) return null;
    
    const found = findInItems(items, String(tmdbId), apiType, season, episode);
    if (found) {
      console.log(`[extract] Detail API hit tmdb_id=${tmdbId}`);
      return found;
    }
  } catch {
    // Detail endpoint may not exist, continue
  }
  
  // Also try the opposite type
  const altType = isMovie ? "series" : "movies";
  const altUrl = `${CINEVEO_API_BASE}/catalog.php?username=${CINEVEO_USER}&password=${CINEVEO_PASS}&type=${altType}&tmdb_id=${tmdbId}`;
  
  try {
    const res = await fetchWithTimeout(altUrl, {
      timeout: 6000,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const payload = await res.json();
    
    const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
    if (items.length === 0) return null;
    
    const found = findInItems(items, String(tmdbId), altType, season, episode);
    if (found) {
      console.log(`[extract] Detail API (alt) hit tmdb_id=${tmdbId}`);
      return found;
    }
  } catch {}
  
  return null;
}

// ── CineVeo catalog page scan fallback (broader) ──

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
    (item: any) => String(item?.tmdb_id) === tmdbStr || String(item?.tmdbId) === tmdbStr || String(item?.id) === tmdbStr,
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

async function tryCineveoCatalogScan(
  tmdbId: number,
  contentType: string,
  season?: number,
  episode?: number,
): Promise<CineVeoResult | null> {
  const tmdbStr = String(tmdbId);
  const isMovie = contentType === "movie";
  const primaryType = isMovie ? "movies" : "series";
  const secondaryType = isMovie ? "series" : "movies";

  // Scan up to 20 pages in parallel batches of 10
  const MAX_PAGES = 20;
  const BATCH_SIZE = 10;

  for (const apiType of [primaryType, secondaryType]) {
    for (let start = 1; start <= MAX_PAGES; start += BATCH_SIZE) {
      const fetches: Promise<any[] | null>[] = [];
      const pages: number[] = [];
      for (let p = start; p < start + BATCH_SIZE && p <= MAX_PAGES; p++) {
        pages.push(p);
        fetches.push(fetchCatalogPage(apiType, p));
      }
      
      const results = await Promise.all(fetches);
      
      for (let i = 0; i < results.length; i++) {
        const rows = results[i];
        if (!rows || !rows.length) continue;
        
        const found = findInItems(rows, tmdbStr, apiType, season, episode);
        if (found) {
          console.log(`[extract] Scan hit tmdb_id=${tmdbId} in ${apiType} page=${pages[i]}`);
          return found;
        }
      }
      
      // If first batch returned empty pages, stop scanning this type
      if (results.every(r => !r || r.length === 0)) break;
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

    // 1) Ultra-fast static M3U lookup
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

    // 2) Direct URL construction + HEAD verify (instant, no scanning)
    const directResult = await tryDirectCineVeoUrl(tmdb_id, cType, season, episode);
    if (directResult) {
      console.log(`[extract] Direct URL hit tmdb_id=${tmdb_id}`);
      return new Response(
        JSON.stringify({
          url: directResult.url,
          type: directResult.type,
          provider: directResult.provider,
          cached: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3) CineVeo detail/search API (single item lookup by tmdb_id)
    const detailResult = await tryCineVeoDetail(tmdb_id, cType, season, episode);
    if (detailResult) {
      return new Response(
        JSON.stringify({
          url: detailResult.url,
          type: detailResult.type,
          provider: detailResult.provider,
          cached: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4) Broader catalog page scan (up to 20 pages per type)
    console.log(`[extract] Full scan fallback tmdb_id=${tmdb_id} type=${cType}`);
    const scanResult = await tryCineveoCatalogScan(tmdb_id, cType, season, episode);

    if (scanResult) {
      return new Response(
        JSON.stringify({
          url: scanResult.url,
          type: scanResult.type,
          provider: scanResult.provider,
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
