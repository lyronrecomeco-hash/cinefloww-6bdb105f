/**
 * extract-video: Video link resolution via CineVeo.
 * Priority: 1) CineVeo API search  2) CineVeo API item  3) M3U index  4) Direct URL fallback
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CINEVEO_API = "https://cinetvembed.cineveo.site/api";
const CINEVEO_BASE = "https://cinetvembed.cineveo.site";
const CUSER = "lyneflix-vods";
const CPASS = "uVljs2d";

async function timedFetch(url: string, timeoutMs: number, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function pickUrl(obj: Record<string, unknown>): string | null {
  if (!obj) return null;
  for (const k of ["stream_url", "streamUrl", "url", "video_url", "link", "embed_url"]) {
    if (typeof obj[k] === "string" && (obj[k] as string).length > 5) return obj[k] as string;
  }
  return null;
}

// ── Layer 1: CineVeo API — try multiple strategies to find content by tmdb_id ──

async function apiLookup(tmdbId: number, cType: string, s?: number, e?: number): Promise<{ url: string; type: string; provider: string } | null> {
  const apiType = cType === "movie" ? "movies" : "series";
  const headers = { "User-Agent": UA, Accept: "application/json" };

  // Strategy A: Try search endpoint with tmdb_id
  const searchUrls = [
    `${CINEVEO_API}/catalog.php?username=${CUSER}&password=${CPASS}&type=${apiType}&search=${tmdbId}`,
    `${CINEVEO_API}/catalog.php?username=${CUSER}&password=${CPASS}&type=${apiType}&tmdb=${tmdbId}`,
    `${CINEVEO_API}/catalog.php?username=${CUSER}&password=${CPASS}&type=${apiType}&id=${tmdbId}`,
    `${CINEVEO_API}/item.php?username=${CUSER}&password=${CPASS}&tmdb_id=${tmdbId}`,
    `${CINEVEO_API}/movie.php?username=${CUSER}&password=${CPASS}&tmdb_id=${tmdbId}`,
    `${CINEVEO_API}/search.php?username=${CUSER}&password=${CPASS}&query=${tmdbId}`,
  ];

  for (const url of searchUrls) {
    try {
      console.log(`[apiLookup] Trying: ${url}`);
      const res = await timedFetch(url, 6000, { headers });
      if (!res.ok) { console.log(`[apiLookup] ${res.status}`); continue; }
      const rawText = await res.text();
      console.log(`[apiLookup] Response (first 300): ${rawText.substring(0, 300)}`);
      
      let payload: unknown;
      try { payload = JSON.parse(rawText); } catch { continue; }
      
      const result = extractFromPayload(payload, tmdbId, apiType, s, e);
      if (result) {
        console.log(`[apiLookup] Found via ${url}`);
        return result;
      }
    } catch (_e) { console.log(`[apiLookup] Error: ${_e}`); }
  }

  // Strategy B: Also try opposite type
  const altType = cType === "movie" ? "series" : "movies";
  try {
    const url = `${CINEVEO_API}/catalog.php?username=${CUSER}&password=${CPASS}&type=${altType}&search=${tmdbId}`;
    const res = await timedFetch(url, 5000, { headers });
    if (res.ok) {
      const payload = await res.json();
      const result = extractFromPayload(payload, tmdbId, altType, s, e);
      if (result) return result;
    }
  } catch (_e) { /* skip */ }

  return null;
}

