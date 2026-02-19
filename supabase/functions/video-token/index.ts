import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// HMAC-SHA256 signing using Web Crypto API
async function hmacSign(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function hmacVerify(data: string, signature: string, secret: string): Promise<boolean> {
  const expected = await hmacSign(data, secret);
  return expected === signature;
}

// Simple XOR + base64 for URL encryption (not cryptographic, just obfuscation)
function encryptUrl(url: string): string {
  const key = 0x7E;
  return btoa(
    url.split("").map((c) => String.fromCharCode(c.charCodeAt(0) ^ key)).join("")
  );
}

function decryptUrl(encoded: string): string {
  const key = 0x7E;
  return atob(encoded)
    .split("")
    .map((c) => String.fromCharCode(c.charCodeAt(0) ^ key))
    .join("");
}

const SIGNING_SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "fallback-secret";
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "sign";

  try {
    // === SIGN: Generate a signed token for a video URL ===
    if (action === "sign" && req.method === "POST") {
      const { video_url } = await req.json();
      if (!video_url || typeof video_url !== "string") {
        return new Response(JSON.stringify({ error: "video_url required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const expires = Date.now() + TOKEN_TTL_MS;
      const encrypted = encryptUrl(video_url);
      const payload = `${encrypted}.${expires}`;
      const signature = await hmacSign(payload, SIGNING_SECRET);
      const token = `${payload}.${signature}`;

      // Build stream URL — prefer client origin to hide backend domain
      const clientOrigin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/$/, "") || "";
      const baseUrl = clientOrigin || Deno.env.get("SUPABASE_URL") || url.origin;
      const streamPath = `/functions/v1/video-token?action=stream&t=${encodeURIComponent(token)}`;
      // If client origin is available, use /b/ proxy path; otherwise use full supabase URL
      const streamUrl = clientOrigin 
        ? `${clientOrigin}/b${streamPath}`
        : `${baseUrl}${streamPath}`;

      return new Response(JSON.stringify({ stream_url: streamUrl, expires }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === STREAM: Validate token and redirect to real URL ===
    if (action === "stream") {
      const token = url.searchParams.get("t");
      if (!token) {
        return new Response("Token missing", { status: 403, headers: corsHeaders });
      }

      const parts = token.split(".");
      if (parts.length !== 3) {
        return new Response("Invalid token format", { status: 403, headers: corsHeaders });
      }

      const [encrypted, expiresStr, signature] = parts;
      const payload = `${encrypted}.${expiresStr}`;

      // Verify HMAC signature
      const valid = await hmacVerify(payload, signature, SIGNING_SECRET);
      if (!valid) {
        return new Response("Invalid signature", { status: 403, headers: corsHeaders });
      }

      // Check expiry
      const expires = parseInt(expiresStr, 10);
      if (Date.now() > expires) {
        return new Response("Token expired", { status: 410, headers: corsHeaders });
      }

      // Decrypt and redirect
      const realUrl = decryptUrl(encrypted);

      // Validate it looks like a video URL
      if (!realUrl.startsWith("http")) {
        return new Response("Invalid URL", { status: 400, headers: corsHeaders });
      }

      // For .m3u8 manifests, we need to proxy (not redirect) to avoid CORS issues
      if (realUrl.includes(".m3u8") || realUrl.includes("/master") || realUrl.includes("/playlist") || realUrl.includes("index-")) {
        const resp = await fetch(realUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": new URL(realUrl).origin + "/",
          },
        });

        if (!resp.ok) {
          return new Response("Upstream error", { status: 502, headers: corsHeaders });
        }

        let body = await resp.text();

        // Rewrite relative segment URLs in the manifest to absolute proxied URLs
        // This ensures .ts segments also go through our token system
        const manifestBaseUrl = realUrl.substring(0, realUrl.lastIndexOf("/") + 1);
        body = body.replace(/^(?!#)(.+\.ts.*)$/gm, (match) => {
          if (match.startsWith("http")) return match;
          return manifestBaseUrl + match;
        });

        return new Response(body, {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": "no-store, private",
            "X-Robots-Tag": "noindex",
          },
        });
      }

      // For .mp4 and other files, PROXY instead of redirect to hide real CDN
      const rangeHeader = req.headers.get("Range");
      const fetchHeaders: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": new URL(realUrl).origin + "/",
      };
      if (rangeHeader) {
        fetchHeaders["Range"] = rangeHeader;
      }

      const mediaResp = await fetch(realUrl, { headers: fetchHeaders });

      if (!mediaResp.ok && mediaResp.status !== 206) {
        return new Response("Upstream error", { status: 502, headers: corsHeaders });
      }

      const responseHeaders: Record<string, string> = {
        ...corsHeaders,
        "Cache-Control": "no-store, private",
        "X-Robots-Tag": "noindex",
      };

      // Forward essential headers from upstream
      const forwardHeaders = ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"];
      for (const h of forwardHeaders) {
        const val = mediaResp.headers.get(h);
        if (val) responseHeaders[h] = val;
      }

      // Ensure content type
      if (!responseHeaders["Content-Type"]) {
        responseHeaders["Content-Type"] = "video/mp4";
      }

      return new Response(mediaResp.body, {
        status: mediaResp.status, // 200 or 206 for range requests
        headers: responseHeaders,
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[video-token] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
