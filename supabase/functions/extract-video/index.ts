import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const _k = "678cf2db5c3ab4a315d8ec632c493c7d";

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

const _h = atob("aHR0cHM6Ly9jaW5ldmVvLnNpdGU=");
const _cdn = atob("aHR0cHM6Ly9jZG4uY2luZXZlby5zaXRl");

// ── Primary source slug discovery via category API pagination ────────
async function findPrimarySlug(
  tmdbId: number,
  type: "movie" | "tv",
): Promise<string | null> {
  const srcType = type === "movie" ? "movie" : "tv";
  const tmdbStr = String(tmdbId);
  const MAX_PAGES = 500;
  const BATCH = 5;

  for (let start = 1; start <= MAX_PAGES; start += BATCH) {
    const fetches = Array.from({ length: BATCH }, (_, i) => {
      const page = start + i;
      return fetch(
        `${_h}/category.php?fetch_mode=1&type=${srcType}&page=${page}&genre=`,
        { headers: { "User-Agent": UA, Accept: "application/json, */*" } },
      )
        .then(async (res) => {
          if (!res.ok) return null;
          const data = await res.json();
          if (!data.success || !Array.isArray(data.results)) return null;
          if (data.results.length === 0) return { empty: true, page };
          const found = data.results.find(
            (item: any) => String(item.tmdb_id) === tmdbStr,
          );
          if (found?.slug) return { slug: found.slug, page };
          return null;
        })
        .catch(() => null);
    });

    const results = await Promise.all(fetches);
    
    for (const r of results) {
      if (r && "slug" in r) {
        console.log(`[src-a] Found slug via page ${r.page}: ${r.slug}`);
        return r.slug;
      }
    }

    if (results.some((r) => r && "empty" in r)) {
      console.log(`[src-a] End of ${srcType} catalog at page ~${start}`);
      break;
    }
  }

  console.log(`[src-a] Slug not found for tmdb_id=${tmdbId}`);
  return null;
}

// ── Primary source extraction ───────────────────────────────────────
async function tryPrimarySource(
  tmdbId: number,
  contentType: string,
  season?: number,
  episode?: number,
): Promise<{ url: string; type: "mp4" | "m3u8" } | null> {
  const isMovie = contentType === "movie";
  const tmdbType = isMovie ? "movie" : "tv";
  const tmdbUrl = `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${_k}&language=pt-BR`;
  console.log(`[src-a] Fetching metadata`);

  const tmdbRes = await fetch(tmdbUrl, { headers: { "User-Agent": UA } });
  if (!tmdbRes.ok) {
    console.log(`[src-a] Metadata returned ${tmdbRes.status}`);
    return null;
  }
  const tmdbData = await tmdbRes.json();
  const title = isMovie ? tmdbData.title : tmdbData.name;
  if (!title) {
    console.log("[src-a] No title found");
    return null;
  }

  const originalTitle = isMovie ? tmdbData.original_title : tmdbData.original_name;
  const pathType = isMovie ? "filme" : "serie";

  const slugs = [
    `${slugify(title)}-${tmdbId}`,
    ...(originalTitle && originalTitle !== title ? [`${slugify(originalTitle)}-${tmdbId}`] : []),
  ];

  const result = await tryPrimarySlugs(slugs, pathType, isMovie, season, episode);
  if (result) return result;

  console.log(`[src-a] Slug-based attempts failed, trying discovery...`);
  const discoveredSlug = await findPrimarySlug(tmdbId, tmdbType as "movie" | "tv");
  if (discoveredSlug && !slugs.includes(discoveredSlug)) {
    console.log(`[src-a] Trying discovered slug: ${discoveredSlug}`);
    const apiResult = await tryPrimarySlugs([discoveredSlug], pathType, isMovie, season, episode);
    if (apiResult) return apiResult;
  }

  console.log("[src-a] No video URL found");
  return null;
}

