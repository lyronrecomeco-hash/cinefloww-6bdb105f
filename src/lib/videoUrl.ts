/**
 * Video URL layer — direct streaming via Vercel rewrites (no edge function proxy).
 * In production, URLs go through /v/e/ rewrite to avoid CORS/Referer blocks.
 * Credentials are obfuscated to prevent plain-text scraping.
 */

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

/**
 * Detect if we're on a production domain (custom domain or published Lovable app).
 * In production, use Vercel rewrites (/v/e/) to avoid CORS.
 * In dev/preview, use direct URLs.
 */
function useRewrite(): boolean {
  const h = window.location.hostname;
  // Lovable preview doesn't have Vercel rewrites
  if (h.includes("lovableproject.com") || h === "localhost" || h === "127.0.0.1") return false;
  return true;
}

/** Build a movie video URL */
export function buildMovieUrl(tmdbId: number): string {
  if (useRewrite()) {
    return `${window.location.origin}/v/e/movie/${getUser()}/${getPass()}/${tmdbId}.mp4`;
  }
  return `https://${getHost()}/movie/${getUser()}/${getPass()}/${tmdbId}.mp4`;
}

/** Build a series episode video URL */
export function buildEpisodeUrl(tmdbId: number, season: number, episode: number): string {
  if (useRewrite()) {
    return `${window.location.origin}/v/e/series/${getUser()}/${getPass()}/${tmdbId}/${season}/${episode}.mp4`;
  }
  return `https://${getHost()}/series/${getUser()}/${getPass()}/${tmdbId}/${season}/${episode}.mp4`;
}

/** Legacy compat — returns URL directly (no proxy) */
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
