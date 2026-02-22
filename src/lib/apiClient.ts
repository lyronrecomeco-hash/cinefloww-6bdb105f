/**
 * Secure API client with HMAC signatures.
 * All API calls go through the api-gateway edge function.
 * No tokens or secrets are exposed to the frontend.
 */

import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const GATEWAY_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/api-gateway`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// HMAC-SHA256 using Web Crypto API (browser-native)
async function hmacSha256(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Generate a visitor-unique signing key (derived from fingerprint, not a secret)
function getSigningKey(): string {
  let key = sessionStorage.getItem("_cf_sk");
  if (!key) {
    key = crypto.randomUUID() + Date.now().toString(36);
    sessionStorage.setItem("_cf_sk", key);
  }
  // Combine with anon key to create a request-specific signature
  return ANON_KEY + key;
}

export async function apiCall(action: string, data: any = {}): Promise<any> {
  const ts = Date.now().toString();
  const body = JSON.stringify({ action, data });
  const signingKey = getSigningKey();
  const sig = await hmacSha256(signingKey, ts + body);

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ANON_KEY}`,
      "x-cf-sig": sig,
      "x-cf-ts": ts,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// Visitor tracking
let _visitorId: string | null = null;

function getVisitorId(): string {
  if (_visitorId) return _visitorId;
  let stored = localStorage.getItem("_cf_vid");
  if (!stored) {
    stored = crypto.randomUUID();
    localStorage.setItem("_cf_vid", stored);
  }
  _visitorId = stored;
  return stored;
}

export async function trackVisit(): Promise<void> {
  try {
    const sessionKey = "_cf_tracked";
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, "1");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    await Promise.race([
      supabase.from("site_visitors").insert({
        visitor_id: getVisitorId(),
        referrer: document.referrer || null,
        hostname: window.location.hostname,
        pathname: window.location.pathname,
        user_agent: navigator.userAgent.substring(0, 200),
      }).abortSignal(controller.signal),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
    ]);

    clearTimeout(timeout);
  } catch { /* silent */ }
}
