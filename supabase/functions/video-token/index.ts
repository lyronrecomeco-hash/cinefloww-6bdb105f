import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cf-fp",
};

// HMAC-SHA256 signing using Web Crypto API
async function hmacSign(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacVerify(data: string, signature: string, secret: string): Promise<boolean> {
  const expected = await hmacSign(data, secret);
  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

// XOR + base64 obfuscation for URL
function encryptUrl(url: string): string {
  const key = 0x7E;
  return btoa(url.split("").map((c) => String.fromCharCode(c.charCodeAt(0) ^ key)).join(""));
}

function decryptUrl(encoded: string): string {
  const key = 0x7E;
  return atob(encoded).split("").map((c) => String.fromCharCode(c.charCodeAt(0) ^ key)).join("");
}

// Hash UA only for fingerprint binding (IP varies between sign/stream due to proxy)
async function hashFingerprint(_ip: string, ua: string): Promise<string> {
  const data = new TextEncoder().encode(ua + "|vt-salt-2025");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join("");
}

const SIGNING_SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "fallback-secret";
const TOKEN_TTL_MS = 60 * 1000; // 60 seconds — ultra-short lived

function getClientIP(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
         req.headers.get("cf-connecting-ip") || "unknown";
}

function getClientUA(req: Request): string {
  return (req.headers.get("user-agent") || "unknown").substring(0, 150);
}

// Build stream URL. Use first-party /b proxy only on domains that actually route /b.
function buildStreamUrl(req: Request, token: string): string {
  const originHeader = req.headers.get("origin") || req.headers.get("referer") || "";
  let origin = "";
  let host = "";
  try {
    const parsed = new URL(originHeader);
    origin = parsed.origin;
    host = parsed.hostname;
  } catch {}

  const streamPath = `/functions/v1/video-token?action=stream&t=${encodeURIComponent(token)}`;

  // Only custom first-party domains with configured /b proxy should use cloaked URL.
  const canUseProxy = !!host && (
    host === "lyneflix.online" || host.endsWith(".lyneflix.online")
  );

  if (canUseProxy && origin) {
    return `${origin}/b${streamPath}`;
  }

  // Default/fallback: direct backend URL (works in preview and lovable.app domains)
  return `${Deno.env.get("SUPABASE_URL") || ""}${streamPath}`;
}

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
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ip = getClientIP(req);
      const ua = getClientUA(req);
      const fp = await hashFingerprint(ip, ua);
      const expires = Date.now() + TOKEN_TTL_MS;
      const encrypted = encryptUrl(video_url);
      
      // Token payload includes fingerprint for device binding
      const payload = `${encrypted}.${expires}.${fp}`;
      const signature = await hmacSign(payload, SIGNING_SECRET);
      const token = `${payload}.${signature}`;

      const streamUrl = buildStreamUrl(req, token);

      return new Response(JSON.stringify({ stream_url: streamUrl, expires }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === STREAM: Validate token and proxy to real URL ===
    if (action === "stream") {
      const token = url.searchParams.get("t");
      if (!token) {
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }

      const parts = token.split(".");
      if (parts.length !== 4) {
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }

      const [encrypted, expiresStr, tokenFp, signature] = parts;
      const payload = `${encrypted}.${expiresStr}.${tokenFp}`;

      // 1. Verify HMAC signature (tamper protection)
      const valid = await hmacVerify(payload, signature, SIGNING_SECRET);
      if (!valid) {
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }

      // 2. Check expiry (60s window)
      const expires = parseInt(expiresStr, 10);
      if (Date.now() > expires) {
        return new Response("Gone", { status: 410, headers: corsHeaders });
      }

      // 3. Validate device fingerprint (IP + UA binding)
      const ip = getClientIP(req);
      const ua = getClientUA(req);
      const currentFp = await hashFingerprint(ip, ua);
      if (currentFp !== tokenFp) {
        // Fingerprint mismatch — different device/network
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }

      // 4. Validate request origin/referer (allow preview + first-party domains)
      const originHeader = req.headers.get("origin") || req.headers.get("referer") || "";
      let originHost = "";
      try { originHost = originHeader ? new URL(originHeader).host : ""; } catch {}
      const requestHost = new URL(req.url).host;
      const ALLOWED = ["lyneflix.online", "lovable.app", "lovableproject.com", "lvbl.app", "lvbl.dev", "localhost"];
      const originOk = !originHost || originHost === requestHost || ALLOWED.some((d) => originHost === d || originHost.endsWith(`.${d}`));
      if (!originOk) {
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }

      // 5. Decrypt and validate target URL
      const realUrl = decryptUrl(encrypted);
      if (!realUrl.startsWith("http")) {
        return new Response("Bad Request", { status: 400, headers: corsHeaders });
      }

      // Cloudflare R2/CDF links can block server-side fetches with anti-bot HTML.
      // For these hosts, keep token validation here and then redirect browser directly.
      let realHost = "";
      try { realHost = new URL(realUrl).hostname; } catch {}
      if (realHost === "cdf.lyneflix.online" || realHost.endsWith(".lyneflix.online")) {
        return new Response(null, {
          status: 302,
          headers: {
            ...corsHeaders,
            "Location": realUrl,
            "Cache-Control": "no-store, private",
            "Referrer-Policy": "no-referrer",
            "X-Robots-Tag": "noindex",
          },
        });
      }

      const fetchHeaders: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": new URL(realUrl).origin + "/",
      };

      // For HLS manifests, proxy and rewrite segment URLs
      if (realUrl.includes(".m3u8") || realUrl.includes("/master") || realUrl.includes("/playlist") || realUrl.includes("index-")) {
        const resp = await fetch(realUrl, { headers: fetchHeaders });
        if (!resp.ok) {
          return new Response("Upstream error", { status: 502, headers: corsHeaders });
        }

        let body = await resp.text();
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

      // For MP4/other media — full body proxy with Range support
      const rangeHeader = req.headers.get("Range");
      if (rangeHeader) fetchHeaders["Range"] = rangeHeader;

      const mediaResp = await fetch(realUrl, { headers: fetchHeaders });
      if (!mediaResp.ok && mediaResp.status !== 206) {
        return new Response("Upstream error", { status: 502, headers: corsHeaders });
      }

      const responseHeaders: Record<string, string> = {
        ...corsHeaders,
        "Cache-Control": "no-store, private",
        "X-Robots-Tag": "noindex",
      };

      for (const h of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"]) {
        const val = mediaResp.headers.get(h);
        if (val) responseHeaders[h] = val;
      }
      if (!responseHeaders["Content-Type"]) responseHeaders["Content-Type"] = "video/mp4";

      return new Response(mediaResp.body, {
        status: mediaResp.status,
        headers: responseHeaders,
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[video-token] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
