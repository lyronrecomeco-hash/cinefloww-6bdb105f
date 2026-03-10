/**
 * extract-video: Video link resolution via CineVeo.
 * For HLS: fetches manifest server-side and returns inline (avoids CORS issues).
 * For MP4: returns redirect URL for direct browser playback.
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

// ── M3U Shard Index ──
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

// ── Direct URL fallback ──
function directUrl(tmdbId: number, cType: string, s?: number, e?: number): string {
  if (cType === "movie") return `${CINEVEO_BASE}/movie/${CUSER}/${CPASS}/${tmdbId}`;
  return `${CINEVEO_BASE}/series/${CUSER}/${CPASS}/${tmdbId}/${s || 1}/${e || 1}`;
}

function fetchHeaders(url: string): Record<string, string> {
  let referer = "";
  try { referer = new URL(url).origin + "/"; } catch {}
  return { "User-Agent": UA, "Referer": referer, "Accept": "*/*" };
}

// ── Probe URL: try m3u8 first, then mp4, return working URL + type ──
async function probeUrls(baseUrl: string): Promise<{ url: string; type: "mp4" | "m3u8"; status: number } | null> {
  const variants = [baseUrl + ".m3u8", baseUrl + ".mp4"];
  
  for (const tryUrl of variants) {
    try {
      const resp = await timedFetch(tryUrl, 8000, {
        method: "HEAD",
        headers: fetchHeaders(tryUrl),
        redirect: "follow",
      });
      const finalUrl = resp.url || tryUrl;
      await resp.text().catch(() => {});
      
      if (resp.ok || resp.status === 302 || resp.status === 301) {
        const isHls = finalUrl.includes(".m3u8") || (resp.headers.get("content-type") || "").includes("mpegurl");
        console.log(`[extract] Probe OK: ${tryUrl.substring(0, 60)} → ${resp.status}`);
        return { url: finalUrl, type: isHls ? "m3u8" : "mp4", status: resp.status };
      }
      console.log(`[extract] Probe fail: ${tryUrl.substring(0, 60)} → ${resp.status}`);
    } catch (e) {
      console.log(`[extract] Probe error: ${tryUrl.substring(0, 60)}`, e);
    }
  }
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

    // Get candidate URL from M3U index or build direct
    const m3u = await m3uLookup(tmdbId, cType, season, episode);
    let candidateBase: string;
    const provider = m3u?.provider || "cineveo-direct";
    
    if (m3u?.url) {
      // Strip extension to get base
      candidateBase = m3u.url.replace(/\.(m3u8|mp4)$/, "");
    } else {
      candidateBase = directUrl(tmdbId, cType, season, episode);
    }

    console.log(`[extract] tmdb=${tmdbId} base=${candidateBase.substring(0, 80)}`);

    // Probe to find a working URL
    const probed = await probeUrls(candidateBase);
    
    if (probed) {
      console.log(`[extract] Resolved: ${probed.url.substring(0, 80)} (${probed.type})`);
      return new Response(JSON.stringify({
        url: probed.url,
        type: probed.type,
        provider,
        cached: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Nothing worked — return mp4 URL as best guess
    const fallbackUrl = candidateBase + ".mp4";
    console.log(`[extract] All probes failed, returning fallback: ${fallbackUrl.substring(0, 80)}`);
    return new Response(JSON.stringify({
      url: fallbackUrl,
      type: "mp4",
      provider,
      cached: false,
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
