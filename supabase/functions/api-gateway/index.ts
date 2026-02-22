import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-cf-sig, x-cf-ts",
};

const REJECTION_MSG = "Mano, tá passando fome? pede marmita.";
const ALLOWED_ORIGIN = "lyneflix.online";

// HMAC-SHA256 using Web Crypto
async function hmacSha256(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Simple IP hash for logging (privacy-preserving)
async function hashIP(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + "cf-salt-2024");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
}

// === ADVANCED RATE LIMITING ===
// Per-IP rate limiting with sliding window
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60;
const RATE_WINDOW = 60_000;

// Per-IP burst protection (10 req in 2s = suspicious)
const burstMap = new Map<string, { count: number; resetAt: number }>();
const BURST_LIMIT = 15;
const BURST_WINDOW = 2_000;

// IP ban list (in-memory, resets on cold start)
const bannedIPs = new Map<string, number>(); // ipHash -> ban expiry timestamp
const BAN_DURATION = 5 * 60 * 1000; // 5 min ban

// Global request counter for DDoS detection
let globalReqCount = 0;
let globalReqResetAt = Date.now() + 10_000;
const GLOBAL_LIMIT = 500; // 500 req per 10s = DDoS

function checkRateLimit(key: string): { allowed: boolean; reason?: string } {
  const now = Date.now();

  // Check if banned
  const banExpiry = bannedIPs.get(key);
  if (banExpiry && now < banExpiry) {
    return { allowed: false, reason: "ip-banned" };
  } else if (banExpiry) {
    bannedIPs.delete(key);
  }

  // Global DDoS check
  if (now > globalReqResetAt) {
    globalReqCount = 0;
    globalReqResetAt = now + 10_000;
  }
  globalReqCount++;
  if (globalReqCount > GLOBAL_LIMIT) {
    return { allowed: false, reason: "ddos-protection" };
  }

  // Burst check
  const burst = burstMap.get(key);
  if (!burst || now > burst.resetAt) {
    burstMap.set(key, { count: 1, resetAt: now + BURST_WINDOW });
  } else {
    burst.count++;
    if (burst.count > BURST_LIMIT) {
      // Ban IP for burst behavior
      bannedIPs.set(key, now + BAN_DURATION);
      return { allowed: false, reason: "burst-banned" };
    }
  }

  // Normal rate limit
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW });
    return { allowed: true };
  }
  entry.count++;
  if (entry.count > RATE_LIMIT) {
    return { allowed: false, reason: "rate-limited" };
  }
  return { allowed: true };
}

// === BOT DETECTION ===
const BOT_UA_PATTERNS = [
  /bot/i, /crawl/i, /spider/i, /scraper/i, /curl/i, /wget/i,
  /python-requests/i, /httpie/i, /postman/i, /insomnia/i,
  /go-http-client/i, /java\//i, /okhttp/i,
];

function isBot(ua: string): boolean {
  if (!ua || ua.length < 10) return true;
  return BOT_UA_PATTERNS.some(p => p.test(ua));
}

// === ORIGIN VALIDATION ===
function isValidOrigin(req: Request): boolean {
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  if (!origin) return true; // Allow no-origin (server-to-server)
  return origin.includes(ALLOWED_ORIGIN) || origin.includes("localhost") || origin.includes("lvbl.app") || origin.includes("lvbl.dev");
}

// Periodic cleanup of maps to prevent memory leaks
let lastCleanup = Date.now();
function maybeCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [k, v] of rateLimitMap) { if (now > v.resetAt) rateLimitMap.delete(k); }
  for (const [k, v] of burstMap) { if (now > v.resetAt) burstMap.delete(k); }
  for (const [k, v] of bannedIPs) { if (now > v) bannedIPs.delete(k); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  maybeCleanup();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
                   req.headers.get("cf-connecting-ip") || "unknown";
  const ipHash = await hashIP(clientIP);
  const ua = req.headers.get("user-agent") || "";

  try {
    // 0. Bot detection
    if (isBot(ua)) {
      await logAccess(supabase, "/api-gateway", ipHash, ua, true, "bot-detected");
      return reject();
    }

    // 0b. Origin validation
    if (!isValidOrigin(req)) {
      await logAccess(supabase, "/api-gateway", ipHash, ua, true, "invalid-origin");
      return reject();
    }

    // 1. Validate HMAC signature
    const sig = req.headers.get("x-cf-sig");
    const ts = req.headers.get("x-cf-ts");
    
    if (!sig || !ts) {
      await logAccess(supabase, "/api-gateway", ipHash, ua, true, "missing-headers");
      return reject();
    }

    // Timestamp validation (30s window)
    const tsNum = parseInt(ts);
    const now = Date.now();
    if (isNaN(tsNum) || Math.abs(now - tsNum) > 30_000) {
      await logAccess(supabase, "/api-gateway", ipHash, ua, true, "expired-timestamp");
      return reject();
    }

    // Verify HMAC
    const secret = Deno.env.get("CF_INTERNAL_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const body = await req.text();
    const expectedSig = await hmacSha256(secret, ts + body);
    
    if (sig !== expectedSig) {
      await logAccess(supabase, "/api-gateway", ipHash, ua, true, "invalid-signature");
      return reject();
    }

    // 2. Advanced rate limiting
    const rateResult = checkRateLimit(ipHash);
    if (!rateResult.allowed) {
      await logAccess(supabase, "/api-gateway", ipHash, ua, true, rateResult.reason || "rate-limited");
      const status = rateResult.reason === "ip-banned" || rateResult.reason === "burst-banned" ? 403 : 429;
      return new Response(JSON.stringify({ error: "Calma aí parceiro, muitas requisições." }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Parse and route request
    const payload = JSON.parse(body);
    const { action, data } = payload;

    await logAccess(supabase, action || "unknown", ipHash, ua, false, null);

    switch (action) {
      case "extract-video": {
        const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/extract-video`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify(data),
        });
        const result = await res.json();
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "track-visitor": {
        await supabase.from("site_visitors").insert({
          visitor_id: data.visitor_id,
          referrer: data.referrer || null,
          hostname: data.hostname || null,
          pathname: data.pathname || null,
          user_agent: ua.substring(0, 200),
          ip_hash: ipHash,
        });
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return reject();
    }
  } catch (error) {
    console.error("[api-gateway] Error:", error);
    return reject();
  }
});

function reject() {
  return new Response(JSON.stringify({ error: REJECTION_MSG }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function logAccess(
  supabase: any, endpoint: string, ipHash: string, ua: string,
  blocked: boolean, reason: string | null
) {
  try {
    await supabase.from("api_access_log").insert({
      endpoint, ip_hash: ipHash, user_agent: ua.substring(0, 200), blocked, reason,
    });
  } catch { /* silent */ }
}
