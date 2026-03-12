/**
 * Video URL layer — CineVeo streams on cineveo.lat.
 * Production uses Vercel rewrites, preview/dev uses raw URLs.
 */

// CineVeo credentials
const CUSER = "lyneflix-vods";
const CPASS = "uVljs2d";
const CINEVEO_HOST = "cineveo.lat";

/** Check if running on production domain with proxy rewrites (Vercel or Netlify) */
export function isProductionDomain(): boolean {
  const h = window.location.hostname.toLowerCase();
  return (
    h === "lyneflix.online" ||
    h.endsWith(".lyneflix.online") ||
    h.endsWith(".netlify.app") ||
    h.endsWith(".vercel.app")
  );
}

/**
 * Build a movie video URL (fallback only — prefer extract-video API).
 */
export function buildMovieUrl(tmdbId: number): string {
  if (isProductionDomain()) {
    return `/v/e/movie/${CUSER}/${CPASS}/${tmdbId}.mp4`;
  }
  return `https://${CINEVEO_HOST}/movie/${CUSER}/${CPASS}/${tmdbId}.mp4`;
}

/**
 * Build a series episode video URL (fallback only — prefer extract-video API).
 */
export function buildEpisodeUrl(tmdbId: number, season: number, episode: number): string {
  if (isProductionDomain()) {
    return `/v/e/series/${CUSER}/${CPASS}/${tmdbId}/${season}/${episode}.mp4`;
  }
  return `https://${CINEVEO_HOST}/series/${CUSER}/${CPASS}/${tmdbId}/${season}/${episode}.mp4`;
}

/**
 * Convert CineVeo URL to first-party path on production.
 */
export function toFirstPartyUrl(url: string): string {
  if (!isProductionDomain()) return url;
  
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    
    if (host === CINEVEO_HOST || host === "cinetvembed.cineveo.site" || host.endsWith(".cineveo.site") || host.endsWith(".cineveo.lat")) {
      return `/v/e${parsed.pathname}`;
    }
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
 * Sign/transform a video URL for the current environment.
 * Production: Vercel rewrites. Preview/dev: raw URL (no proxy).
 */
export async function signVideoUrl(rawUrl: string): Promise<string> {
  if (isProductionDomain()) {
    return toFirstPartyUrl(rawUrl);
  }
  return rawUrl;
}

/** Legacy compat */
export async function getSignedVideoUrl(rawUrl: string): Promise<string> {
  return rawUrl;
}

export function startTokenRefresh(_rawUrl: string, _onNewUrl: (url: string) => void): () => void {
  return () => {};
}

export async function secureVideoUrl(rawUrl: string): Promise<string> {
  return rawUrl;
}

export function secureVideoUrlSync(rawUrl: string): string {
  return rawUrl;
}