function extractFromPayload(payload: unknown, tmdbId: number, apiType: string, s?: number, e?: number): { url: string; type: string; provider: string } | null {
  const obj = payload as Record<string, unknown>;
  
  // Handle single item response
  if (obj && !Array.isArray(obj) && !obj.data) {
    const id = String(obj?.tmdb_id ?? obj?.tmdbId ?? obj?.id ?? "");
    if (id === String(tmdbId)) {
      const streamUrl = pickUrl(obj);
      if (streamUrl) return { url: streamUrl, type: streamUrl.includes(".m3u8") ? "m3u8" : "mp4", provider: "cineveo-api" };
    }
  }
  
  // Handle array/paginated response
  const items = Array.isArray(obj?.data) ? obj.data as unknown[] : Array.isArray(payload) ? payload as unknown[] : [];
  
  for (const item of items) {
    const rec = item as Record<string, unknown>;
    const id = String(rec?.tmdb_id ?? rec?.tmdbId ?? rec?.id ?? "");
    if (id !== String(tmdbId)) continue;
    
    // For series, find the specific episode
    if (apiType === "series" && Array.isArray(rec?.episodes) && s && e) {
      for (const ep of rec.episodes as Record<string, unknown>[]) {
        const epS = Number(ep?.season ?? ep?.temporada ?? ep?.s ?? 1) || 1;
        const epE = Number(ep?.episode ?? ep?.ep ?? ep?.e ?? 1) || 1;
        if (epS === s && epE === e) {
          const epUrl = pickUrl(ep);
          if (epUrl) return { url: epUrl, type: epUrl.includes(".m3u8") ? "m3u8" : "mp4", provider: "cineveo-api" };
        }
      }
    }
    
    const streamUrl = pickUrl(rec);
    if (streamUrl) return { url: streamUrl, type: streamUrl.includes(".m3u8") ? "m3u8" : "mp4", provider: "cineveo-api" };
    console.log(`[apiLookup] Item matched tmdb=${tmdbId} but no URL. Keys: ${Object.keys(rec).join(",")}`);
  }
  
  return null;
}

// ── Layer 2: M3U Shard Index ──

async function m3uLookup(tmdbId: number, cType: string, s?: number, e?: number): Promise<{ url: string; type: string; provider: string } | null> {
  const base = Deno.env.get("SUPABASE_URL");
  if (!base) return null;
  const kind = cType === "movie" ? "movie" : "series";
  const bucket = Math.abs(tmdbId) % 100;
  try {
    const res = await timedFetch(
      `${base}/storage/v1/object/public/catalog/m3u-index/${kind}/${bucket}.json`,
      2000,
      { headers: { "User-Agent": UA } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const row = data?.items?.[String(tmdbId)];
    if (!row) return null;
    if (row.url) return { url: row.url, type: row.type || "m3u8", provider: "cineveo-m3u" };
    const key = s && e ? `${s}:${e}` : null;
    if (key && row.episodes?.[key]?.url) {
      return { url: row.episodes[key].url, type: row.episodes[key].type || "m3u8", provider: "cineveo-m3u" };
    }
    if (row.default?.url) return { url: row.default.url, type: row.default.type || "m3u8", provider: "cineveo-m3u" };
  } catch (_e) { /* skip */ }
  return null;
}

// ── Layer 3: Direct URL fallback (uses TMDB ID — may not always work) ──

function directUrl(tmdbId: number, cType: string, s?: number, e?: number): string {
  if (cType === "movie") return `${CINEVEO_BASE}/movie/${CUSER}/${CPASS}/${tmdbId}.mp4`;
  return `${CINEVEO_BASE}/series/${CUSER}/${CPASS}/${tmdbId}/${s || 1}/${e || 1}.mp4`;
}

// ── Handler ──

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

    // Layer 1 (API) + Layer 2 (M3U) in parallel — API is primary
    const [api, m3u] = await Promise.all([
      apiLookup(tmdbId, cType, season, episode),
      m3uLookup(tmdbId, cType, season, episode),
    ]);

    // Prefer API result (has correct internal CineVeo IDs)
    if (api) {
      console.log(`[extract] API hit tmdb=${tmdbId} url=${api.url.substring(0, 80)}`);
      return new Response(JSON.stringify({ ...api, cached: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback to M3U shard
    if (m3u) {
      console.log(`[extract] M3U hit tmdb=${tmdbId}`);
      return new Response(JSON.stringify({ ...m3u, cached: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Last resort: direct URL with TMDB ID (may not work for all content)
    const dUrl = directUrl(tmdbId, cType, season, episode);
    const dType = dUrl.includes(".m3u8") ? "m3u8" : "mp4";
    console.log(`[extract] Last resort direct tmdb=${tmdbId}`);
    return new Response(JSON.stringify({ url: dUrl, type: dType, provider: "cineveo-direct-unverified", cached: false }), {
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
