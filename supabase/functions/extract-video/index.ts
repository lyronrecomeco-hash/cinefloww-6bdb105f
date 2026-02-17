import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TMDB_KEY = "678cf2db5c3ab4a315d8ec632c493c7d";

// ── Helpers ──────────────────────────────────────────────────────────
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s-]/g, "")   // remove special chars
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// ── CineVeo extraction ──────────────────────────────────────────────
async function tryCineveo(
  tmdbId: number,
  contentType: string,
  season?: number,
  episode?: number,
): Promise<{ url: string; type: "mp4" | "m3u8" } | null> {
  const isMovie = contentType === "movie";

  // 1. Get title from TMDB
  const tmdbType = isMovie ? "movie" : "tv";
  const tmdbUrl = `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_KEY}&language=pt-BR`;
  console.log(`[cineveo] Fetching TMDB: ${tmdbUrl}`);

  const tmdbRes = await fetch(tmdbUrl, { headers: { "User-Agent": UA } });
  if (!tmdbRes.ok) {
    console.log(`[cineveo] TMDB returned ${tmdbRes.status}`);
    return null;
  }
  const tmdbData = await tmdbRes.json();
  const title = isMovie ? tmdbData.title : tmdbData.name;
  if (!title) {
    console.log("[cineveo] No title found from TMDB");
    return null;
  }

  // 2. Build slug
  const slug = `${slugify(title)}-${tmdbId}`;
  const pathType = isMovie ? "filme" : "serie";
  let pageUrl = `https://cineveo.site/${pathType}/${slug}.html`;

  // For series episodes, some sites append season/episode params
  if (!isMovie && season && episode) {
    pageUrl = `https://cineveo.site/${pathType}/${slug}.html`;
  }

  console.log(`[cineveo] Page URL: ${pageUrl}`);

  // 3. Fetch the page
  const pageRes = await fetch(pageUrl, {
    headers: {
      "User-Agent": UA,
      "Referer": "https://cineveo.site/",
      "Accept": "text/html,*/*",
    },
    redirect: "follow",
  });

  if (!pageRes.ok) {
    console.log(`[cineveo] Page returned ${pageRes.status}`);
    return null;
  }

  const html = await pageRes.text();

  // 4. Extract iframe src pointing to the player
  const iframeMatch = html.match(/src=["']((?:\.\.)?\/player\/[^"']+)/i)
    || html.match(/src=["'](\/player\/index\.php[^"']+)/i);

  if (!iframeMatch?.[1]) {
    // Try direct CDN link in the page itself
    const cdnDirect = html.match(/(https?:\/\/cdn\.cineveo\.site\/[^\s"'<>\\]+\.mp4)/i);
    if (cdnDirect?.[1]) {
      console.log(`[cineveo] Found direct CDN in page: ${cdnDirect[1]}`);
      return { url: cdnDirect[1], type: "mp4" };
    }
    console.log("[cineveo] No player iframe found");
    return null;
  }

  // Fix relative path
  let playerPath = iframeMatch[1].replace(/^\.\.\//, "/");
  let playerUrl = `https://cineveo.site${playerPath}`;

  // For series, append season/episode if not already in URL
  if (!isMovie && season && episode && !playerPath.includes("s=") && !playerPath.includes("ep=")) {
    const sep = playerPath.includes("?") ? "&" : "?";
    playerUrl += `${sep}s=${season}&ep=${episode}`;
  }

  console.log(`[cineveo] Player URL: ${playerUrl}`);

  // 5. Fetch the player page
  const playerRes = await fetch(playerUrl, {
    headers: {
      "User-Agent": UA,
      "Referer": pageUrl,
      "Accept": "text/html,*/*",
    },
    redirect: "follow",
  });

  if (!playerRes.ok) {
    console.log(`[cineveo] Player returned ${playerRes.status}`);
    return null;
  }

  const playerHtml = await playerRes.text();

  // 6. Extract CDN mp4 URL
  const cdnMatch = playerHtml.match(/(https?:\/\/cdn\.cineveo\.site\/[^\s"'<>\\]+\.mp4)/i);
  if (cdnMatch?.[1]) {
    console.log(`[cineveo] Found CDN URL: ${cdnMatch[1]}`);
    return { url: cdnMatch[1], type: "mp4" };
  }

  // Try VOD URL from the v= parameter
  const vodMatch = playerPath.match(/[?&]v=([^&]+)/);
  if (vodMatch?.[1]) {
    const vodUrl = `https://vodcinevs.com/movie/${vodMatch[1]}.mp4`;
    console.log(`[cineveo] Trying VOD URL: ${vodUrl}`);
    // Quick HEAD check
    try {
      const headRes = await fetch(vodUrl, { method: "HEAD", headers: { "User-Agent": UA } });
      if (headRes.ok) {
        return { url: vodUrl, type: "mp4" };
      }
    } catch { /* skip */ }
  }

  // Fallback: any mp4 in player HTML
  const mp4Match = playerHtml.match(/(https?:\/\/[^\s"'<>\\]+\.mp4)/i);
  if (mp4Match?.[1]) {
    console.log(`[cineveo] Found generic mp4: ${mp4Match[1]}`);
    return { url: mp4Match[1], type: "mp4" };
  }

  console.log("[cineveo] No video URL found in player");
  return null;
}

// ── MegaEmbed extraction ─────────────────────────────────────────────
async function tryMegaEmbed(
  tmdbId: number,
  isMovie: boolean,
  s: number,
  e: number,
): Promise<{ url: string; type: "mp4" | "m3u8" } | null> {
  const megaUrl = isMovie
    ? `https://megaembed.com/embed/${tmdbId}`
    : `https://megaembed.com/embed/${tmdbId}/${s}/${e}`;
  console.log(`[extract] Trying MegaEmbed: ${megaUrl}`);

  try {
    const megaRes = await fetch(megaUrl, {
      headers: { "User-Agent": UA, "Referer": "https://megaembed.com/", "Accept": "text/html,*/*" },
      redirect: "follow",
    });
    if (!megaRes.ok) return null;

    const html = await megaRes.text();

    // var sources = [{file:"...", type:"...", label:"..."}]
    const sourcesMatch = html.match(/var\s+sources\s*=\s*(\[[\s\S]*?\]);/);
    if (sourcesMatch?.[1]) {
      try {
        const sources = JSON.parse(sourcesMatch[1]);
        for (const src of sources) {
          if (src.file && src.type !== "iframe") {
            const file = src.file as string;
            if (file.includes("m3u8") || file.includes("master") || file.includes(".mp4") || file.includes("brstream")) {
              return { url: file, type: file.includes(".mp4") ? "mp4" : "m3u8" };
            }
          }
        }
      } catch { /* skip */ }
    }

    // Regex fallback
    const patterns = [
      /["'](https?:\/\/[^"'\s]+(?:master|playlist)[^"'\s]*)/gi,
      /["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/gi,
      /["'](https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/gi,
    ];
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(html);
      if (match?.[1] && !match[1].includes("cdn.vidstack") && !match[1].includes("googletagmanager")) {
        return { url: match[1], type: match[1].includes(".mp4") ? "mp4" : "m3u8" };
      }
    }
  } catch (err) {
    console.log(`[extract] MegaEmbed error: ${err}`);
  }
  return null;
}

// ── EmbedPlay extraction ─────────────────────────────────────────────
async function tryEmbedPlay(
  tmdbId: number,
  imdbId: string | null,
  isMovie: boolean,
  s: number,
  e: number,
): Promise<{ url: string; type: "mp4" | "m3u8" } | null> {
  const embedId = imdbId || tmdbId;
  const embedPageUrl = isMovie
    ? `https://embedplayapi.site/embed/${embedId}`
    : `https://embedplayapi.site/embed/${embedId}/${s}/${e}`;
  console.log(`[extract] Trying EmbedPlay: ${embedPageUrl}`);

  try {
    const pageRes = await fetch(embedPageUrl, {
      headers: { "User-Agent": UA, "Referer": "https://embedplayapi.site/" },
      redirect: "follow",
    });
    if (!pageRes.ok) return null;

    const html = await pageRes.text();
    const movieIdMatch = html.match(/data-movie-id="([^"]+)"/);
    const movieId = movieIdMatch?.[1];
    if (!movieId) return null;

    const serverMatches = [...html.matchAll(/class="server[^"]*"\s+data-id="([^"]+)"/g)];
    for (const [, serverId] of serverMatches) {
      try {
        const apiUrl = `https://embedplayapi.site/ajax/get_stream_link?id=${serverId}&movie=${movieId}&is_init=false&captcha=&ref=`;
        const apiRes = await fetch(apiUrl, {
          headers: { "User-Agent": UA, "Referer": embedPageUrl, "X-Requested-With": "XMLHttpRequest" },
        });
        if (!apiRes.ok) continue;
        const ct = apiRes.headers.get("content-type") || "";
        if (!ct.includes("json")) continue;

        const apiData = await apiRes.json();
        if (!apiData.success || !apiData.data?.link) continue;

        const playerRes = await fetch(apiData.data.link, {
          headers: { "User-Agent": UA, "Referer": "https://embedplayapi.site/" },
          redirect: "follow",
        });
        if (!playerRes.ok) continue;
        const playerHtml = await playerRes.text();

        // Check sources
        const srcMatch = playerHtml.match(/var\s+sources\s*=\s*(\[[\s\S]*?\]);/);
        if (srcMatch?.[1]) {
          try {
            const srcs = JSON.parse(srcMatch[1]);
            for (const src of srcs) {
              if (src.file && src.type !== "iframe") {
                return { url: src.file, type: (src.file as string).includes(".mp4") ? "mp4" : "m3u8" };
              }
            }
          } catch { /* skip */ }
        }

        const patterns = [
          /["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/gi,
          /["'](https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/gi,
        ];
        for (const pattern of patterns) {
          pattern.lastIndex = 0;
          const m = pattern.exec(playerHtml);
          if (m?.[1]) {
            return { url: m[1], type: m[1].includes(".mp4") ? "mp4" : "m3u8" };
          }
        }
      } catch { /* skip server */ }
    }
  } catch (err) {
    console.log(`[extract] EmbedPlay error: ${err}`);
  }
  return null;
}

// ── Main handler ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tmdb_id, imdb_id, content_type, audio_type, season, episode, force_provider } = await req.json();

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

    // 1. Check cache (skip if force_provider is set — tester mode)
    if (!force_provider) {
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
          url: cached.video_url, type: cached.video_type, provider: cached.provider, cached: true,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // 2. Try providers based on force_provider or default chain
    let videoUrl: string | null = null;
    let videoType: "mp4" | "m3u8" = "mp4";
    let provider = "cineveo";

    const shouldTry = (p: string) => !force_provider || force_provider === p;

    // ── CineVeo ──
    if (shouldTry("cineveo") && !videoUrl) {
      try {
        const cv = await tryCineveo(tmdb_id, cType, season, episode);
        if (cv) { videoUrl = cv.url; videoType = cv.type; provider = "cineveo"; }
      } catch (err) { console.log(`[extract] CineVeo error: ${err}`); }
    }

    // ── MegaEmbed ──
    if (shouldTry("megaembed") && !videoUrl) {
      const me = await tryMegaEmbed(tmdb_id, isMovie, s, e);
      if (me) { videoUrl = me.url; videoType = me.type; provider = "megaembed"; }
    }

    // ── EmbedPlay ──
    if (shouldTry("embedplay") && !videoUrl) {
      const ep = await tryEmbedPlay(tmdb_id, imdb_id || null, isMovie, s, e);
      if (ep) { videoUrl = ep.url; videoType = ep.type; provider = "embedplay"; }
    }

    // 3. Save to cache & return
    if (videoUrl) {
      console.log(`[extract] Success! ${videoUrl} (${provider})`);
      await supabase.from("video_cache").upsert({
        tmdb_id, content_type: cType, audio_type: aType,
        season: season || null, episode: episode || null,
        video_url: videoUrl, video_type: videoType, provider,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "tmdb_id,content_type,audio_type,season,episode" });

      return new Response(JSON.stringify({
        url: videoUrl, type: videoType, provider, cached: false,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log("[extract] No direct video URL found");
    return new Response(JSON.stringify({ url: null, provider: "none" }), {
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
