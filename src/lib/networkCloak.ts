/**
 * Network Cloaking Layer
 * 
 * Intercepts fetch/XHR to:
 * 1. Rewrite supabase.co URLs to local /b/ proxy (in production)
 * 2. Strip identifying headers (x-client-info)
 * 3. Hide backend infrastructure from network sniffers
 */

const SUPABASE_HOST = "mfcnkltcdvitxczjwoer.supabase.co";
const HEADERS_TO_STRIP = ["x-client-info"];

function isProduction(): boolean {
  const host = window.location.hostname;
  return !host.includes("localhost") && !host.includes("lovableproject.com") && !host.includes("lovable.app");
}

function rewriteUrl(url: string): string {
  if (!isProduction()) return url;
  
  try {
    const parsed = new URL(url);
    if (parsed.hostname === SUPABASE_HOST) {
      // /rest/v1/... → /b/rest/v1/...
      // /functions/v1/... → /b/functions/v1/...
      // /auth/v1/... → /b/auth/v1/...
      const path = parsed.pathname + parsed.search;
      return window.location.origin + "/b" + path;
    }
  } catch {
    // Not a valid URL, return as-is
  }
  return url;
}

function cleanHeaders(headers?: HeadersInit): HeadersInit | undefined {
  if (!headers || !isProduction()) return headers;

  if (headers instanceof Headers) {
    const clean = new Headers(headers);
    HEADERS_TO_STRIP.forEach(h => clean.delete(h));
    return clean;
  }

  if (Array.isArray(headers)) {
    return headers.filter(([key]) => !HEADERS_TO_STRIP.includes(key.toLowerCase()));
  }

  if (typeof headers === "object") {
    const clean = { ...headers } as Record<string, string>;
    HEADERS_TO_STRIP.forEach(h => {
      delete clean[h];
      // Also try exact case variations
      delete clean["X-Client-Info"];
      delete clean["x-client-info"];
    });
    return clean;
  }

  return headers;
}

export function initNetworkCloak() {
  if (typeof window === "undefined") return;

  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url: string;
    let newInit = init ? { ...init } : {};

    if (input instanceof Request) {
      url = rewriteUrl(input.url);
      const cleanH = cleanHeaders(new Headers(input.headers));
      const newRequest = new Request(url, {
        method: input.method,
        headers: cleanH,
        body: input.body,
        mode: input.mode,
        credentials: input.credentials,
        cache: input.cache,
        redirect: input.redirect,
        referrer: input.referrer,
        referrerPolicy: input.referrerPolicy,
        signal: init?.signal || input.signal,
      });
      return originalFetch.call(window, newRequest);
    }

    if (input instanceof URL) {
      url = rewriteUrl(input.toString());
    } else {
      url = rewriteUrl(input as string);
    }

    if (newInit.headers) {
      newInit.headers = cleanHeaders(newInit.headers);
    }

    return originalFetch.call(window, url, newInit);
  };

  // Intercept XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null
  ) {
    const rewritten = rewriteUrl(typeof url === "string" ? url : url.toString());
    // @ts-ignore - store for header filtering
    this._cloakedHeaders = new Set<string>();
    return originalOpen.call(this, method, rewritten, async ?? true, username, password);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name: string, value: string) {
    if (isProduction() && HEADERS_TO_STRIP.includes(name.toLowerCase())) {
      return; // Silently drop
    }
    return originalSetHeader.call(this, name, value);
  };
}
