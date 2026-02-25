/**
 * VPS-aware API client.
 * In production, routes through Vercel proxy (/vps/*) to avoid mixed content.
 * Falls back to Cloud (Edge Functions) transparently.
 */

import { supabase } from "@/integrations/supabase/client";

const VPS_HEALTH_CACHE_MS = 30_000; // re-check every 30s
let _vpsBaseUrl: string | null = null; // raw IP URL from DB
let _vpsProxyUrl: string | null = null; // resolved proxy or direct URL
let _vpsOnline = false;
let _lastCheck = 0;
let _initPromise: Promise<void> | null = null;

/** Detect if we're on a production domain (not localhost/preview) */
function isProd(): boolean {
  const h = window.location.hostname;
  return !h.includes("localhost") && !h.includes("lovableproject.com") && !h.includes("lovable.app") && !h.includes("127.0.0.1");
}

/** Load VPS API URL from site_settings and check health */
export function initVpsClient(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "vps_api_url")
        .maybeSingle();
      if (data?.value) {
        const val = data.value as any;
        _vpsBaseUrl = typeof val === "string" ? val.replace(/^"|"$/g, "") : val.url || null;
        if (_vpsBaseUrl) {
          _vpsBaseUrl = _vpsBaseUrl.replace(/\/+$/, "");
          // In production: use Vercel proxy to avoid mixed content
          if (isProd()) {
            _vpsProxyUrl = `${window.location.origin}/vps`;
          } else {
            // Dev/preview: try direct (may fail due to mixed content)
            _vpsProxyUrl = _vpsBaseUrl;
          }
          await checkVpsHealth();
        }
      }
    } catch { /* silent */ }
  })();
  return _initPromise;
}

async function checkVpsHealth(): Promise<boolean> {
  if (!_vpsProxyUrl) return false;
  if (Date.now() - _lastCheck < VPS_HEALTH_CACHE_MS) return _vpsOnline;
  try {
    const res = await fetch(`${_vpsProxyUrl}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    _vpsOnline = res.ok;
  } catch {
    _vpsOnline = false;
  }
  _lastCheck = Date.now();
  return _vpsOnline;
}

/** Check if VPS API is currently reachable */
export function isVpsOnline(): boolean {
  return _vpsOnline;
}

/** Get the configured VPS URL (or null) */
export function getVpsUrl(): string | null {
  return _vpsProxyUrl;
}

/**
 * Extract video via VPS API (longer timeout, no Cloud overhead).
 * Returns null if VPS is offline — caller should fallback to Cloud.
 */
export async function vpsExtractVideo(params: {
  tmdb_id: number;
  content_type: string;
  title?: string;
  imdb_id?: string | null;
  season?: number;
  episode?: number;
}): Promise<{ url: string; type: string; provider: string } | null> {
  if (!(await checkVpsHealth())) return null;
  try {
    const res = await fetch(`${_vpsProxyUrl}/api/extract-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.url ? data : null;
  } catch {
    return null;
  }
}

/**
 * Fetch catalog from VPS memory cache (instant, no DB query).
 * Returns null if VPS is offline.
 */
export async function vpsCatalog(contentType?: string): Promise<any[] | null> {
  if (!(await checkVpsHealth())) return null;
  try {
    const url = contentType
      ? `${_vpsProxyUrl}/api/catalog?type=${contentType}`
      : `${_vpsProxyUrl}/api/catalog`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.items || data;
  } catch {
    return null;
  }
}

/**
 * Fetch single catalog item detail + video status from VPS cache.
 * Returns null if VPS is offline.
 */
export async function vpsCatalogDetail(tmdbId: number, contentType: string): Promise<any | null> {
  if (!(await checkVpsHealth())) return null;
  try {
    const res = await fetch(
      `${_vpsProxyUrl}/api/catalog/${tmdbId}?type=${contentType}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Notify VPS about new content to auto-resolve links.
 * Fire-and-forget — does not block caller.
 */
export async function vpsNotifyNewContent(items: Array<{
  tmdb_id: number;
  content_type: string;
  title: string;
  imdb_id?: string | null;
}>): Promise<void> {
  if (!(await checkVpsHealth())) return;
  try {
    fetch(`${_vpsProxyUrl}/api/notify-new-content`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  } catch { /* fire and forget */ }
}
