import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tmdb_id, imdb_id, content_type, audio_type, season, episode } = await req.json();

    if (!tmdb_id) {
      return new Response(JSON.stringify({ error: "tmdb_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const cType = content_type || "movie";
    const aType = audio_type || "legendado";

    // 1. Check cache first
    let query = supabase
      .from("video_cache")
      .select("*")
      .eq("tmdb_id", tmdb_id)
      .eq("content_type", cType)
      .eq("audio_type", aType)
      .gt("expires_at", new Date().toISOString());

    if (season) query = query.eq("season", season);
    else query = query.is("season", null);
    if (episode) query = query.eq("episode", episode);
    else query = query.is("episode", null);

    const { data: cached } = await query.maybeSingle();

    if (cached) {
      console.log(`[extract] Cache hit for tmdb_id=${tmdb_id}`);
      return new Response(JSON.stringify({
        url: cached.video_url,
        type: cached.video_type,
        provider: cached.provider,
        cached: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Build SuperFlix URL - movies use IMDB, series use TMDB
    const isMovie = cType === "movie";
    const movieId = imdb_id || tmdb_id;
    const superflixUrl = isMovie
      ? `https://superflixapi.one/filme/${movieId}`
      : `https://superflixapi.one/serie/${tmdb_id}/${season || 1}/${episode || 1}`;

    console.log(`[extract] Fetching: ${superflixUrl}`);

    const response = await fetch(superflixUrl, {
      headers: {
        "User-Agent": UA,
        "Referer": "https://superflixapi.one/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Provider returned ${response.status}`, embed_url: superflixUrl }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = await response.text();

    // 3. Try regex patterns to find video URLs
    const patterns = [
      /file\s*:\s*["']([^"']+\.m3u8[^"']*)/gi,
      /src\s*:\s*["']([^"']+\.m3u8[^"']*)/gi,
      /source\s*:\s*["']([^"']+\.m3u8[^"']*)/gi,
      /["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/gi,
      /["'](https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/gi,
      /file\s*:\s*["']([^"']+\.mp4[^"']*)/gi,
    ];

    let videoUrl: string | null = null;
    let videoType: "m3u8" | "mp4" = "m3u8";

    for (const pattern of patterns) {
      const match = pattern.exec(html);
      if (match?.[1]) {
        videoUrl = match[1];
        videoType = videoUrl.includes(".mp4") ? "mp4" : "m3u8";
        break;
      }
    }

    // 4. Follow iframe sources
    if (!videoUrl) {
      const iframeSrcs = [...html.matchAll(/src=["'](https?:\/\/[^"']+)["']/gi)].map(m => m[1]);
      for (const url of iframeSrcs) {
        if (url.includes("superflixapi") || url.includes("embed") || url.includes("player")) {
          try {
            console.log(`[extract] Following iframe: ${url}`);
            const iframeRes = await fetch(url, {
              headers: { "User-Agent": UA, "Referer": "https://superflixapi.one/" },
              redirect: "follow",
            });
            const iframeHtml = await iframeRes.text();

            for (const pattern of patterns) {
              pattern.lastIndex = 0;
              const m = pattern.exec(iframeHtml);
              if (m?.[1]) {
                videoUrl = m[1];
                videoType = videoUrl.includes(".mp4") ? "mp4" : "m3u8";
                break;
              }
            }
            if (videoUrl) break;
          } catch (e) {
            console.log(`[extract] Failed to follow iframe: ${e}`);
          }
        }
      }
    }

    // 5. If found, save to cache and return
    if (videoUrl) {
      console.log(`[extract] Found video: ${videoUrl}`);

      await supabase.from("video_cache").upsert({
        tmdb_id,
        content_type: cType,
        audio_type: aType,
        season: season || null,
        episode: episode || null,
        video_url: videoUrl,
        video_type: videoType,
        provider: "superflix",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }, {
        onConflict: "tmdb_id,content_type,audio_type,season,episode",
      });

      return new Response(JSON.stringify({
        url: videoUrl,
        type: videoType,
        provider: "superflix",
        cached: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. No direct URL found - return embed for client-side extraction
    console.log(`[extract] No direct URL, returning embed for client extraction`);
    return new Response(JSON.stringify({
      url: null,
      embed_url: superflixUrl,
      provider: "superflix",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[extract] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Extraction failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
