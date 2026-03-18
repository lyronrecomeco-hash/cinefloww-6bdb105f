/**
 * Video URL layer — placeholder after CineVeo removal.
 * All CineVeo-specific logic has been removed.
 */

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

/** Build a movie video URL — placeholder, no source configured */
export function buildMovieUrl(tmdbId: number): string {
  return "";
}

/** Build an episode video URL — placeholder, no source configured */
export function buildEpisodeUrl(tmdbId: number, season: number, episode: number): string {
  return "";
}

/** Convert URL to first-party path on production */
export function toFirstPartyUrl(url: string): string {
  return url;
}

/** Check if a URL is a first-party proxied URL */
export function isFirstPartyUrl(url: string): boolean {
  return url.startsWith("/v/") || url.startsWith(window.location.origin + "/v/");
}

/** Sign/transform a video URL for the current environment */
export async function signVideoUrl(rawUrl: string): Promise<string> {
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
