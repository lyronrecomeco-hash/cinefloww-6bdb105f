/**
 * Network Cloaking Layer — AUTO-EXECUTING
 * 
 * This module patches fetch, XHR, and WebSocket IMMEDIATELY on import
 * (before any other module can capture references to the originals).
 * 
 * 1. Rewrites supabase.co URLs to local /b/ proxy (production only)
 * 2. Rewrites wss://supabase.co to wss://own-domain/b/ 
 * 3. Strips identifying headers (x-client-info)
 * 4. Rewrites any supabase.co reference in response bodies (stream URLs)
 */

const SB_HOST = "mfcnkltcdvitxczjwoer.supabase.co";
const SB_ORIGIN = `https://${SB_HOST}`;
const SB_WSS = `wss://${SB_HOST}`;
const STRIP_HEADERS = ["x-client-info"];

function isProd(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h !== "localhost" && !h.includes("lovableproject.com") && !h.includes("lovable.app") && !h.includes("127.0.0.1");
}

function rewriteUrl(url: string): string {
  if (!isProd()) return url;
  try {
    if (url.includes(SB_HOST)) {
      const parsed = new URL(url);
      if (parsed.hostname === SB_HOST) {
        return window.location.origin + "/b" + parsed.pathname + parsed.search;
      }
    }
  } catch {}
  return url;
}

function rewriteWsUrl(url: string): string {
  if (!isProd()) return url;
  if (url.startsWith(SB_WSS)) {
    // wss://supabase.co/realtime/... → wss://own-domain/b/realtime/...
    return url.replace(SB_WSS, `wss://${window.location.host}/b`);
  }
  return url;
}

/** Rewrite any supabase.co URLs found in a string (e.g. JSON response body) */
export function rewriteBodyUrls(text: string): string {
  if (!isProd() || !text.includes(SB_HOST)) return text;
  return text.split(SB_ORIGIN).join(window.location.origin + "/b");
}

function stripHeaders(headers?: HeadersInit): HeadersInit | undefined {
  if (!headers || !isProd()) return headers;

  if (headers instanceof Headers) {
    const h = new Headers(headers);
    STRIP_HEADERS.forEach(k => h.delete(k));
    return h;
  }
  if (Array.isArray(headers)) {
    return headers.filter(([k]) => !STRIP_HEADERS.includes(k.toLowerCase()));
  }
  if (typeof headers === "object") {
    const c = { ...headers } as Record<string, string>;
    for (const k of Object.keys(c)) {
      if (STRIP_HEADERS.includes(k.toLowerCase())) delete c[k];
    }
    return c;
  }
  return headers;
}

// ========== AUTO-EXECUTE ON IMPORT ==========
(function installCloak() {
  if (typeof window === "undefined") return;

  // --- FETCH ---
  const _fetch = window.fetch.bind(window);
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (input instanceof Request) {
      const url = rewriteUrl(input.url);
      const h = stripHeaders(new Headers(input.headers));
      const nr = new Request(url, {
        method: input.method,
        headers: h,
        body: input.body,
        mode: input.mode,
        credentials: input.credentials,
        cache: input.cache,
        redirect: input.redirect,
        referrer: input.referrer,
        referrerPolicy: input.referrerPolicy,
        signal: init?.signal || input.signal,
      });
      return _fetch(nr);
    }

    const url = rewriteUrl(typeof input === "string" ? input : input.toString());
    const ni = init ? { ...init, headers: stripHeaders(init.headers) } : undefined;
    return _fetch(url, ni);
  };

  // --- XMLHttpRequest ---
  const _xhrOpen = XMLHttpRequest.prototype.open;
  const _xhrSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (
    method: string, url: string | URL, async?: boolean,
    user?: string | null, pass?: string | null
  ) {
    const rw = rewriteUrl(typeof url === "string" ? url : url.toString());
    return _xhrOpen.call(this, method, rw, async ?? true, user, pass);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name: string, value: string) {
    if (isProd() && STRIP_HEADERS.includes(name.toLowerCase())) return;
    return _xhrSetHeader.call(this, name, value);
  };

  // --- WebSocket ---
  const _WS = window.WebSocket;
  // @ts-ignore — replacing global constructor
  window.WebSocket = function (url: string | URL, protocols?: string | string[]) {
    const rw = rewriteWsUrl(typeof url === "string" ? url : url.toString());
    return new _WS(rw, protocols);
  } as any;
  // Preserve prototype chain
  window.WebSocket.prototype = _WS.prototype;
  Object.defineProperty(window.WebSocket, 'CONNECTING', { value: 0 });
  Object.defineProperty(window.WebSocket, 'OPEN', { value: 1 });
  Object.defineProperty(window.WebSocket, 'CLOSING', { value: 2 });
  Object.defineProperty(window.WebSocket, 'CLOSED', { value: 3 });
})();

// Keep export for compatibility but it's a no-op now (auto-executed above)
export function initNetworkCloak() {}
