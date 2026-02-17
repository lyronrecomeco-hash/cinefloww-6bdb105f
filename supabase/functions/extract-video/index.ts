import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TMDB_KEY = "678cf2db5c3ab4a315d8ec632c493c7d";

// ── Fixed slugify with NFD normalization ─────────────────────────────
function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// ── CineVeo slug discovery ──────────────────────────────────────────
async function findCineveoSlug(
  tmdbId: number,
  type: "movie" | "tv",
  title?: string,
  originalTitle?: string,
): Promise<string | null> {
  const pathType = type === "movie" ? "filme" : "serie";

  // Method 1: Search by title via search.php
  const titlesToSearch = [title, originalTitle].filter(Boolean) as string[];
  for (const searchTitle of titlesToSearch) {
    try {
      const searchUrl = `https://cineveo.site/search.php?q=${encodeURIComponent(searchTitle)}`;
      console.log(`[cineveo] Searching: ${searchUrl}`);
      const res = await fetch(searchUrl, {
        headers: { 
          "User-Agent": UA, 
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "Referer": "https://cineveo.site/",
          "Cookie": "mode=standard",
        },
      });
      if (!res.ok) {
        console.log(`[cineveo] Search returned ${res.status}`);
        continue;
      }
      const html = await res.text();
      console.log(`[cineveo] Search HTML: ${html.length} chars, has "${pathType}/": ${html.includes(`/${pathType}/`)}`);
      
      // Extract all slugs for the right content type
      const slugRegex = new RegExp(`/${pathType}/([^"'\\s<>]+)\\.html`, "gi");
      const slugMatches = [...html.matchAll(slugRegex)];
      
      if (slugMatches.length === 0) {
        console.log(`[cineveo] No ${pathType} slugs found in search HTML`);
        // Log a snippet around the first 500 chars of body for debugging
        const bodyStart = html.indexOf('<body');
        if (bodyStart > -1) {
          const snippet = html.substring(bodyStart, bodyStart + 500);
          console.log(`[cineveo] HTML snippet: ${snippet.substring(0, 300)}`);
        }
        continue;
      }

      console.log(`[cineveo] Found ${slugMatches.length} ${pathType} slugs`);

      // Check if tmdb_id appears in the page
      const tmdbStr = String(tmdbId);
      if (html.includes(tmdbStr)) {
        // Find the slug closest to the tmdb_id mention
        const tmdbPos = html.indexOf(tmdbStr);
        let bestSlug = slugMatches[0][1];
        let bestDist = Infinity;
        for (const m of slugMatches) {
          const pos = html.indexOf(m[0]);
          const dist = Math.abs(pos - tmdbPos);
          if (dist < bestDist) {
            bestDist = dist;
            bestSlug = m[1];
          }
        }
        console.log(`[cineveo] Found slug via search: ${bestSlug}`);
        return bestSlug;
      }

      // If only one result and title matches, use it
      if (slugMatches.length === 1) {
        console.log(`[cineveo] Single slug found: ${slugMatches[0][1]}`);
        return slugMatches[0][1];
      }
    } catch (err) {
      console.log(`[cineveo] Search error: ${err}`);
    }
  }

  // Method 2: Paginate through category API  
  const cineveoType = type === "movie" ? "movie" : "tv";
  const pagesToTry = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 250, 300];

  for (const page of pagesToTry) {
    try {
      const url = `https://cineveo.site/category.php?fetch_mode=1&type=${cineveoType}&page=${page}&genre=`;
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json, */*" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data.success || !Array.isArray(data.results)) continue;

      const found = data.results.find(
        (item: any) => String(item.tmdb_id) === String(tmdbId),
      );
      if (found?.slug) {
        console.log(`[cineveo] Found slug via API page ${page}: ${found.slug}`);
        return found.slug;
      }
    } catch { /* skip page */ }
  }
  return null;
}

// ── CineVeo extraction ──────────────────────────────────────────────
async function tryCineveo(
  tmdbId: number,
  contentType: string,
  season?: number,
  episode?: number,
): Promise<{ url: string; type: "mp4" | "m3u8" } | null> {
  const isMovie = contentType === "movie";
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

  const originalTitle = isMovie ? tmdbData.original_title : tmdbData.original_name;
  const pathType = isMovie ? "filme" : "serie";

  // 1. Build slug candidates from title
  const slugs = [
    `${slugify(title)}-${tmdbId}`,
    ...(originalTitle && originalTitle !== title ? [`${slugify(originalTitle)}-${tmdbId}`] : []),
  ];

  // 2. Try slug-based URLs first
  const result = await tryCineveoSlugs(slugs, pathType, isMovie, season, episode);
  if (result) return result;

  // 3. Discover correct slug via search + API
  console.log(`[cineveo] Slug-based attempts failed, trying discovery...`);
  const discoveredSlug = await findCineveoSlug(tmdbId, tmdbType as "movie" | "tv", title, originalTitle || undefined);
  if (discoveredSlug && !slugs.includes(discoveredSlug)) {
    console.log(`[cineveo] Trying discovered slug: ${discoveredSlug}`);
    const apiResult = await tryCineveoSlugs([discoveredSlug], pathType, isMovie, season, episode);
    if (apiResult) return apiResult;
  }

  console.log("[cineveo] No video URL found");
  return null;
}

