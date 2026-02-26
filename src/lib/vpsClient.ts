/**
 * VPS-aware API client.
 * Uses localStorage-cached URL exclusively — NEVER queries Cloud DB on boot.
 * Falls back to Cloud (Edge Functions) only for auth/session, not heavy ops.
 */

const VPS_HEALTH_CACHE_MS = 30_000;
const VPS_URL_STORAGE_KEY = "_vps_url";

// Hardcoded fallback VPS URL — used when localStorage is empty
const HARDCODED_VPS_URL = "http://147.93.12.83:3377";
const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const CLOUD_VPS_PROXY_URL = PROJECT_ID
  ? `https://${PROJECT_ID}.supabase.co/functions/v1/vps-proxy`
  : "/functions/v1/vps-proxy";
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

let _vpsBaseUrl: string | null = null;
let _vpsProxyUrl: string | null = null;
let _vpsOnline = false;
let _lastCheck = 0;
let _initPromise: Promise<void> | null = null;
let _proxyBroken = false; // detected when proxy returns HTML instead of JSON

/** Decide when to force /vps proxy */
function shouldUseProxy(vpsBaseUrl: string): boolean {
  const host = window.location.hostname;
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
  const isHttpsPage = window.location.protocol === "https:";
  const isHttpVps = /^http:\/\//i.test(vpsBaseUrl);

  if (!isLocal) return true;
  if (isHttpsPage && isHttpVps) return true;
  return false;
}

function resolveProxyUrl(baseUrl: string): string {
  if (shouldUseProxy(baseUrl)) {
    return CLOUD_VPS_PROXY_URL;
  }
  return baseUrl;
}

function isCloudProxy(url: string): boolean {
  return url.includes("/functions/v1/vps-proxy");
}

async function vpsFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!_vpsProxyUrl) throw new Error("VPS URL not initialized");

  if (isCloudProxy(_vpsProxyUrl)) {
    const qs = new URLSearchParams({ path }).toString();
    const headers = new Headers(init?.headers || {});
    if (PUBLISHABLE_KEY) {
      headers.set("apikey", PUBLISHABLE_KEY);
      headers.set("Authorization", `Bearer ${PUBLISHABLE_KEY}`);
    }

    return fetch(`${_vpsProxyUrl}?${qs}`, {
      ...init,
      headers,
    });
  }

  return fetch(`${_vpsProxyUrl}${path}`, init);
}

/** Load VPS API URL from localStorage or hardcoded fallback — NO Cloud DB query */
export function initVpsClient(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      const cached = localStorage.getItem(VPS_URL_STORAGE_KEY);
      const rawUrl = cached || HARDCODED_VPS_URL;

      _vpsBaseUrl = rawUrl.replace(/\/+$/, "");
      _vpsProxyUrl = resolveProxyUrl(_vpsBaseUrl);

      if (!cached) {
        localStorage.setItem(VPS_URL_STORAGE_KEY, _vpsBaseUrl);
      }

      await checkVpsHealth();

      // Background: update URL from Cloud (non-blocking, won't affect current session)
      updateVpsUrlFromCloud().catch(() => {});
    } catch { /* silent */ }
  })();
  return _initPromise;
}


async function checkVpsHealth(): Promise<boolean> {
  if (!_vpsProxyUrl) return false;
  if (Date.now() - _lastCheck < VPS_HEALTH_CACHE_MS) return _vpsOnline;

  const healthPath = "/health";

  try {
    const res = await vpsFetch(healthPath, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      _vpsOnline = false;
    } else {
      // CRITICAL: Check if response is actual JSON from VPS or HTML from SPA fallback
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        // Proxy is broken — returning SPA HTML instead of VPS response
        console.warn("[VPS] Proxy returned HTML — marking proxy as broken");
        _proxyBroken = true;
        _vpsOnline = false;
        // Recalculate proxy URL (will now use direct URL)
        if (_vpsBaseUrl) {
          _vpsProxyUrl = resolveProxyUrl(_vpsBaseUrl);
          // Try direct VPS (will fail on HTTPS due to mixed content, but worth trying)
          if (!shouldUseProxy(_vpsBaseUrl)) {
            try {
              const directRes = await fetch(`${_vpsBaseUrl}/health`, {
                signal: AbortSignal.timeout(3000),
              });
              const directCt = directRes.headers.get("content-type") || "";
              _vpsOnline = directRes.ok && !directCt.includes("text/html");
              if (_vpsOnline) {
                _vpsProxyUrl = _vpsBaseUrl;
              }
            } catch {
              _vpsOnline = false;
            }
          }
        }
      } else {
        _vpsOnline = true;
      }
    }
  } catch {
    _vpsOnline = false;
  }

  // Fallback probe if first check failed and proxy is not broken
  if (!_vpsOnline && !_proxyBroken) {
    try {
      const probe = await vpsFetch(`/api/catalog?type=movie`, {
        signal: AbortSignal.timeout(3500),
      });
      const probeCt = probe.headers.get("content-type") || "";
      if (probeCt.includes("text/html")) {
        _proxyBroken = true;
        _vpsOnline = false;
      } else {
        _vpsOnline = probe.ok;
      }
    } catch {
      _vpsOnline = false;
    }
  }

  _lastCheck = Date.now();
  console.log(`[VPS] Health check: online=${_vpsOnline}, proxyBroken=${_proxyBroken}, url=${_vpsProxyUrl}`);
  return _vpsOnline;
}

/** Force a fresh health check (bypass cache) */
export async function refreshVpsHealth(): Promise<boolean> {
  await initVpsClient();
  _lastCheck = 0;
  return checkVpsHealth();
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
 * Extract video via VPS API.
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
    const res = await vpsFetch(`/api/extract-video`, {
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
 */
export async function vpsCatalog(contentType?: string): Promise<any[] | null> {
  if (!(await checkVpsHealth())) return null;
  try {
    const path = contentType
      ? `/api/catalog?type=${encodeURIComponent(contentType)}`
      : `/api/catalog`;
    const res = await vpsFetch(path, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/html")) return null; // proxy returning HTML
    const data = await res.json();
    return data.items || data;
  } catch {
    return null;
  }
}

/**
 * Fetch single catalog item detail from VPS cache.
 */
export async function vpsCatalogDetail(tmdbId: number, contentType: string): Promise<any | null> {
  if (!(await checkVpsHealth())) return null;
  try {
    const res = await vpsFetch(
      `/api/catalog/${tmdbId}?type=${encodeURIComponent(contentType)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/html")) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Notify VPS about new content. Fire-and-forget.
 */
export async function vpsNotifyNewContent(items: Array<{
  tmdb_id: number;
  content_type: string;
  title: string;
  imdb_id?: string | null;
}>): Promise<void> {
  if (!(await checkVpsHealth())) return;
  try {
    vpsFetch(`/api/notify-new-content`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  } catch { /* fire and forget */ }
}

/** Background: fetch VPS URL from Cloud and store for NEXT session */
async function updateVpsUrlFromCloud(): Promise<void> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "vps_api_url")
      .maybeSingle();
    if (data?.value) {
      const url = typeof data.value === "string"
        ? data.value.replace(/^"|"$/g, "")
        : String(data.value).replace(/^"|"$/g, "");
      if (url && url.startsWith("http")) {
        localStorage.setItem(VPS_URL_STORAGE_KEY, url.replace(/\/+$/, ""));
      }
    }
  } catch { /* non-critical */ }
}
