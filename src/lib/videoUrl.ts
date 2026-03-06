/**
 * Video URL layer — direct streaming, no proxy.
 * Credentials are split/obfuscated to avoid plain-text scraping.
 */

// Obfuscated parts — reassembled at runtime
const _h = [99,105,110,101,116,118,101,109,98,101,100,46,99,105,110,101,118,101,111,46,115,105,116,101]; // host
const _u = [108,121,110,101,102,108,105,120,45,118,111,100,115]; // user
const _p = [117,86,108,106,115,50,100]; // pass

function _d(arr: number[]): string { return arr.map(c => String.fromCharCode(c)).join(""); }

let _base: string | null = null;
let _user: string | null = null;
let _pass: string | null = null;

function getBase(): string { if (!_base) _base = `https://${_d(_h)}`; return _base; }
function getUser(): string { if (!_user) _user = _d(_u); return _user; }
function getPass(): string { if (!_pass) _pass = _d(_p); return _pass; }

/** Build a direct CineVeo movie URL */
export function buildMovieUrl(tmdbId: number): string {
  return `${getBase()}/movie/${getUser()}/${getPass()}/${tmdbId}.mp4`;
}

/** Build a direct CineVeo series episode URL */
export function buildEpisodeUrl(tmdbId: number, season: number, episode: number): string {
  return `${getBase()}/series/${getUser()}/${getPass()}/${tmdbId}/${season}/${episode}.mp4`;
}

/** Legacy compat — now just returns the URL directly (no proxy) */
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
