import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ── CineVeo Catalog API credentials (hardcoded) ─────────────────────
const CINEVEO_API_BASE = "https://cinetvembed.cineveo.site/api";
const CINEVEO_USER = "lyneflix-vods";
const CINEVEO_PASS = "uVljs2d";

// ── Fetch with timeout helper ────────────────────────────────────────
function fetchWithTimeout(url: string, opts: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 8000, ...fetchOpts } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...fetchOpts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ── CineVeo Catalog API: fetch stream_url for a given tmdb_id ───────
async function tryCineveoCatalog(
  tmdbId: number,
  contentType: string,
  season?: number,
  episode?: number,
): Promise<{ url: string; type: "mp4" | "m3u8" } | null> {
  const isMovie = contentType === "movie";
  const apiType = isMovie ? "movies" : "series";

  const catalogUrl = `${CINEVEO_API_BASE}/catalog.php?username=${CINEVEO_USER}&password=${CINEVEO_PASS}&type=${apiType}`;
  console.log(`[cineveo-api] Fetching catalog: ${apiType}`);

  try {
    const res = await fetchWithTimeout(catalogUrl, {
      timeout: 15000,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });

    if (!res.ok) {
      console.log(`[cineveo-api] Catalog returned ${res.status}`);
      return null;
    }

    const data = await res.json();
    const items = Array.isArray(data) ? data : data?.results || data?.data || [];

    if (!Array.isArray(items) || items.length === 0) {
      console.log(`[cineveo-api] No items in catalog response`);
      return null;
    }

    console.log(`[cineveo-api] Catalog has ${items.length} items`);

    // Find match by tmdb_id
    const tmdbStr = String(tmdbId);
    const match = items.find((item: any) =>
      String(item.tmdb_id) === tmdbStr ||
      String(item.tmdbId) === tmdbStr ||
      String(item.id) === tmdbStr
    );

    if (!match) {
      console.log(`[cineveo-api] tmdb_id=${tmdbId} not found in catalog`);
      return null;
    }

    console.log(`[cineveo-api] Found match: ${match.title || match.name || tmdbId}`);

    // Extract stream URL - try multiple possible field names
    let streamUrl = match.stream_url || match.streamUrl || match.url || match.video_url || match.link || match.embed_url || null;

    // For series, check if there's episode-specific data
    if (!isMovie && (season || episode)) {
      const episodes = match.episodes || match.seasons || null;
      if (Array.isArray(episodes)) {
        const epMatch = episodes.find((ep: any) =>
          (ep.season === season || ep.s === season) &&
          (ep.episode === episode || ep.e === episode || ep.ep === episode)
        );
        if (epMatch) {
          streamUrl = epMatch.stream_url || epMatch.streamUrl || epMatch.url || epMatch.video_url || epMatch.link || streamUrl;
        }
      }
      // Try season/episode in URL pattern
      if (streamUrl && !isMovie) {
        // Append season/episode if the URL supports it
        if (streamUrl.includes("{season}")) {
          streamUrl = streamUrl.replace("{season}", String(season || 1)).replace("{episode}", String(episode || 1));
        }
      }
    }

    if (!streamUrl) {
      console.log(`[cineveo-api] No stream_url in match`);
      return null;
    }

    // Determine type
    const type: "mp4" | "m3u8" = streamUrl.includes(".m3u8") ? "m3u8" : "mp4";
    console.log(`[cineveo-api] Stream URL found (${type})`);

    // Validate URL is accessible
    try {
      const headRes = await fetchWithTimeout(streamUrl, {
        method: "HEAD",
        timeout: 5000,
        headers: { "User-Agent": UA },
      });
      if (!headRes.ok && headRes.status !== 405 && headRes.status !== 403) {
        console.log(`[cineveo-api] Stream URL returned ${headRes.status}, trying anyway`);
      }
    } catch {
      console.log(`[cineveo-api] HEAD check failed, using URL anyway`);
    }

    return { url: streamUrl, type };
  } catch (err) {
    console.log(`[cineveo-api] Error: ${err}`);
    return null;
  }
}

// ── Mega.nz link extraction ─────────────────────────────────────────
// Mega links stored manually in video_cache are used as-is.
// For actual mega.nz URLs, we try to get the direct download link.
async function tryMegaExtract(megaUrl: string): Promise<{ url: string; type: "mp4" | "m3u8" } | null> {
  if (!megaUrl || !megaUrl.includes("mega.nz")) return null;

  console.log(`[mega] Processing Mega link`);

  // Mega direct download via their API
  // mega.nz/file/XXXX#key format
  try {
    // Try fetching as direct link first
    const headRes = await fetchWithTimeout(megaUrl, {
      method: "HEAD",
      timeout: 5000,
      headers: { "User-Agent": UA },
      redirect: "follow",
    });

    const contentType = headRes.headers.get("content-type") || "";
    if (contentType.includes("video") || contentType.includes("octet-stream")) {
      console.log(`[mega] Direct video URL confirmed`);
      return { url: megaUrl, type: "mp4" };
    }
  } catch {}

  // If it's a mega.nz sharing link, the video needs client-side decryption
  // Return as-is since manual links should already be direct URLs
  console.log(`[mega] Using as direct link`);
  return { url: megaUrl, type: "mp4" };
}

