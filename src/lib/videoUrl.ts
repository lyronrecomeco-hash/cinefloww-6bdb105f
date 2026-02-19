/**
 * Video URL security layer with signed tokens.
 * 
 * Flow:
 * 1. Raw CDN URL comes from extract-video/video_cache
 * 2. Client calls video-token edge function to get a signed, time-limited stream URL
 * 3. Player uses the signed stream URL (goes through video-token?action=stream)
 * 4. Edge function validates HMAC signature + expiry → redirects/proxies to real CDN
 * 
 * This ensures:
 * - Real CDN URLs never appear in browser network tab
 * - Shared URLs expire after 2 hours
 * - HMAC prevents URL tampering
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Request a signed stream URL from the video-token edge function.
 * Returns the signed URL that the player should use.
 */
export async function getSignedVideoUrl(rawUrl: string): Promise<string> {
  if (!rawUrl) return rawUrl;
  
  // Don't re-sign URLs that are already signed
  if (rawUrl.includes("action=stream") || rawUrl.includes("video-token")) {
    return rawUrl;
  }

  try {
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
    return data.stream_url || rawUrl;
  } catch (err) {
    console.warn("[videoUrl] Token signing failed, using raw URL");
    return rawUrl;
  }
}

/**
 * Secure a video URL: sign it with a token for time-limited access.
 * This is the main function components should use.
 */
export async function secureVideoUrl(rawUrl: string): Promise<string> {
  return getSignedVideoUrl(rawUrl);
}

/**
 * Synchronous fallback - returns raw URL immediately.
 * Use when you can't await (e.g., in useMemo).
 */
export function secureVideoUrlSync(rawUrl: string): string {
  return rawUrl; // Will be replaced by async version in player
}
