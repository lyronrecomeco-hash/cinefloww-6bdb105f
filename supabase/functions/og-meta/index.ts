import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * og-meta: Returns dynamic HTML with OG meta tags for content detail pages.
 * Bots (Google, Facebook, Twitter, etc.) get SSR HTML with proper meta.
 * Regular users get redirected to the SPA.
 */

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE = "https://lyneflix.online";
const TMDB_IMG = "https://image.tmdb.org/t/p";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BOT_UA = /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|facebookexternalhit|twitterbot|rogerbot|linkedinbot|embedly|quora|pinterest|discord|telegram|whatsapp|slack|vkshare|facebot|outbrain|w3c_validator/i;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.searchParams.get("path") || "";
    const ua = req.headers.get("user-agent") || "";

    // Only serve SSR HTML to bots
    if (!BOT_UA.test(ua)) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${SITE}${path}`, ...corsHeaders },
      });
    }

    // Parse path: /filme/slug-12345 or /serie/slug-12345
    const match = path.match(/^\/(filme|serie)\/(.+)-(\d+)$/);
    if (!match) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${SITE}${path}`, ...corsHeaders },
      });
    }

    const [, pageType, , tmdbIdStr] = match;
    const tmdbId = Number(tmdbIdStr);
    const isMovie = pageType === "filme";

    const db = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
    const { data: content } = await db
      .from("content")
      .select("title, original_title, overview, poster_path, backdrop_path, vote_average, release_date, content_type")
      .eq("tmdb_id", tmdbId)
      .limit(1)
      .single();

    if (!content) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${SITE}${path}`, ...corsHeaders },
      });
    }

    const title = escapeHtml(content.title || "LyneFlix");
    const desc = escapeHtml(
      content.overview
        ? content.overview.substring(0, 155) + (content.overview.length > 155 ? "..." : "")
        : `Assista ${title} grátis online em HD na LyneFlix.`
    );
    const poster = content.poster_path ? `${TMDB_IMG}/w500${content.poster_path}` : `${SITE}/pwa-512.png`;
    const backdrop = content.backdrop_path ? `${TMDB_IMG}/w1280${content.backdrop_path}` : poster;
    const year = content.release_date ? content.release_date.split("-")[0] : "";
    const rating = content.vote_average ? Number(content.vote_average).toFixed(1) : "";
    const typeLabel = isMovie ? "Filme" : "Série";
    const fullTitle = `${title}${year ? ` (${year})` : ""} - Assistir ${typeLabel} Grátis | LyneFlix`;
    const canonicalUrl = `${SITE}${path}`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fullTitle}</title>
  <meta name="description" content="${desc}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta name="robots" content="index, follow, max-image-preview:large">

  <!-- Open Graph -->
  <meta property="og:type" content="${isMovie ? "video.movie" : "video.tv_show"}">
  <meta property="og:title" content="${fullTitle}">
  <meta property="og:description" content="${desc}">
  <meta property="og:image" content="${backdrop}">
  <meta property="og:image:width" content="1280">
  <meta property="og:image:height" content="720">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:site_name" content="LyneFlix">
  <meta property="og:locale" content="pt_BR">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${fullTitle}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${backdrop}">

  <!-- JSON-LD -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "${isMovie ? "Movie" : "TVSeries"}",
    "name": "${title}",
    ${content.original_title ? `"alternateName": "${escapeHtml(content.original_title)}",` : ""}
    "description": "${desc}",
    "image": "${poster}",
    ${year ? `"datePublished": "${content.release_date}",` : ""}
    ${rating ? `"aggregateRating": {"@type": "AggregateRating", "ratingValue": "${rating}", "bestRating": "10"},` : ""}
    "url": "${canonicalUrl}"
  }
  </script>

  <!-- Redirect non-bots to SPA -->
  <meta http-equiv="refresh" content="0;url=${canonicalUrl}">
</head>
<body>
  <h1>${title}</h1>
  <p>${desc}</p>
  <img src="${poster}" alt="${title}" width="342" height="513">
  <a href="${canonicalUrl}">Assistir ${title} na LyneFlix</a>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        ...corsHeaders,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "OG meta generation failed";
    console.error("[og-meta] Error:", msg);
    return new Response(null, {
      status: 302,
      headers: { Location: SITE, ...corsHeaders },
    });
  }
});
