/**
 * extract-video: Video link resolution via CineVeo.
 * Probes URLs server-side to follow redirects and return final streaming URLs.
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

// ── Layer 1: M3U Shard Index ──
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

// ── Layer 2: Direct URL fallback ──
function directUrl(tmdbId: number, cType: string, s?: number, e?: number): string {
  if (cType === "movie") return `${CINEVEO_BASE}/movie/${CUSER}/${CPASS}/${tmdbId}.mp4`;
  return `${CINEVEO_BASE}/series/${CUSER}/${CPASS}/${tmdbId}/${s || 1}/${e || 1}.mp4`;
}

// ── Probe: follow redirects server-side to find the real streaming URL ──
async function probeUrl(url: string): Promise<{ finalUrl: string; type: "mp4" | "m3u8"; isHls: boolean }> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    "Accept": "*/*",
  };
  try {
    headers["Referer"] = new URL(url).origin + "/";
  } catch {}

  // Try m3u8 first, then mp4
  const variants = [
    url.replace(/\.mp4$/, ".m3u8"),
    url,
  ];
  // Deduplicate
  const unique = [...new Set(variants)];

  for (const tryUrl of unique) {
    try {
      const resp = await timedFetch(tryUrl, 8000, {
        headers: { ...headers, "Referer": new URL(tryUrl).origin + "/" },
        redirect: "follow",
      });

      if (!resp.ok) {
        await resp.text().catch(() => {});
        continue;
      }

      const ct = resp.headers.get("content-type") || "";
      const finalUrl = resp.url || tryUrl;
      const isHls = ct.includes("mpegurl") || finalUrl.includes(".m3u8");

      if (isHls) {
        // Verify it's a real m3u8 manifest
        const body = await resp.text();
        if (body.includes("#EXTM3U") || body.includes("#EXT-X-")) {
          console.log(`[extract] Probe OK (HLS): ${finalUrl.substring(0, 80)}`);
          return { finalUrl, type: "m3u8", isHls: true };
        }
        continue;
      }

      // MP4 or other binary — check content-length
      await resp.text().catch(() => {});
      const cl = parseInt(resp.headers.get("content-length") || "0", 10);
      if (cl > 10000 || ct.includes("video") || ct.includes("octet-stream")) {
        console.log(`[extract] Probe OK (MP4): ${finalUrl.substring(0, 80)}, size=${cl}`);
        return { finalUrl, type: "mp4", isHls: false };
      }
    } catch (e) {
      console.log(`[extract] Probe failed for ${tryUrl.substring(0, 60)}:`, e);
    }
  }

  // Could not verify — return original with m3u8 preference
  const m3u8Url = url.replace(/\.mp4$/, ".m3u8");
  return { finalUrl: m3u8Url, type: "m3u8", isHls: false };
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

    // Layer 1: M3U shard
    const m3u = await m3uLookup(tmdbId, cType, season, episode);
    const candidateUrl = m3u?.url || directUrl(tmdbId, cType, season, episode);
    const provider = m3u?.provider || "cineveo-direct";

    console.log(`[extract] Candidate tmdb=${tmdbId}: ${candidateUrl.substring(0, 80)} (${provider})`);

    // Probe: follow redirects to find real stream
    const probed = await probeUrl(candidateUrl);
    
    console.log(`[extract] Final tmdb=${tmdbId}: ${probed.finalUrl.substring(0, 80)} (${probed.type})`);

    return new Response(JSON.stringify({
      url: probed.finalUrl,
      type: probed.type,
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
