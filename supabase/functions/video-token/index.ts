import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cf-fp, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

      const fetchHeaders: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Referer": new URL(realUrl).origin + "/",
        "Connection": "keep-alive",
        "Accept": "*/*",
      };

      // Determine the base URL for this proxy (so we can rewrite segment URLs)
      const proxyBase = `${Deno.env.get("SUPABASE_URL") || ""}/functions/v1/video-token`;

      // Check if URL looks like HLS
      const isHlsUrl = realUrl.includes(".m3u8") || realUrl.includes("/master") || realUrl.includes("/playlist") || realUrl.includes("index-");

      // Helper: rewrite HLS manifest, pre-fetching init segment with cookies to avoid 404
      const rewriteManifest = async (manifestUrl: string, manifestResp: Response): Promise<Response> => {
        // Extract cookies from manifest response for init segment fetch
        const setCookies = manifestResp.headers.getSetCookie?.() || [];
        const cookieStr = setCookies.map(c => c.split(";")[0]).join("; ");
        
        let body = await manifestResp.text();
        const manifestBaseUrl = manifestUrl.substring(0, manifestUrl.lastIndexOf("/") + 1);
        const toProxied = (segUrl: string): string => {
          const abs = segUrl.startsWith("http") ? segUrl : manifestBaseUrl + segUrl;
          const enc = encryptUrl(abs);
          return `${proxyBase}?action=pmedia&u=${encodeURIComponent(enc)}`;
        };

        // Pre-fetch init segment with cookies from manifest response
        const initMatch = body.match(/#EXT-X-MAP:URI="([^"]+)"/);
        if (initMatch) {
          const initRel = initMatch[1];
          const initAbs = initRel.startsWith("http") ? initRel : manifestBaseUrl + initRel;
          console.log("[stream] Pre-fetching init segment:", initAbs.substring(0, 80));
          
          let initData: ArrayBuffer | null = null;
          
          // Try multiple approaches to fetch init segment
          const initHeaders = { ...fetchHeaders };
          if (cookieStr) initHeaders["Cookie"] = cookieStr;
          
          for (const ref of [fetchHeaders["Referer"], manifestUrl, initAbs]) {
            try {
              const r = await fetch(initAbs, { 
                headers: { ...initHeaders, "Referer": ref }, 
                redirect: "follow" 
              });
              if (r.ok) {
                const buf = await r.arrayBuffer();
                if (buf.byteLength > 0) {
                  initData = buf;
                  console.log("[stream] Init OK with Referer:", ref?.substring(0, 50), "size:", buf.byteLength);
                  break;
                }
              } else {
                await r.text().catch(() => {});
                console.log("[stream] Init failed with Referer:", ref?.substring(0, 50), "status:", r.status);
              }
            } catch (e) {
              console.log("[stream] Init fetch error:", e);
            }
          }
          
          if (initData && initData.byteLength > 0) {
            // Encode init data as base64 and serve via pinit action
            const bytes = new Uint8Array(initData);
            const b64 = btoa(String.fromCharCode(...bytes));
            const pinitUrl = `${proxyBase}?action=pinit&d=${encodeURIComponent(b64)}`;
            console.log("[stream] Using pinit for init segment, size:", bytes.byteLength);
            body = body.replace(/#EXT-X-MAP:URI="[^"]*"/, `#EXT-X-MAP:URI="${pinitUrl}"`);
          } else {
            // Cannot get init segment — strip it and hope segments are self-init
            console.warn("[stream] Init segment unavailable after all attempts, stripping EXT-X-MAP");
            body = body.replace(/#EXT-X-MAP:URI="[^"]*"\n?/g, "");
          }
        }

        // Rewrite segment URLs
        body = body.replace(/^(?!#)(\S+)$/gm, (match) => {
          return toProxied(match.trim());
        });

        return new Response(body, {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": "no-store, private",
            "X-Robots-Tag": "noindex",
          },
        });
      };

      console.log("[stream] Real URL:", realUrl.substring(0, 100));

      if (isHlsUrl) {
        console.log("[stream] Fetching HLS manifest...");
        try {
          const resp = await fetch(realUrl, { headers: fetchHeaders, redirect: "follow" });
          console.log("[stream] HLS response status:", resp.status, "url:", (resp.url || realUrl).substring(0, 80));
          if (!resp.ok) {
            const errBody = await resp.text().catch(() => "");
            console.error("[stream] HLS upstream error:", resp.status, errBody.substring(0, 200));
            
            // Try mp4 variant as fallback
            const mp4Url = realUrl.replace(/\.m3u8$/, ".mp4");
            console.log("[stream] Trying MP4 fallback:", mp4Url.substring(0, 80));
            const mp4Resp = await fetch(mp4Url, { method: "HEAD", headers: fetchHeaders, redirect: "follow" });
            const mp4Final = mp4Resp.url || mp4Url;
            await mp4Resp.text().catch(() => {});
            
            if (mp4Resp.ok || mp4Resp.status === 302 || mp4Resp.status === 301) {
              console.log("[stream] MP4 redirect to:", mp4Final.substring(0, 80));
              return new Response(null, {
                status: 302,
                headers: {
                  ...corsHeaders,
                  "Location": mp4Final,
                  "Cache-Control": "no-store, private",
                  "Referrer-Policy": "no-referrer",
                },
              });
            }
            
            return new Response("Upstream error", { status: 502, headers: corsHeaders });
          }
          return rewriteManifest(realUrl, resp);
        } catch (e) {
          console.error("[stream] HLS fetch exception:", e);
          return new Response("Upstream error", { status: 502, headers: corsHeaders });
        }
      }

      // Non-HLS content (MP4, etc.)
      console.log("[stream] Fetching non-HLS (HEAD):", realUrl.substring(0, 80));
      const headResp = await fetch(realUrl, { method: "HEAD", headers: fetchHeaders, redirect: "follow" });
      const finalUrl = headResp.url || realUrl;
      const upstreamCT = headResp.headers.get("content-type") || "";
      await headResp.text().catch(() => {});
      console.log("[stream] HEAD result:", headResp.status, "ct:", upstreamCT, "final:", finalUrl.substring(0, 80));

      // Check if the redirected URL is actually HLS
      const isActuallyHls = upstreamCT.includes("mpegurl") || finalUrl.includes(".m3u8");

      if (isActuallyHls) {
        const hlsHeaders = { ...fetchHeaders, "Referer": new URL(finalUrl).origin + "/" };
        const resp = await fetch(finalUrl, { headers: hlsHeaders, redirect: "follow" });
        if (!resp.ok) {
          const errBody = await resp.text().catch(() => "");
          console.error("[stream] Redirected HLS error:", resp.status, errBody.substring(0, 200));
          return new Response("Upstream error", { status: 502, headers: corsHeaders });
        }
        return rewriteManifest(finalUrl, resp);
      }

      // MP4/other: redirect browser to the final URL.
      console.log("[stream] Redirecting to final URL:", finalUrl.substring(0, 80));
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          "Location": finalUrl,
          "Cache-Control": "no-store, private",
          "Referrer-Policy": "no-referrer",
          "X-Robots-Tag": "noindex",
        },
      });
    }

    // === PINIT: Serve base64-encoded init segment data inline ===
    if (action === "pinit") {
      const b64Data = url.searchParams.get("d");
      if (!b64Data) {
        return new Response("Bad Request", { status: 400, headers: corsHeaders });
      }
      try {
        const binary = atob(b64Data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Response(bytes, {
          headers: { ...corsHeaders, "Content-Type": "video/mp4", "Cache-Control": "public, max-age=3600" },
        });
      } catch {
        return new Response("Bad Request", { status: 400, headers: corsHeaders });
      }
    }

    // === PMEDIA: Lightweight proxy for HLS segments (no signing, just XOR-encrypted URL) ===
    if (action === "pmedia") {
      const encUrl = url.searchParams.get("u");
      if (!encUrl) {
        return new Response("Bad Request", { status: 400, headers: corsHeaders });
      }
      const segUrl = decryptUrl(encUrl);
      console.log("[pmedia] Decrypted URL:", segUrl.substring(0, 80));
      if (!segUrl.startsWith("http")) {
        console.error("[pmedia] Invalid URL after decrypt:", segUrl.substring(0, 50));
        return new Response("Bad Request", { status: 400, headers: corsHeaders });
      }

      const segHeaders: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Connection": "keep-alive",
      };
      try { segHeaders["Referer"] = new URL(segUrl).origin + "/"; } catch {}
      
      const rangeHeader = req.headers.get("Range");
      if (rangeHeader) segHeaders["Range"] = rangeHeader;

      const segResp = await fetch(segUrl, { headers: segHeaders, redirect: "follow" });
      console.log("[pmedia] Upstream status:", segResp.status);
      if (!segResp.ok && segResp.status !== 206) {
        // For init segments that return 404, return empty response so hls.js doesn't fatally error
        const isInitSeg = segUrl.includes("init-") || segUrl.endsWith(".woff") || segUrl.endsWith(".woff2");
        if (isInitSeg && segResp.status === 404) {
          console.warn("[pmedia] Init segment 404, returning empty:", segUrl.substring(0, 80));
          return new Response(new Uint8Array(0), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "video/mp4", "Content-Length": "0" },
          });
        }
        const errBody = await segResp.text().catch(() => "");
        console.error("[pmedia] Upstream error:", segResp.status, errBody.substring(0, 200));
        return new Response("Upstream error", { status: 502, headers: corsHeaders });
      }

      const rh: Record<string, string> = {
        ...corsHeaders,
        "Cache-Control": "public, max-age=3600",
        "X-Robots-Tag": "noindex",
      };
      for (const h of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"]) {
        const val = segResp.headers.get(h);
        if (val) rh[h] = val;
      }
      if (!rh["Content-Type"]) rh["Content-Type"] = "video/mp2t";

      return new Response(segResp.body, { status: segResp.status, headers: rh });
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
