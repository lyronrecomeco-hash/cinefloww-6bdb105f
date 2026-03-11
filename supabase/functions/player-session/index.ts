/**
 * player-session — Public REST API for LynePlay embed sessions.
 * 
 * POST /player-session
 * Actions:
 *   - create   → Validate payload, generate session token, return embed config
 *   - config   → Return config from existing session token
 * 
 * No TMDB, no catalog dependency. Pure video source delivery.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Crypto helpers ──
async function hmacSign(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmacVerify(data: string, signature: string, secret: string): Promise<boolean> {
  const expected = await hmacSign(data, secret);
  return expected === signature;
}

function generateSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── In-memory session store (per isolate — for production use DB) ──
const sessions = new Map<string, { config: any; createdAt: number; expiresAt: number; allowedDomain?: string }>();

// Cleanup expired sessions
function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now > session.expiresAt) sessions.delete(id);
  }
}

// ── Rate limiting ──
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count++;
  return entry.count <= 60; // 60 requests/min
}

// ── Validation ──
interface CreatePayload {
  src: string;
  type?: string;
  poster?: string;
  title?: string;
  subtitle?: string;
  autoplay?: boolean;
  muted?: boolean;
  controls?: boolean;
  preload?: string;
  startAt?: number;
  tracks?: Array<{ kind?: string; src: string; srclang: string; label: string; default?: boolean }>;
  qualities?: Array<{ label: string; src: string }>;
  audioTracks?: Array<{ src: string; lang: string; label: string }>;
  primaryColor?: string;
  logo?: string;
  watermark?: string;
  next?: { url?: string; title?: string };
  analytics?: Record<string, unknown>;
  allowedDomain?: string;
  ttl?: number; // seconds, max 86400
  licenseKey?: string;
}

function validatePayload(body: any): { valid: boolean; error?: string; payload?: CreatePayload } {
  if (!body || typeof body !== "object") return { valid: false, error: "Invalid JSON body" };
  if (!body.src || typeof body.src !== "string") return { valid: false, error: "Missing required field: src" };
  if (body.src.length > 2048) return { valid: false, error: "src exceeds 2048 characters" };
  if (body.type && !["m3u8", "mp4", "dash", "hls", "webm"].includes(body.type)) {
    return { valid: false, error: "Invalid type. Supported: m3u8, mp4, dash, hls, webm" };
  }
  if (body.title && typeof body.title === "string" && body.title.length > 500) {
    return { valid: false, error: "title exceeds 500 characters" };
  }
  if (body.ttl && (typeof body.ttl !== "number" || body.ttl < 60 || body.ttl > 86400)) {
    return { valid: false, error: "ttl must be between 60 and 86400 seconds" };
  }
  return { valid: true, payload: body as CreatePayload };
}

// ── Main handler ──
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Rate limit
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ success: false, error: "Rate limit exceeded. Max 60 requests/minute." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const action = body.action || "create";

    // ── Action: create ──
    if (action === "create") {
      const { valid, error, payload } = validatePayload(body);
      if (!valid || !payload) {
        return new Response(JSON.stringify({ success: false, error }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const sessionId = generateSessionId();
      const ttl = payload.ttl || 3600; // default 1h
      const now = Date.now();
      const expiresAt = now + ttl * 1000;

      const playerConfig = {
        src: payload.src,
        type: payload.type || "mp4",
        poster: payload.poster || null,
        title: payload.title || null,
        subtitle: payload.subtitle || null,
        controls: payload.controls !== false,
        autoplay: payload.autoplay !== false,
        muted: payload.muted || false,
        preload: payload.preload || "auto",
        startAt: payload.startAt || 0,
        tracks: payload.tracks || [],
        qualities: payload.qualities || [],
        audioTracks: payload.audioTracks || [],
        primaryColor: payload.primaryColor || null,
        logo: payload.logo || null,
        watermark: payload.watermark || null,
        next: payload.next || null,
      };

      // Store session
      sessions.set(sessionId, {
        config: playerConfig,
        createdAt: now,
        expiresAt,
        allowedDomain: payload.allowedDomain,
      });

      // Generate signed token
      const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "lyneplay-default";
      const tokenData = `${sessionId}:${expiresAt}`;
      const signature = await hmacSign(tokenData, secret);
      const token = btoa(`${sessionId}:${expiresAt}:${signature}`);

      // Build embed URL
      const baseUrl = req.headers.get("origin") || "https://lyneflix.online";
      const encodedPayload = btoa(JSON.stringify(playerConfig));
      const embedUrl = `${baseUrl}/embed/v2?p=${encodedPayload}`;

      cleanupSessions();

      return new Response(JSON.stringify({
        success: true,
        sessionId,
        token,
        embedUrl,
        playerConfig,
        expiresAt: new Date(expiresAt).toISOString(),
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Action: config ──
    if (action === "config") {
      const token = body.token;
      if (!token) {
        return new Response(JSON.stringify({ success: false, error: "Missing token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const decoded = atob(token);
        const [sessionId, expiresAtStr, signature] = decoded.split(":");
        const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "lyneplay-default";
        
        // Verify HMAC
        const tokenData = `${sessionId}:${expiresAtStr}`;
        const isValid = await hmacVerify(tokenData, signature, secret);
        if (!isValid) {
          return new Response(JSON.stringify({ success: false, error: "Invalid token signature" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check expiry
        if (Date.now() > parseInt(expiresAtStr)) {
          return new Response(JSON.stringify({ success: false, error: "Session expired" }), {
            status: 410,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get session
        const session = sessions.get(sessionId);
        if (!session) {
          return new Response(JSON.stringify({ success: false, error: "Session not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Domain check
        if (session.allowedDomain) {
          const origin = req.headers.get("origin") || "";
          if (!origin.includes(session.allowedDomain)) {
            return new Response(JSON.stringify({ success: false, error: "Domain not authorized" }), {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        return new Response(JSON.stringify({
          success: true,
          sessionId,
          playerConfig: session.config,
          expiresAt: new Date(session.expiresAt).toISOString(),
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ success: false, error: "Malformed token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ success: false, error: "Unknown action. Use: create, config" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
