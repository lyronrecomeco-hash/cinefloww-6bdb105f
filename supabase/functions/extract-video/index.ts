/**
 * extract-video: Video link resolution via CineVeo.
 * Priority: 1) M3U shard index (has correct internal IDs)  2) Direct URL fallback
 * Note: CineVeo catalog API does NOT support per-item lookup by tmdb_id.
 * The API is used only for full catalog sync (generate-catalog/sync-catalog).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
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

// ── Layer 1: M3U Shard Index (PRIMARY — has correct internal CineVeo IDs) ──

async function m3uLookup(tmdbId: number, cType: string, s?: number, e?: number): Promise<{ url: string; type: string; provider: string } | null> {
  const base = Deno.env.get("SUPABASE_URL");
  if (!base) return null;
  const kind = cType === "movie" ? "movie" : "series";
  const bucket = Math.abs(tmdbId) % 100;
  try {
    const res = await timedFetch(
      `${base}/storage/v1/object/public/catalog/m3u-index/${kind}/${bucket}.json`,
      3000,
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

// ── Layer 2: Direct URL fallback (uses TMDB ID — works for most content) ──

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

    // Layer 1: M3U shard (has correct internal IDs)
    const m3u = await m3uLookup(tmdbId, cType, season, episode);
    if (m3u) {
      console.log(`[extract] M3U hit tmdb=${tmdbId} url=${m3u.url.substring(0, 80)}`);
      return new Response(JSON.stringify({ ...m3u, cached: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Layer 2: Direct URL with TMDB ID
    const dUrl = directUrl(tmdbId, cType, season, episode);
    const dType = dUrl.includes(".m3u8") ? "m3u8" : "mp4";
    console.log(`[extract] Direct fallback tmdb=${tmdbId}`);
    return new Response(JSON.stringify({ url: dUrl, type: dType, provider: "cineveo-direct", cached: false }), {
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