// ── Try fetching video from cineveo using slug list ──────────────────
async function tryCineveoSlugs(
  slugs: string[],
  pathType: string,
  isMovie: boolean,
  season?: number,
  episode?: number,
): Promise<{ url: string; type: "mp4" | "m3u8" } | null> {
  for (const slug of slugs) {
    const pageUrl = `https://cineveo.site/${pathType}/${slug}.html`;
    console.log(`[cineveo] Trying: ${pageUrl}`);

    const pageRes = await fetch(pageUrl, {
      headers: { "User-Agent": UA, "Referer": "https://cineveo.site/", "Accept": "text/html,*/*" },
      redirect: "follow",
    });

    if (!pageRes.ok) {
      console.log(`[cineveo] Page returned ${pageRes.status}`);
      continue;
    }

    const html = await pageRes.text();

    if (html.includes('text-yellow-500">404')) {
      console.log(`[cineveo] Soft 404 detected`);
      continue;
    }

    // For series: look for episode-specific player links
    if (!isMovie && season && episode) {
      const result = await extractSeriesEpisode(html, pageUrl, season, episode);
      if (result) return result;
    }

    // Extract iframe src pointing to the player
    const iframeMatch =
      html.match(/src=["']((?:\.\.)?\/player\/[^"']+)/i) ||
      html.match(/src=["'](\/player\/index\.php[^"']+)/i);

    if (!iframeMatch?.[1]) {
      const cdnDirect = html.match(/(https?:\/\/cdn\.cineveo\.site\/[^\s"'<>\\]+\.mp4)/i);
      if (cdnDirect?.[1]) {
        console.log(`[cineveo] Found direct CDN in page: ${cdnDirect[1]}`);
        return { url: cdnDirect[1], type: "mp4" };
      }
      console.log("[cineveo] No player iframe found");
      continue;
    }

    let playerPath = iframeMatch[1].replace(/^\.\.\//, "/");
    let playerUrl = `https://cineveo.site${playerPath}`;

    if (!isMovie && season && episode && !playerPath.includes("s=") && !playerPath.includes("ep=")) {
      const sep = playerPath.includes("?") ? "&" : "?";
      playerUrl += `${sep}s=${season}&e=${episode}`;
    }

    console.log(`[cineveo] Player URL: ${playerUrl}`);

    const playerRes = await fetch(playerUrl, {
      headers: { "User-Agent": UA, "Referer": pageUrl, "Accept": "text/html,*/*" },
      redirect: "follow",
    });

    if (!playerRes.ok) {
      console.log(`[cineveo] Player returned ${playerRes.status}`);
      continue;
    }

    const playerHtml = await playerRes.text();

    const cdnMatch = playerHtml.match(/(https?:\/\/cdn\.cineveo\.site\/[^\s"'<>\\]+\.mp4)/i);
    if (cdnMatch?.[1]) {
      console.log(`[cineveo] Found CDN URL: ${cdnMatch[1]}`);
      return { url: cdnMatch[1], type: "mp4" };
    }

    const vodMatch = playerPath.match(/[?&]v=([^&]+)/);
    if (vodMatch?.[1]) {
      const decodedVod = decodeURIComponent(vodMatch[1]);
      console.log(`[cineveo] Trying VOD URL: ${decodedVod}`);
      try {
        const headRes = await fetch(decodedVod, { method: "HEAD", headers: { "User-Agent": UA } });
        if (headRes.ok) return { url: decodedVod, type: "mp4" };
      } catch { /* skip */ }
    }

    const mp4Match = playerHtml.match(/(https?:\/\/[^\s"'<>\\]+\.mp4)/i);
    if (mp4Match?.[1]) {
      console.log(`[cineveo] Found generic mp4: ${mp4Match[1]}`);
      return { url: mp4Match[1], type: "mp4" };
    }
  }

  return null;
}

// Extract episode from a series page
async function extractSeriesEpisode(
  html: string,
  pageUrl: string,
  season: number,
  episode: number,
): Promise<{ url: string; type: "mp4" | "m3u8" } | null> {
  const epPatterns = [
    new RegExp(`href=["']([^"']*[?&]s=${season}[&]e(?:p)?=${episode}[^"']*)`, "i"),
    new RegExp(`href=["']([^"']*temporada-${season}[^"']*episodio-${episode}[^"']*)`, "i"),
    new RegExp(`data-season=["']${season}["'][^>]*data-episode=["']${episode}["'][^>]*(?:href|src)=["']([^"']+)`, "i"),
  ];

  for (const pattern of epPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      let epUrl = match[1];
      if (epUrl.startsWith("/")) epUrl = `https://cineveo.site${epUrl}`;
      else if (!epUrl.startsWith("http")) epUrl = new URL(epUrl, pageUrl).href;

      console.log(`[cineveo] Found episode link: ${epUrl}`);
      const epRes = await fetch(epUrl, {
        headers: { "User-Agent": UA, "Referer": pageUrl },
        redirect: "follow",
      });
      if (!epRes.ok) continue;
      const epHtml = await epRes.text();

      const iframeMatch = epHtml.match(/src=["']((?:\.\.)?\/player\/[^"']+)/i);
      if (iframeMatch?.[1]) {
        let playerUrl = `https://cineveo.site${iframeMatch[1].replace(/^\.\.\//, "/")}`;
        const playerRes = await fetch(playerUrl, {
          headers: { "User-Agent": UA, "Referer": epUrl },
          redirect: "follow",
        });
        if (playerRes.ok) {
          const playerHtml = await playerRes.text();
          const cdnMatch = playerHtml.match(/(https?:\/\/cdn\.cineveo\.site\/[^\s"'<>\\]+\.mp4)/i) ||
                           playerHtml.match(/(https?:\/\/[^\s"'<>\\]+\.mp4)/i);
          if (cdnMatch?.[1]) {
            console.log(`[cineveo] Found episode CDN: ${cdnMatch[1]}`);
            return { url: cdnMatch[1], type: "mp4" };
          }
        }
      }

      const cdnDirect = epHtml.match(/(https?:\/\/cdn\.cineveo\.site\/[^\s"'<>\\]+\.mp4)/i);
      if (cdnDirect?.[1]) return { url: cdnDirect[1], type: "mp4" };
    }
  }

  // Try all iframes with season/episode params
  const allIframes = [...html.matchAll(/src=["']((?:\.\.)?\/player\/[^"']+)/gi)];
  for (const iframe of allIframes) {
    let playerPath = iframe[1].replace(/^\.\.\//, "/");
    const sep = playerPath.includes("?") ? "&" : "?";
    const playerUrl = `https://cineveo.site${playerPath}${sep}s=${season}&e=${episode}`;
    console.log(`[cineveo] Trying series player: ${playerUrl}`);

    try {
      const playerRes = await fetch(playerUrl, {
        headers: { "User-Agent": UA, "Referer": pageUrl },
        redirect: "follow",
      });
      if (!playerRes.ok) continue;
      const playerHtml = await playerRes.text();

      const cdnMatch = playerHtml.match(/(https?:\/\/cdn\.cineveo\.site\/[^\s"'<>\\]+\.mp4)/i) ||
                       playerHtml.match(/(https?:\/\/[^\s"'<>\\]+\.mp4)/i);
      if (cdnMatch?.[1] && !cdnMatch[1].includes("googletagmanager")) {
        console.log(`[cineveo] Found series CDN via iframe: ${cdnMatch[1]}`);
        return { url: cdnMatch[1], type: "mp4" };
      }
    } catch { /* skip */ }
  }

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

    // 1. Check cache
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

    // 2. Try providers
    let videoUrl: string | null = null;
    let videoType: "mp4" | "m3u8" = "mp4";
    let provider = "cineveo";

    const shouldTry = (p: string) => !force_provider || force_provider === p;

    if (shouldTry("cineveo") && !videoUrl) {
      try {
        const cv = await tryCineveo(tmdb_id, cType, season, episode);
        if (cv) { videoUrl = cv.url; videoType = cv.type; provider = "cineveo"; }
      } catch (err) { console.log(`[extract] CineVeo error: ${err}`); }
    }

    if (shouldTry("megaembed") && !videoUrl) {
      const me = await tryMegaEmbed(tmdb_id, isMovie, s, e);
      if (me) { videoUrl = me.url; videoType = me.type; provider = "megaembed"; }
    }

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
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "tmdb_id,content_type,audio_type,season,episode" });

      return new Response(JSON.stringify({
        url: videoUrl, type: videoType, provider, cached: false,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[extract] No direct video URL found (force_provider=${force_provider || "all"})`);
    return new Response(JSON.stringify({
      url: null,
      provider: "none",
      tried: force_provider || "all",
      message: force_provider
        ? `Provedor "${force_provider}" não possui este conteúdo`
        : "Nenhum provedor retornou vídeo",
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
