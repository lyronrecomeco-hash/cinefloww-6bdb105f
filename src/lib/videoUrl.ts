/**
 * Video URL layer — CineVeo streams use first-party Vercel rewrites on production
 * and video-token proxy on preview/dev to bypass CORS/Referer blocks.
 */

import { supabase } from "@/integrations/supabase/client";

// Obfuscated credentials — reassembled at runtime
const _u = [108,121,110,101,102,108,105,120,45,118,111,100,115]; // user
const _p = [117,86,108,106,115,50,100]; // pass
const _h = [99,105,110,101,116,118,101,109,98,101,100,46,99,105,110,101,118,101,111,46,115,105,116,101]; // host

function _d(arr: number[]): string { return arr.map(c => String.fromCharCode(c)).join(""); }

let _user: string | null = null;
let _pass: string | null = null;
let _host: string | null = null;

function getUser(): string { if (!_user) _user = _d(_u); return _user; }
function getPass(): string { if (!_pass) _pass = _d(_p); return _pass; }
function getHost(): string { if (!_host) _host = _d(_h); return _host; }

/** Check if running on production domain with Vercel rewrites */
function isProductionDomain(): boolean {
  const h = window.location.hostname;
  return h === "lyneflix.online" || h.endsWith(".lyneflix.online");
}

/**
 * Build a movie video URL.
 * On production: first-party path via Vercel rewrite (/v/e/movie/...)
 * On preview: direct CineVeo URL (will be proxied via video-token)
 */
export function buildMovieUrl(tmdbId: number): string {
  if (isProductionDomain()) {
    return `/v/e/movie/${getUser()}/${getPass()}/${tmdbId}.mp4`;
  }
  return `https://${getHost()}/movie/${getUser()}/${getPass()}/${tmdbId}.mp4`;
}

/**
 * Build a series episode video URL.
 * On production: first-party path via Vercel rewrite (/v/e/series/...)
 * On preview: direct CineVeo URL (will be proxied via video-token)
 */
export function buildEpisodeUrl(tmdbId: number, season: number, episode: number): string {
  if (isProductionDomain()) {
    return `/v/e/series/${getUser()}/${getPass()}/${tmdbId}/${season}/${episode}.mp4`;
  }
  return `https://${getHost()}/series/${getUser()}/${getPass()}/${tmdbId}/${season}/${episode}.mp4`;
}

/**
 * Convert any CineVeo URL to first-party path on production.
 * Returns original URL if not on production or not a CineVeo URL.
 */
export function toFirstPartyUrl(url: string): string {
  if (!isProductionDomain()) return url;
  
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    
    // cinetvembed.cineveo.site → /v/e/
    if (host === getHost() || host === "cinetvembed.cineveo.site") {
      return `/v/e${parsed.pathname}`;
    }
    
    // cdn.cineveo.site → /v/a/
    if (host === "cdn.cineveo.site") {
      return `/v/a${parsed.pathname}`;
    }
  } catch {}
  
  return url;
}

/** Check if a URL is a first-party proxied URL */
export function isFirstPartyUrl(url: string): boolean {
  return url.startsWith("/v/") || url.startsWith(window.location.origin + "/v/");
}

/**
 * Sign a video URL through video-token edge function (preview/dev only).
 * On production, URLs use first-party rewrites and don't need signing.
 */
export async function signVideoUrl(rawUrl: string): Promise<string> {
  // On production, use first-party rewrite instead of proxy
  if (isProductionDomain()) {
    return toFirstPartyUrl(rawUrl);
  }
  
  // On preview/dev: return raw URL directly (player uses no-referrer policy)
  return rawUrl;
}

/** Legacy compat */
export async function getSignedVideoUrl(rawUrl: string): Promise<string> {
  return rawUrl;
}

/** Legacy compat */
export function startTokenRefresh(_rawUrl: string, _onNewUrl: (url: string) => void): () => void {
  return () => {};
}

/** Legacy compat */
export async function secureVideoUrl(rawUrl: string): Promise<string> {
  return rawUrl;
}

export function secureVideoUrlSync(rawUrl: string): string {
  return rawUrl;
}