// ── Iframe proxy fallback ───────────────────────────────────────────
function fallbackToIframeProxy(embedUrl: string, tag: string): { url: string; type: "iframe-proxy" } {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const proxyUrl = `${supabaseUrl}/functions/v1/proxy-player?url=${encodeURIComponent(embedUrl)}`;
  console.log(`[${tag}] Using iframe-proxy fallback`);
  return { url: proxyUrl, type: "iframe-proxy" as any };
}

// ── Timeout wrapper ─────────────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => {
        console.log(`[${label}] Timeout after ${ms}ms, skipping`);
        resolve(null);
      }, ms);
    }),
  ]);
}

// ── Main handler ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tmdb_id, imdb_id, content_type, audio_type, season, episode, force_provider, title: reqTitle, mega_url } = await req.json();

    if (!tmdb_id) {
      return new Response(JSON.stringify({ error: "tmdb_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cType = content_type || "movie";
    const aType = audio_type || "legendado";
    const isMovie = cType === "movie";
    const s = season || 1;
    const e = episode || 1;

    // ── Handle Mega.nz manual link ──
    if (mega_url) {
      const megaResult = await tryMegaExtract(mega_url);
      if (megaResult) {
        // Save to cache
        await supabase.from("video_cache").upsert({
          tmdb_id, content_type: cType, audio_type: aType,
          season: season || 0, episode: episode || 0,
          video_url: megaResult.url, video_type: megaResult.type, provider: "mega",
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days for manual
        }, { onConflict: "tmdb_id,content_type,audio_type,season,episode" });

        await supabase.from("resolve_logs").insert({
          tmdb_id, title: reqTitle || `TMDB ${tmdb_id}`, content_type: cType,
          season: season || 0, episode: episode || 0,
          provider: "mega", video_url: megaResult.url, video_type: megaResult.type, success: true,
        });

        return new Response(JSON.stringify({
          url: megaResult.url, type: megaResult.type, provider: "mega", cached: false,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // 1. Check cache
    if (!force_provider) {
      let query = supabase
        .from("video_cache")
        .select("*")
        .eq("tmdb_id", tmdb_id)
        .eq("content_type", cType)
        .eq("audio_type", aType)
        .gt("expires_at", new Date().toISOString());

      query = query.eq("season", season || 0);
      query = query.eq("episode", episode || 0);

      const { data: cachedRows } = await query.order("created_at", { ascending: false }).limit(1);
      const cached = cachedRows?.[0] || null;
      if (cached) {
        console.log(`[extract] Cache hit for tmdb_id=${tmdb_id}`);
        return new Response(JSON.stringify({
          url: cached.video_url, type: cached.video_type, provider: cached.provider, cached: true,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // 2. Try CineVeo Catalog API (sole provider)
    let videoUrl: string | null = null;
    let videoType: "mp4" | "m3u8" = "mp4";
    let provider = "cineveo-api";

    console.log(`[extract] Trying CineVeo Catalog API for tmdb_id=${tmdb_id}`);
    const result = await withTimeout(
      tryCineveoCatalog(tmdb_id, cType, season, episode),
      20000,
      "cineveo-api"
    );

    if (result) {
      videoUrl = result.url;
      videoType = result.type;
      provider = "cineveo-api";
    }

    // 3. Fallback: iframe proxy via CineVeo embed
    if (!videoUrl) {
      const embedBase = "http://primevicio.lat";
      const embedUrl = isMovie
        ? `${embedBase}/embed/movie/${tmdb_id}`
        : `${embedBase}/embed/tv/${tmdb_id}/${s}/${e}`;
      const proxy = fallbackToIframeProxy(embedUrl, "fallback");
      return new Response(JSON.stringify({
        url: proxy.url, type: "iframe-proxy", provider: "cineveo-embed", cached: false,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 4. Save to cache & return
    if (videoUrl) {
      console.log(`[extract] Success via ${provider}`);
      await supabase.from("video_cache").upsert({
        tmdb_id, content_type: cType, audio_type: aType,
        season: season || 0, episode: episode || 0,
        video_url: videoUrl, video_type: videoType, provider,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "tmdb_id,content_type,audio_type,season,episode" });

      const logTitle = reqTitle || `TMDB ${tmdb_id}`;
      await supabase.from("resolve_logs").insert({
        tmdb_id, title: logTitle, content_type: cType,
        season: season || 0, episode: episode || 0,
        provider, video_url: videoUrl, video_type: videoType, success: true,
      });

      return new Response(JSON.stringify({
        url: videoUrl, type: videoType, provider, cached: false,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Log failure
    const logTitle = reqTitle || `TMDB ${tmdb_id}`;
    await supabase.from("resolve_logs").insert({
      tmdb_id, title: logTitle, content_type: cType,
      season: season || 0, episode: episode || 0,
      provider: "cineveo-api", success: false,
      error_message: "CineVeo API não retornou vídeo",
    });

    return new Response(JSON.stringify({
      url: null, provider: "none", message: "Nenhum vídeo encontrado via CineVeo API",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[extract] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Extraction failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
