/**
 * extract-video: Video link resolution via CineVeo.
 * Layers: 1) M3U index  2) Direct URL  3) CineVeo API fallback
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

// ── Layer 1: M3U Shard Index ──

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

// ── Layer 2: Direct CineVeo URL ──

function directUrl(tmdbId: number, cType: string, s?: number, e?: number): string {
  if (cType === "movie") return `${CINEVEO_BASE}/movie/${CUSER}/${CPASS}/${tmdbId}.mp4`;
  return `${CINEVEO_BASE}/series/${CUSER}/${CPASS}/${tmdbId}/${s || 1}/${e || 1}.mp4`;
}

async function headCheck(url: string): Promise<boolean> {
  try {
    const res = await timedFetch(url, 3000, { method: "HEAD", headers: { "User-Agent": UA } });
    return res.ok || res.status === 301 || res.status === 302;
  } catch (_e) { return false; }
}

// ── Layer 3: CineVeo Catalog API ──

async function apiLookup(tmdbId: number, cType: string, s?: number, e?: number): Promise<{ url: string; type: string; provider: string } | null> {
  const apiType = cType === "movie" ? "movies" : "series";
  const url = `${CINEVEO_API}/catalog.php?username=${CUSER}&password=${CPASS}&type=${apiType}&tmdb_id=${tmdbId}`;
  
  try {
    const res = await timedFetch(url, 8000, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return null;
    const payload = await res.json();
    const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
    
    for (const item of items) {
      const id = String(item?.tmdb_id ?? item?.tmdbId ?? item?.id ?? "");
      if (id !== String(tmdbId)) continue;
      
      // For series, find the specific episode
      if (apiType === "series" && Array.isArray(item?.episodes) && s && e) {
        for (const ep of item.episodes) {
          const epS = Number(ep?.season ?? ep?.temporada ?? ep?.s ?? 1) || 1;
          const epE = Number(ep?.episode ?? ep?.ep ?? ep?.e ?? 1) || 1;
          if (epS === s && epE === e) {
            const epUrl = pickUrl(ep as Record<string, unknown>);
            if (epUrl) return { url: epUrl, type: epUrl.includes(".m3u8") ? "m3u8" : "mp4", provider: "cineveo-api" };
          }
        }
      }
      
      // Fallback: pick any stream URL from the item
      const streamUrl = pickUrl(item as Record<string, unknown>);
      if (streamUrl) return { url: streamUrl, type: streamUrl.includes(".m3u8") ? "m3u8" : "mp4", provider: "cineveo-api" };
    }
  } catch (_e) { /* skip */ }
  
  // Try opposite type
  const altType = cType === "movie" ? "series" : "movies";
  const altUrl = `${CINEVEO_API}/catalog.php?username=${CUSER}&password=${CPASS}&type=${altType}&tmdb_id=${tmdbId}`;
  try {
    const res = await timedFetch(altUrl, 6000, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return null;
    const payload = await res.json();
    const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
    for (const item of items) {
      const id = String(item?.tmdb_id ?? item?.tmdbId ?? item?.id ?? "");
      if (id !== String(tmdbId)) continue;
      const streamUrl = pickUrl(item as Record<string, unknown>);
      if (streamUrl) return { url: streamUrl, type: streamUrl.includes(".m3u8") ? "m3u8" : "mp4", provider: "cineveo-api" };
    }
  } catch (_e) { /* skip */ }
  
  return null;
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

    const isSeries = cType !== "movie";

    // Layer 1: M3U shard
    const m3u = await m3uLookup(tmdbId, cType, season, episode);
    if (m3u) {
      console.log(`[extract] M3U hit tmdb=${tmdbId} s=${season} e=${episode}`);
      return new Response(JSON.stringify({ ...m3u, cached: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Layer 2: Direct URL
    const dUrl = directUrl(tmdbId, cType, season, episode);

    if (!isSeries) {
      console.log(`[extract] Direct movie tmdb=${tmdbId}`);
      return new Response(JSON.stringify({ url: dUrl, type: "mp4", provider: "cineveo-direct", cached: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Series: HEAD check + API in parallel
    const [valid, api] = await Promise.all([
      headCheck(dUrl),
      apiLookup(tmdbId, cType, season, episode),
    ]);

    if (valid) {
      console.log(`[extract] Direct verified tmdb=${tmdbId} s=${season} e=${episode}`);
      return new Response(JSON.stringify({ url: dUrl, type: "mp4", provider: "cineveo-direct-verified", cached: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (api) {
      console.log(`[extract] API hit tmdb=${tmdbId} s=${season} e=${episode}`);
      return new Response(JSON.stringify({ ...api, cached: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Last resort
    console.log(`[extract] Last resort tmdb=${tmdbId} s=${season} e=${episode}`);
    return new Response(JSON.stringify({ url: dUrl, type: "mp4", provider: "cineveo-direct-unverified", cached: false }), {
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
