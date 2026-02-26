/**
 * Video URL security layer with signed tokens.
 * 
 * Tokens are ultra-short lived (60s) and bound to IP+UA.
 * Auto-refresh ensures continuous playback.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

let _tokenCache: { rawUrl: string; streamUrl: string; expires: number } | null = null;
const REFRESH_MARGIN_MS = 15_000;

export async function getSignedVideoUrl(rawUrl: string): Promise<string> {
  if (!rawUrl) return rawUrl;
  if (rawUrl.includes("action=stream") || rawUrl.includes("video-token")) return rawUrl;

  // Cloudflare R2/CDN e CineVeo MP4 direto devem ir nativo no browser.
  // Evita token/proxy desnecessário que pode quebrar alguns provedores.
  const lowerUrl = rawUrl.toLowerCase();
  const directHosts = [
    "cdf.lyneflix.online/vd/",
  ];
  if (directHosts.some((h) => lowerUrl.includes(h))) return rawUrl;

  // Check cache
  if (_tokenCache && _tokenCache.rawUrl === rawUrl && Date.now() < _tokenCache.expires - REFRESH_MARGIN_MS) {
    return _tokenCache.streamUrl;
  }

  try {
    // Use fetch (intercepted by networkCloak) with query param for action
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/video-token?action=sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ video_url: rawUrl }),
    });

    if (!resp.ok) {
      console.warn("[videoUrl] Failed to sign URL, using raw:", resp.status);
      return rawUrl;
    }

    const data = await resp.json();
    if (!data.stream_url) return rawUrl;

    _tokenCache = {
      rawUrl,
      streamUrl: data.stream_url,
      expires: data.expires || Date.now() + 55_000,
    };

    return data.stream_url;
  } catch (err) {
    console.warn("[videoUrl] Token signing failed, using raw URL");
    return rawUrl;
  }
}

/**
 * Start auto-refreshing the token for continuous playback.
 * Returns a cleanup function to stop refreshing.
 */
export function startTokenRefresh(rawUrl: string, onNewUrl: (url: string) => void): () => void {
  let active = true;
  
  const refresh = async () => {
    if (!active) return;
    try {
      _tokenCache = null;
      const newUrl = await getSignedVideoUrl(rawUrl);
      if (active) onNewUrl(newUrl);
    } catch {}
    if (active) setTimeout(refresh, 45_000);
  };

  const timer = setTimeout(refresh, 45_000);
  return () => { active = false; clearTimeout(timer); };
}

export async function secureVideoUrl(rawUrl: string): Promise<string> {
  return getSignedVideoUrl(rawUrl);
}

export function secureVideoUrlSync(rawUrl: string): string {
  return rawUrl;
}
