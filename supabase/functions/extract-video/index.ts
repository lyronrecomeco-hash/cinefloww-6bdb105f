import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * extract-video: Real-time CineVeo API lookup with automatic host rotation.
 * Searches the CineVeo catalog API by tmdb_id and returns the stream_url directly.
 * Supports: movies, series, animes.
 * Rotates between multiple CineVeo mirror hosts for resilience against ISP blocks.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Host pool for automatic rotation ──
const CINEVEO_HOST_POOL = [
  "cineveo.lat",
  "cinetvembed.cineveo.site",
  "cdn.cineveo.site",
];

const CINEVEO_API_PATH = "/api/catalog.php";
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

// ── Host health tracking ──
// Blacklisted hosts with expiry (blocked for 5 min after failure)
const hostBlacklist = new Map<string, number>();
const HOST_BLACKLIST_TTL = 5 * 60 * 1000;

function isHostBlacklisted(host: string): boolean {
  const t = hostBlacklist.get(host);
  if (!t) return false;
  if (Date.now() - t > HOST_BLACKLIST_TTL) {
    hostBlacklist.delete(host);
    return false;
  }
  return true;
}

function blacklistHost(host: string) {
  console.log(`[extract] Blacklisting host: ${host}`);
  hostBlacklist.set(host, Date.now());
}

/** Get the best API host (first non-blacklisted) */
function getBestApiHost(): string {
  for (const host of CINEVEO_HOST_POOL) {
    if (!isHostBlacklisted(host)) return host;
  }
  // All blacklisted — reset and try first
  hostBlacklist.clear();
  return CINEVEO_HOST_POOL[0];
}

/** Get all available hosts for stream URL verification, ordered by health */
function getHealthyHosts(): string[] {
  const healthy = CINEVEO_HOST_POOL.filter(h => !isHostBlacklisted(h));
  if (healthy.length === 0) {
    hostBlacklist.clear();
    return [...CINEVEO_HOST_POOL];
  }
  return healthy;
}

// ── Stream URL verification with host rotation ──

const BAD_URL_TTL_MS = 10 * 60 * 1000;
const PROBE_TIMEOUT_MS = 3000;
const badUrlMemo = new Map<string, number>();

function isMemoBad(url: string): boolean {
  const t = badUrlMemo.get(url);
  if (!t) return false;
  if (Date.now() - t > BAD_URL_TTL_MS) {
    badUrlMemo.delete(url);
    return false;
  }
  return true;
}

function memoBad(url: string) {
  badUrlMemo.set(url, Date.now());
}

