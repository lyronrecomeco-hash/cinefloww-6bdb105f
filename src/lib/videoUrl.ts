/**
 * Video URL layer — all CineVeo streams are signed via video-token edge function
 * to bypass CORS/Referer blocks in any environment (preview, production, custom domain).
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

/** Build a raw movie video URL (not proxied) */
export function buildMovieUrl(tmdbId: number): string {
  return `https://${getHost()}/movie/${getUser()}/${getPass()}/${tmdbId}.mp4`;
}

/** Build a raw series episode video URL (not proxied) */
export function buildEpisodeUrl(tmdbId: number, season: number, episode: number): string {
  return `https://${getHost()}/series/${getUser()}/${getPass()}/${tmdbId}/${season}/${episode}.mp4`;
}

/**
 * Sign a video URL through video-token edge function.
 * Returns a proxied stream_url that bypasses CORS/Referer.
 */
export async function signVideoUrl(rawUrl: string): Promise<string> {
  try {
    const { data, error } = await supabase.functions.invoke("video-token", {
      body: { video_url: rawUrl },
    });
    if (error || !data?.stream_url) {
      console.warn("[videoUrl] Sign failed, using raw URL:", error);
      return rawUrl;
    }
    return data.stream_url;
  } catch (e) {
    console.warn("[videoUrl] Sign error:", e);
    return rawUrl;
  }
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
