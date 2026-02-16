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

    const isMovie = cType === "movie";
    const s = season || 1;
    const e = episode || 1;

    // 2. Try MegaEmbed first - it exposes sources directly in HTML
    const megaUrl = isMovie
      ? `https://megaembed.com/embed/${tmdb_id}`
      : `https://megaembed.com/embed/${tmdb_id}/${s}/${e}`;

    console.log(`[extract] Trying MegaEmbed: ${megaUrl}`);

    let videoUrl: string | null = null;
    let videoType: "m3u8" | "mp4" = "m3u8";
    let provider = "megaembed";

    try {
      const megaRes = await fetch(megaUrl, {
        headers: {
          "User-Agent": UA,
          "Referer": "https://megaembed.com/",
          "Accept": "text/html,*/*",
        },
        redirect: "follow",
      });

      if (megaRes.ok) {
        const html = await megaRes.text();

        // MegaEmbed exposes sources as: var sources = [{file:"...", type:"...", label:"..."}]
        const sourcesMatch = html.match(/var\s+sources\s*=\s*(\[[\s\S]*?\]);/);
        if (sourcesMatch?.[1]) {
          try {
            const sources = JSON.parse(sourcesMatch[1]);
            console.log(`[extract] MegaEmbed sources: ${JSON.stringify(sources)}`);

            // Find direct stream (not iframe type)
            for (const src of sources) {
              if (src.file && src.type !== "iframe") {
                // Check if it's a valid stream URL
                const file = src.file as string;
                if (file.includes("m3u8") || file.includes("master") || file.includes("brstream") || file.includes(".mp4") || file.endsWith(".txt")) {
                  videoUrl = file;
                  videoType = file.includes(".mp4") ? "mp4" : "m3u8";
                  console.log(`[extract] Found MegaEmbed stream: ${videoUrl}`);
                  break;
                }
              }
            }
          } catch (parseErr) {
            console.log(`[extract] Failed to parse MegaEmbed sources: ${parseErr}`);
          }
        }

        // Fallback: regex patterns
        if (!videoUrl) {
          const patterns = [
            /["'](https?:\/\/[^"'\s]+(?:master|playlist)[^"'\s]*)/gi,
            /["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/gi,
            /["'](https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/gi,
          ];
          for (const pattern of patterns) {
            pattern.lastIndex = 0;
            const match = pattern.exec(html);
            if (match?.[1] && !match[1].includes("cdn.vidstack") && !match[1].includes("googletagmanager")) {
              videoUrl = match[1];
              videoType = videoUrl.includes(".mp4") ? "mp4" : "m3u8";
              console.log(`[extract] Found via regex: ${videoUrl}`);
              break;
            }
          }
        }
      }
    } catch (megaErr) {
      console.log(`[extract] MegaEmbed error: ${megaErr}`);
    }

    // 3. If MegaEmbed failed, try EmbedPlay API
    if (!videoUrl) {
      const embedId = imdb_id || tmdb_id;
      const embedPageUrl = isMovie
        ? `https://embedplayapi.site/embed/${embedId}`
        : `https://embedplayapi.site/embed/${embedId}/${s}/${e}`;

      console.log(`[extract] Trying EmbedPlay: ${embedPageUrl}`);

      try {
        const pageRes = await fetch(embedPageUrl, {
          headers: { "User-Agent": UA, "Referer": "https://embedplayapi.site/" },
          redirect: "follow",
        });

        if (pageRes.ok) {
          const html = await pageRes.text();
          const movieIdMatch = html.match(/data-movie-id="([^"]+)"/);
          const movieId = movieIdMatch?.[1];

          if (movieId) {
            const serverMatches = [...html.matchAll(/class="server[^"]*"\s+data-id="([^"]+)"/g)];
            const serverIds = serverMatches.map(m => m[1]);

            for (const serverId of serverIds) {
              try {
                const apiUrl = `https://embedplayapi.site/ajax/get_stream_link?id=${serverId}&movie=${movieId}&is_init=false&captcha=&ref=`;
                const apiRes = await fetch(apiUrl, {
                  headers: { "User-Agent": UA, "Referer": embedPageUrl, "X-Requested-With": "XMLHttpRequest" },
                });

                if (apiRes.ok) {
                  const ct = apiRes.headers.get("content-type") || "";
                  if (ct.includes("json")) {
                    const apiData = await apiRes.json();
                    if (apiData.success && apiData.data?.link) {
                      const playerLink = apiData.data.link;
                      const playerRes = await fetch(playerLink, {
                        headers: { "User-Agent": UA, "Referer": "https://embedplayapi.site/" },
                        redirect: "follow",
                      });
                      if (playerRes.ok) {
                        const playerHtml = await playerRes.text();

                        // Check for MegaEmbed-style sources in the player page too
                        const srcMatch = playerHtml.match(/var\s+sources\s*=\s*(\[[\s\S]*?\]);/);
                        if (srcMatch?.[1]) {
                          try {
                            const srcs = JSON.parse(srcMatch[1]);
                            for (const src of srcs) {
                              if (src.file && src.type !== "iframe") {
                                videoUrl = src.file;
                                videoType = videoUrl!.includes(".mp4") ? "mp4" : "m3u8";
                                provider = "embedplay";
                                break;
                              }
                            }
                          } catch { /* skip */ }
                        }

                        if (!videoUrl) {
                          const patterns = [
                            /["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/gi,
                            /["'](https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/gi,
                          ];
                          for (const pattern of patterns) {
                            pattern.lastIndex = 0;
                            const m = pattern.exec(playerHtml);
                            if (m?.[1]) {
                              videoUrl = m[1];
                              videoType = videoUrl.includes(".mp4") ? "mp4" : "m3u8";
                              provider = "embedplay";
                              break;
                            }
                          }
                        }
                      }
                    }
                  }
                }
                if (videoUrl) break;
              } catch { /* skip server */ }
            }
          }
        }
      } catch (embedErr) {
        console.log(`[extract] EmbedPlay error: ${embedErr}`);
      }
    }

    // 4. If found, save to cache and return
    if (videoUrl) {
      console.log(`[extract] Success! Video: ${videoUrl} (${provider})`);

      await supabase.from("video_cache").upsert({
        tmdb_id,
        content_type: cType,
        audio_type: aType,
        season: season || null,
        episode: episode || null,
        video_url: videoUrl,
        video_type: videoType,
        provider,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }, {
        onConflict: "tmdb_id,content_type,audio_type,season,episode",
      });

      return new Response(JSON.stringify({
        url: videoUrl,
        type: videoType,
        provider,
        cached: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. No direct URL found
    console.log(`[extract] No direct video URL found`);
    return new Response(JSON.stringify({
      url: null,
      provider: "none",
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