// ── Try fetching video from primary source using slug list ───────────
async function tryPrimarySlugs(
  slugs: string[],
  pathType: string,
  isMovie: boolean,
  season?: number,
  episode?: number,
): Promise<{ url: string; type: "mp4" | "m3u8" } | null> {
  for (const slug of slugs) {
    const pageUrl = `${_h}/${pathType}/${slug}.html`;
    console.log(`[src-a] Trying: ${pageUrl}`);

    const pageRes = await fetch(pageUrl, {
      headers: { "User-Agent": UA, "Referer": `${_h}/`, "Accept": "text/html,*/*" },
      redirect: "follow",
    });

    if (!pageRes.ok) {
      console.log(`[src-a] Page returned ${pageRes.status}`);
      continue;
    }

    const html = await pageRes.text();

    if (html.includes('text-yellow-500">404')) {
      console.log(`[src-a] Soft 404 detected`);
      continue;
    }

    if (!isMovie && season && episode) {
      const result = await extractSeriesEpisode(html, pageUrl, season, episode);
      if (result) return result;
    }

    const iframeMatch =
      html.match(/src=["']((?:\.\.)?\/player\/[^"']+)/i) ||
      html.match(/src=["'](\/player\/index\.php[^"']+)/i);

    if (!iframeMatch?.[1]) {
      const cdnDirect = html.match(new RegExp(`(${_cdn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\/[^\\s"'<>\\\\]+\\.mp4)`, 'i'));
      if (cdnDirect?.[1]) {
        console.log(`[src-a] Found direct CDN in page`);
        return { url: cdnDirect[1], type: "mp4" };
      }
      console.log("[src-a] No player iframe found");
      continue;
    }

    let playerPath = iframeMatch[1].replace(/^\.\.\//, "/");
    let playerUrl = `${_h}${playerPath}`;

    if (!isMovie && season && episode && !playerPath.includes("s=") && !playerPath.includes("ep=")) {
      const sep = playerPath.includes("?") ? "&" : "?";
      playerUrl += `${sep}s=${season}&e=${episode}`;
    }

    console.log(`[src-a] Player URL resolved`);

    const playerRes = await fetch(playerUrl, {
      headers: { "User-Agent": UA, "Referer": pageUrl, "Accept": "text/html,*/*" },
      redirect: "follow",
    });

    if (!playerRes.ok) {
      console.log(`[src-a] Player returned ${playerRes.status}`);
      continue;
    }

    const playerHtml = await playerRes.text();

    const cdnMatch = playerHtml.match(new RegExp(`(${_cdn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\/[^\\s"'<>\\\\]+\\.mp4)`, 'i'));
    if (cdnMatch?.[1]) {
      console.log(`[src-a] Found CDN URL`);
      return { url: cdnMatch[1], type: "mp4" };
    }

    const vodMatch = playerPath.match(/[?&]v=([^&]+)/);
    if (vodMatch?.[1]) {
      const decodedVod = decodeURIComponent(vodMatch[1]);
      console.log(`[src-a] Trying VOD URL`);
      try {
        const headRes = await fetch(decodedVod, { method: "HEAD", headers: { "User-Agent": UA } });
        if (headRes.ok) return { url: decodedVod, type: "mp4" };
      } catch { /* skip */ }
    }

    const mp4Match = playerHtml.match(/(https?:\/\/[^\s"'<>\\]+\.mp4)/i);
    if (mp4Match?.[1]) {
      console.log(`[src-a] Found generic mp4`);
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
      if (epUrl.startsWith("/")) epUrl = `${_h}${epUrl}`;
      else if (!epUrl.startsWith("http")) epUrl = new URL(epUrl, pageUrl).href;

      console.log(`[src-a] Found episode link`);
      const epRes = await fetch(epUrl, {
        headers: { "User-Agent": UA, "Referer": pageUrl },
        redirect: "follow",
      });
      if (!epRes.ok) continue;
      const epHtml = await epRes.text();

      const iframeMatch = epHtml.match(/src=["']((?:\.\.)?\/player\/[^"']+)/i);
      if (iframeMatch?.[1]) {
        let playerUrl = `${_h}${iframeMatch[1].replace(/^\.\.\//, "/")}`;
        const playerRes = await fetch(playerUrl, {
          headers: { "User-Agent": UA, "Referer": epUrl },
          redirect: "follow",
        });
        if (playerRes.ok) {
          const playerHtml = await playerRes.text();
          const cdnMatch = playerHtml.match(new RegExp(`(${_cdn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\/[^\\s"'<>\\\\]+\\.mp4)`, 'i')) ||
                           playerHtml.match(/(https?:\/\/[^\s"'<>\\]+\.mp4)/i);
          if (cdnMatch?.[1]) {
            console.log(`[src-a] Found episode CDN`);
            return { url: cdnMatch[1], type: "mp4" };
          }
        }
      }

      const cdnDirect = epHtml.match(new RegExp(`(${_cdn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\/[^\\s"'<>\\\\]+\\.mp4)`, 'i'));
      if (cdnDirect?.[1]) return { url: cdnDirect[1], type: "mp4" };
    }
  }

  const allIframes = [...html.matchAll(/src=["']((?:\.\.)?\/player\/[^"']+)/gi)];
  for (const iframe of allIframes) {
    let playerPath = iframe[1].replace(/^\.\.\//, "/");
    const sep = playerPath.includes("?") ? "&" : "?";
    const playerUrl = `${_h}${playerPath}${sep}s=${season}&e=${episode}`;
    console.log(`[src-a] Trying series player`);

    try {
      const playerRes = await fetch(playerUrl, {
        headers: { "User-Agent": UA, "Referer": pageUrl },
        redirect: "follow",
      });
      if (!playerRes.ok) continue;
      const playerHtml = await playerRes.text();

      const cdnMatch = playerHtml.match(new RegExp(`(${_cdn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\/[^\\s"'<>\\\\]+\\.mp4)`, 'i')) ||
                       playerHtml.match(/(https?:\/\/[^\s"'<>\\]+\.mp4)/i);
      if (cdnMatch?.[1] && !cdnMatch[1].includes("googletagmanager")) {
        console.log(`[src-a] Found series CDN via iframe`);
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
  console.log(`[src-b] Trying fallback`);

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
    console.log(`[src-b] Error: ${err}`);
  }
  return null;
}

// ── EmbedPlay API extraction (embedplayapi.site only) ────────────────
// Note: embedplayapi.site provides an embed iframe that redirects to 
// embedplay.click player which requires authentication. Direct video 
// extraction is attempted via the ajax API and player page parsing.
async function tryEmbedPlay(
  tmdbId: number,
  imdbId: string | null,
  isMovie: boolean,
  s: number,
  e: number,
): Promise<{ url: string; type: "mp4" | "m3u8" } | null> {
  const embedId = imdbId || tmdbId;
  const embedUrl = isMovie
    ? `https://embedplayapi.site/embed/${embedId}`
    : `https://embedplayapi.site/embed/${embedId}/${s}/${e}`;
  console.log(`[src-c] Fetching: ${embedUrl}`);

  try {
    const pageRes = await fetch(embedUrl, {
      headers: { "User-Agent": UA, "Referer": "https://embedplayapi.site/" },
      redirect: "follow",
    });
    if (!pageRes.ok) {
      console.log(`[src-c] Page returned ${pageRes.status}`);
      return null;
    }

    const html = await pageRes.text();

    // 1. Check for direct video URLs in the embed page
    const directVideo = findVideoUrl(html);
    if (directVideo) {
      console.log(`[src-c] Found video directly in embed page`);
      return directVideo;
    }

    // 2. Try server-based extraction via ajax API
    const movieIdMatch = html.match(/data-movie-id="([^"]+)"/);
    const movieId = movieIdMatch?.[1];
    if (!movieId) {
      console.log(`[src-c] No movie ID found in embed page`);
      return null;
    }

    const serverMatches = [...html.matchAll(/data-id="([^"]+)"/g)];
    console.log(`[src-c] movieId=${movieId}, servers=${serverMatches.length}`);

    for (const [, serverId] of serverMatches) {
      try {
        const apiUrl = `https://embedplayapi.site/ajax/get_stream_link?id=${serverId}&movie=${movieId}&is_init=false&captcha=&ref=`;
        const apiRes = await fetch(apiUrl, {
          headers: { "User-Agent": UA, "Referer": embedUrl, "X-Requested-With": "XMLHttpRequest" },
        });
        if (!apiRes.ok) { await apiRes.text(); continue; }

        const apiText = await apiRes.text();
        let apiData: any;
        try { apiData = JSON.parse(apiText); } catch { continue; }

        if (!apiData.success || !apiData.data?.link) continue;

        const streamLink = apiData.data.link;
        console.log(`[src-c] Server ${serverId} → ${streamLink.substring(0, 60)}`);

        // Follow the stream link to the player page
        const playerRes = await fetch(streamLink, {
          headers: { "User-Agent": UA, "Referer": embedUrl },
          redirect: "follow",
        });
        if (!playerRes.ok) { await playerRes.text(); continue; }

        const playerHtml = await playerRes.text();

        // Check if player returned a login page (embedplay.click requires auth)
        if (playerHtml.includes("auth-title") || playerHtml.includes("shortlink_auth")) {
          console.log(`[src-c] Player requires authentication, skipping`);
          continue;
        }

        // Try to find video in the player page
        const videoFromPlayer = findVideoUrl(playerHtml);
        if (videoFromPlayer) {
          console.log(`[src-c] Found video from player`);
          return videoFromPlayer;
        }

        // Try data-url attributes for vidsrc or other direct embeds
        const dataUrls = [...playerHtml.matchAll(/data-url="(https?:\/\/[^"]+)"/gi)];
        for (const [, dataUrl] of dataUrls) {
          if (dataUrl.includes(".m3u8") || dataUrl.includes(".mp4")) {
            console.log(`[src-c] Found video in data-url`);
            return { url: dataUrl, type: dataUrl.includes(".mp4") ? "mp4" : "m3u8" };
          }
          // Try fetching vidsrc/brstream URLs
          if (dataUrl.includes("vidsrc") || dataUrl.includes("brstream") || dataUrl.includes("superflixapi")) {
            console.log(`[src-c] Following external embed: ${dataUrl.substring(0, 60)}`);
            try {
              const extRes = await fetch(dataUrl, {
                headers: { "User-Agent": UA, "Referer": streamLink },
                redirect: "follow",
              });
              if (extRes.ok) {
                const extHtml = await extRes.text();
                const extVideo = findVideoUrl(extHtml);
                if (extVideo) {
                  console.log(`[src-c] Found video from external embed`);
                  return extVideo;
                }
              }
            } catch { /* skip */ }
          }
        }

        // Try ajax endpoints on the player domain
        const playerDomain = new URL(streamLink).origin;
        const ajaxPaths = [`/ajax/get_stream`, `/ajax/get_sources`];
        for (const path of ajaxPaths) {
          try {
            const ajaxRes = await fetch(`${playerDomain}${path}?id=${movieId}`, {
              headers: { "User-Agent": UA, "Referer": streamLink, "X-Requested-With": "XMLHttpRequest" },
            });
            if (!ajaxRes.ok) { await ajaxRes.text(); continue; }
            const ajaxText = await ajaxRes.text();
            const ajaxVideo = findVideoUrl(ajaxText);
            if (ajaxVideo) {
              console.log(`[src-c] Found video from ${path}`);
              return ajaxVideo;
            }
          } catch { /* skip */ }
        }
      } catch { /* skip server */ }
    }

    console.log(`[src-c] No extractable video found`);
  } catch (err) {
    console.log(`[src-c] Error: ${err}`);
  }
  return null;
}

function findVideoUrl(html: string): { url: string; type: "mp4" | "m3u8" } | null {
  // Try var sources = [...] pattern
  const srcMatch = html.match(/var\s+sources\s*=\s*(\[[\s\S]*?\]);/);
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

  // Try file:"..." or source:"..." patterns
  const fileMatch = html.match(/(?:file|source)\s*:\s*["'](https?:\/\/[^"'\s]+(?:\.m3u8|\.mp4)[^"'\s]*)/i);
  if (fileMatch?.[1]) {
    return { url: fileMatch[1], type: fileMatch[1].includes(".mp4") ? "mp4" : "m3u8" };
  }

  // Generic video URL patterns
  const patterns = [
    /["'](https?:\/\/[^"'\s]+(?:master|playlist)\.m3u8[^"'\s]*)/gi,
    /["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/gi,
    /["'](https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/gi,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const m = pattern.exec(html);
    if (m?.[1] && !m[1].includes("googletagmanager") && !m[1].includes("cdn.vidstack") && !m[1].includes("favicon")) {
      return { url: m[1], type: m[1].includes(".mp4") ? "mp4" : "m3u8" };
    }
  }

  return null;
}

// ── PlayerFlix API extraction (playerflixapi.com) ────────────────────
// PlayerFlixAPI serves content ONLY via iframe. Direct requests get a gate page.
// We mimic iframe embedding with proper headers to bypass the gate.
async function tryPlayerFlix(
  tmdbId: number,
  imdbId: string | null,
  isMovie: boolean,
  s: number,
  e: number,
): Promise<{ url: string; type: "mp4" | "m3u8" } | null> {
  const id = imdbId || String(tmdbId);
  const embedUrl = isMovie
    ? `https://playerflixapi.com/filme/${id}`
    : `https://playerflixapi.com/serie/${id}/${s}/${e}`;

  console.log(`[src-d] Fetching: ${embedUrl}`);

  try {
    // Fetch with iframe-mimicking headers to bypass gate page
    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent": UA,
        "Referer": "https://playerflixapi.com/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      console.log(`[src-d] HTTP ${res.status}`);
      return null;
    }

    const html = await res.text();

    // Detect gate page ("disponível apenas via iframe")
    const isGate = html.includes("apenas via") || html.includes("iframe</code>") || html.includes("gate-card") || html.includes("Acesso Restrito");
    if (isGate) {
      console.log(`[src-d] Gate page detected, will use iframe-proxy`);
    }

    // 1. Try direct video extraction from the HTML
    const direct = findVideoUrl(html);
    if (direct) {
      console.log(`[src-d] Found direct video URL`);
      return direct;
    }

    // 2. Look for nested embed iframes (e.g., superflixapi, vidsrc, etc.)
    const iframeRegex = /<iframe[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let iframeMatch;
    const iframes: string[] = [];
    while ((iframeMatch = iframeRegex.exec(html)) !== null) {
      let src = iframeMatch[1];
      if (src.includes("google") || src.includes("facebook") || src.includes("ads")) continue;
      if (src.startsWith("//")) src = "https:" + src;
      else if (src.startsWith("/")) {
        try { src = new URL(src, embedUrl).href; } catch { continue; }
      }
      if (src.startsWith("http")) iframes.push(src);
    }

    console.log(`[src-d] Found ${iframes.length} iframes`);

    // Follow each iframe up to 2 levels deep
    for (const iframeSrc of iframes.slice(0, 5)) {
      const result = await deepExtractFromIframe(iframeSrc, embedUrl, 0);
      if (result) {
        console.log(`[src-d] Found video via nested iframe: ${result.url.substring(0, 80)}`);
        return result;
      }
    }

    // 3. Check for JS-embedded URLs
    const jsPatterns = [
      /loadSource\s*\(\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)/i,
      /loadSource\s*\(\s*["'](https?:\/\/[^"']+\.mp4[^"']*)/i,
      /\.src\s*=\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)/i,
      /\.src\s*=\s*["'](https?:\/\/[^"']+\.mp4[^"']*)/i,
      /source\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)/i,
      /source\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)/i,
    ];
    for (const p of jsPatterns) {
      const m = p.exec(html);
      if (m?.[1]) {
        console.log(`[src-d] Found JS-embedded URL`);
        return { url: m[1], type: m[1].includes(".mp4") ? "mp4" : "m3u8" };
      }
    }

    // 4. Last resort: iframe-proxy (but only if not a gate page with no content)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const proxyUrl = `${supabaseUrl}/functions/v1/proxy-player?url=${encodeURIComponent(embedUrl)}`;
    console.log(`[src-d] Falling back to iframe-proxy`);
    return { url: proxyUrl, type: "iframe-proxy" as any };
  } catch (err) {
    console.log(`[src-d] Error: ${err}`);
    return null;
  }
}

// Follow nested iframes up to 2 levels to find video URLs
async function deepExtractFromIframe(
  url: string,
  referer: string,
  depth: number,
): Promise<{ url: string; type: "mp4" | "m3u8" } | null> {
  if (depth > 2) return null;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Referer": referer,
        "Accept": "text/html,application/xhtml+xml,*/*",
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
      },
      redirect: "follow",
    });

    if (!res.ok) return null;

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("video/") || ct.includes("mpegurl")) {
      return { url, type: ct.includes("mp4") ? "mp4" : "m3u8" };
    }

    if (!ct.includes("text/html") && !ct.includes("text/plain") && !ct.includes("application/json")) {
      return null;
    }

    const html = await res.text();

    const direct = findVideoUrl(html);
    if (direct) {
      console.log(`[src-d] Video found at iframe depth ${depth}`);
      return direct;
    }

    // Follow deeper iframes
    const iframeRegex = /<iframe[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = iframeRegex.exec(html)) !== null) {
      let src = match[1];
      if (src.includes("google") || src.includes("ads")) continue;
      if (src.startsWith("//")) src = "https:" + src;
      else if (src.startsWith("/")) {
        try { src = new URL(src, url).href; } catch { continue; }
      }
      if (src.startsWith("http")) {
        const result = await deepExtractFromIframe(src, url, depth + 1);
        if (result) return result;
      }
    }
  } catch {
    // skip
  }

  return null;
}

// ── Main handler ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tmdb_id, imdb_id, content_type, audio_type, season, episode, force_provider, title: reqTitle } = await req.json();

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

    // 2. Try providers (internal codenames mapped)
    const _pMap: Record<string, string> = { "cineveo": "src-a", "megaembed": "src-b", "embedplay": "src-c", "playerflix": "src-d" };
    let videoUrl: string | null = null;
    let videoType: "mp4" | "m3u8" = "mp4";
    let provider = "cineveo";

    const shouldTry = (p: string) => !force_provider || force_provider === p;

    if (shouldTry("cineveo") && !videoUrl) {
      try {
        const cv = await tryPrimarySource(tmdb_id, cType, season, episode);
        if (cv) { videoUrl = cv.url; videoType = cv.type; provider = "cineveo"; }
      } catch (err) { console.log(`[extract] Provider A error: ${err}`); }
    }

    if (shouldTry("megaembed") && !videoUrl) {
      const me = await tryMegaEmbed(tmdb_id, isMovie, s, e);
      if (me) { videoUrl = me.url; videoType = me.type; provider = "megaembed"; }
    }

    if (shouldTry("embedplay") && !videoUrl) {
      const ep = await tryEmbedPlay(tmdb_id, imdb_id || null, isMovie, s, e);
      if (ep) { videoUrl = ep.url; videoType = ep.type; provider = "embedplay"; }
    }

    if (shouldTry("playerflix") && !videoUrl) {
      const pf = await tryPlayerFlix(tmdb_id, imdb_id || null, isMovie, s, e);
      if (pf) {
        // Don't cache iframe-proxy results
        if ((pf.type as string) === "iframe-proxy") {
          return new Response(JSON.stringify({
            url: pf.url, type: "iframe-proxy", provider: "playerflix", cached: false,
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        videoUrl = pf.url; videoType = pf.type; provider = "playerflix";
      }
    }

    // 3. Save to cache, log & return
    if (videoUrl) {
      console.log(`[extract] Success via ${_pMap[provider] || provider}`);
      await supabase.from("video_cache").upsert({
        tmdb_id, content_type: cType, audio_type: aType,
        season: season || null, episode: episode || null,
        video_url: videoUrl, video_type: videoType, provider,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "tmdb_id,content_type,audio_type,season,episode" });

      // Log success
      const logTitle = reqTitle || `TMDB ${tmdb_id}`;
      await supabase.from("resolve_logs").insert({
        tmdb_id, title: logTitle, content_type: cType,
        season: season || null, episode: episode || null,
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
      season: season || null, episode: episode || null,
      provider: force_provider || "all", success: false,
      error_message: "Nenhum provedor retornou vídeo",
    });

    console.log(`[extract] No video found (provider=${force_provider || "all"})`);
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