/** Probe a stream URL — returns true if it's a valid video stream */
async function probeStreamUrl(url: string): Promise<boolean> {
  if (!url) return false;
  if (isMemoBad(url)) return false;

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: ctrl.signal,
    });

    if (!res.ok) {
      memoBad(url);
      return false;
    }

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("text/html") || ct.includes("text/plain")) {
      memoBad(url);
      return false;
    }

    return true;
  } catch {
    memoBad(url);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/** Replace the host in a CineVeo URL with a different mirror */
function replaceHost(url: string, newHost: string): string {
  try {
    const parsed = new URL(url);
    parsed.hostname = newHost;
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Try all healthy hosts for a given stream URL path, return first working one */
async function findWorkingStreamUrl(originalUrl: string): Promise<{ url: string; verified: boolean }> {
  const hosts = getHealthyHosts();

  // Build candidate URLs from all hosts
  const candidates: string[] = [];
  try {
    const parsed = new URL(originalUrl);
    const originalHost = parsed.hostname.toLowerCase();

    // Put original host first, then others
    if (!isHostBlacklisted(originalHost)) {
      candidates.push(originalUrl);
    }
    for (const host of hosts) {
      if (host !== originalHost) {
        candidates.push(replaceHost(originalUrl, host));
      }
    }
    // If original was blacklisted, still add it as last resort
    if (isHostBlacklisted(originalHost)) {
      candidates.push(originalUrl);
    }
  } catch {
    candidates.push(originalUrl);
  }

  // Probe candidates in parallel (fast) — first valid wins
  const probeResults = await Promise.all(
    candidates.map(async (url) => {
      const ok = await probeStreamUrl(url);
      return { url, ok };
    })
  );

  for (const r of probeResults) {
    if (r.ok) {
      console.log(`[extract] Verified stream: ${r.url.substring(0, 80)}`);
      return { url: r.url, verified: true };
    }
  }

  // No host verified — try alternate host as best guess
  const altHost = hosts.find(h => {
    try { return h !== new URL(originalUrl).hostname; } catch { return false; }
  });

  if (altHost) {
    const altUrl = replaceHost(originalUrl, altHost);
    console.log(`[extract] No host verified, using best alternate: ${altUrl.substring(0, 60)}`);
    return { url: altUrl, verified: false };
  }

  return { url: originalUrl, verified: false };
}

// ── Fetch a single API page with host rotation ──
async function fetchApiPage(apiType: string, page: number): Promise<ApiPage | null> {
  const host = getBestApiHost();
  const apiUrl = `https://${host}${CINEVEO_API_PATH}?username=${CUSER}&password=${CPASS}&type=${apiType}&page=${page}`;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(apiUrl, { signal: ctrl.signal, headers: { "User-Agent": UA, "Connection": "keep-alive" } });
    clearTimeout(t);

    if (!res.ok) {
      console.log(`[extract] API ${host} responded ${res.status} for ${apiType} p${page}`);
      // If main host fails, try alternate
      blacklistHost(host);
      const altHost = getBestApiHost();
      if (altHost !== host) {
        return fetchApiPageDirect(altHost, apiType, page);
      }
      return null;
    }

    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      console.log(`[extract] API ${host} returned non-JSON for ${apiType} p${page}`);
      blacklistHost(host);
      return null;
    }

    if (!json.success) {
      console.log(`[extract] API ${host} success=false for ${apiType} p${page}`);
      return null;
    }

    const items = json.data || [];
    if (page === 1) {
      console.log(`[extract] ${apiType} p1 via ${host}: ${items.length} items, total=${json.pagination?.total_pages || 0}`);
    }
    return { data: items, totalPages: json.pagination?.total_pages || 0 };
  } catch (err) {
    console.log(`[extract] API ${host} fetch error for ${apiType} p${page}: ${err}`);
    blacklistHost(host);
    // Retry with next host
    const altHost = getBestApiHost();
    if (altHost !== host) {
      return fetchApiPageDirect(altHost, apiType, page);
    }
    return null;
  }
}

/** Direct fetch to a specific host (no retry) */
async function fetchApiPageDirect(host: string, apiType: string, page: number): Promise<ApiPage | null> {
  const apiUrl = `https://${host}${CINEVEO_API_PATH}?username=${CUSER}&password=${CPASS}&type=${apiType}&page=${page}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(apiUrl, { signal: ctrl.signal, headers: { "User-Agent": UA, "Connection": "keep-alive" } });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.success) return null;
    return { data: json.data || [], totalPages: json.pagination?.total_pages || 0 };
  } catch {
    blacklistHost(host);
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

  if (item.episodes && item.episodes.length > 0) {
    const exact = item.episodes.find(e => e.season === season && e.episode === episode);
    if (exact) return exact.stream_url;

    const seasonEps = item.episodes.filter(e => e.season === season);
    if (seasonEps.length > 0 && seasonEps[0].episode === 0) {
      const idx = episode - 1;
      if (idx >= 0 && idx < seasonEps.length) return seasonEps[idx].stream_url;
    }

    if (seasonEps.length === 0 && item.episodes.length >= episode) {
      return item.episodes[episode - 1]?.stream_url || null;
    }
  }

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
  const p1 = await fetchApiPage(apiType, 1);
  if (!p1 || p1.data.length === 0) return null;

  const url1 = isMovie
    ? findMovie(p1.data, tmdbId)
    : findEpisode(p1.data, tmdbId, season || 1, episode || 1);
  if (url1) {
    return { url: url1, type: inferTypeFromUrl(url1) };
  }

  const totalPages = p1.totalPages;
  if (totalPages <= 1) return null;

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
      return { url: match, type: inferTypeFromUrl(match) };
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
    const tmdbId = Number(body.tmdb_id);
    const cTypeRaw = String(body.content_type || "movie");
    const cType: "movie" | "series" = cTypeRaw === "movie" ? "movie" : "series";
    const season = body.season;
    const episode = body.episode;

    if (!tmdbId || Number.isNaN(tmdbId)) {
      return new Response(JSON.stringify({ error: "tmdb_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isMovie = cType === "movie";
    let result: { url: string; type: string } | null = null;

    console.log(`[extract] tmdb=${tmdbId} type=${cType} s=${season} e=${episode} activeHost=${getBestApiHost()}`);

    if (isMovie) {
      result = await searchApi(tmdbId, "movies", true);
    } else {
      result = await searchApi(tmdbId, "animes", false, season, episode);
      if (!result) {
        result = await searchApi(tmdbId, "series", false, season, episode);
      }
    }

    if (result) {
      console.log(`[extract] Found raw URL: ${result.url.substring(0, 80)} (${result.type})`);

      // Real-time host rotation — probe all mirrors in parallel, pick first working
      const { url: finalUrl, verified } = await findWorkingStreamUrl(result.url);

      console.log(`[extract] Final URL: ${finalUrl.substring(0, 80)} (verified=${verified})`);

      return new Response(JSON.stringify({
        url: finalUrl,
        type: result.type,
        provider: "cineveo-api",
        cached: false,
        verified,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
