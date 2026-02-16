const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Anti-ad injection script — blocks popups, ad redirects, overlay clicks
const ANTI_AD_SCRIPT = `
<script>
(function() {
  // Block window.open (popup ads)
  window._origOpen = window.open;
  window.open = function() { return null; };

  // Block ad-related event listeners  
  const origAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, fn, opts) {
    if (type === 'click' || type === 'mousedown' || type === 'pointerdown') {
      const fnStr = fn.toString();
      if (fnStr.includes('window.open') || fnStr.includes('popup') || fnStr.includes('_blank') || fnStr.includes('.ads') || fnStr.includes('redirect')) {
        return;
      }
    }
    return origAddEventListener.call(this, type, fn, opts);
  };

  // Intercept createElement to block ad iframes/scripts
  const origCreateElement = document.createElement.bind(document);
  document.createElement = function(tag) {
    const el = origCreateElement(tag);
    if (tag.toLowerCase() === 'iframe') {
      const origSetAttr = el.setAttribute.bind(el);
      el.setAttribute = function(name, val) {
        if (name === 'src' && (val.includes('ads') || val.includes('pop') || val.includes('banner') || val.includes('track'))) {
          return;
        }
        return origSetAttr(name, val);
      };
    }
    return el;
  };

  // Block navigation to ad URLs
  const origAssign = Object.getOwnPropertyDescriptor(Location.prototype, 'assign');
  const origReplace = Object.getOwnPropertyDescriptor(Location.prototype, 'replace');
  if (origAssign) {
    Object.defineProperty(Location.prototype, 'assign', {
      value: function(url) {
        if (typeof url === 'string' && (url.includes('ads') || url.includes('pop') || url.includes('banner'))) return;
        return origAssign.value.call(this, url);
      }
    });
  }
  if (origReplace) {
    Object.defineProperty(Location.prototype, 'replace', {
      value: function(url) {
        if (typeof url === 'string' && (url.includes('ads') || url.includes('pop') || url.includes('banner'))) return;
        return origReplace.value.call(this, url);
      }
    });
  }

  // Remove ad overlays periodically
  function cleanAds() {
    // Remove elements with ad-related classes/ids
    const adSelectors = [
      '[class*="ad-"]', '[class*="ads-"]', '[class*="popup"]', '[class*="overlay"]',
      '[id*="ad-"]', '[id*="ads-"]', '[id*="popup"]',
      'div[style*="z-index: 99"]', 'div[style*="z-index:99"]',
      'div[style*="z-index: 999"]', 'div[style*="z-index:999"]',
      'div[style*="z-index: 9999"]', 'div[style*="z-index:9999"]',
      'a[target="_blank"]',
      'iframe[src*="ads"]', 'iframe[src*="pop"]', 'iframe[src*="banner"]',
    ];
    
    adSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        // Don't remove the main player iframe or video elements
        if (el.tagName === 'VIDEO' || el.tagName === 'SOURCE') return;
        if (el.tagName === 'IFRAME' && el.closest('#wrapper')) {
          // Check if it's the main player iframe vs ad iframe
          const src = el.getAttribute('src') || '';
          if (!src.includes('ads') && !src.includes('pop') && !src.includes('banner')) return;
        }
        el.remove();
      });
    });

    // Remove invisible tracking iframes
    document.querySelectorAll('iframe').forEach(iframe => {
      const style = iframe.getAttribute('style') || '';
      if (style.includes('visibility: hidden') || style.includes('height: 0') || style.includes('width: 0') ||
          style.includes('height:0') || style.includes('width:0') || style.includes('height: 1') || style.includes('width: 1')) {
        iframe.remove();
      }
    });
  }

  // Run cleanup on load and periodically
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cleanAds);
  } else {
    cleanAds();
  }
  setInterval(cleanAds, 1500);

  // Block beforeunload popups
  window.addEventListener('beforeunload', function(e) {
    e.stopImmediatePropagation();
  }, true);

  // Prevent context menu hijacking
  document.addEventListener('contextmenu', function(e) {
    e.stopPropagation();
  }, true);

  console.log('[AntiAd] Protection active');
})();
</script>
`;

// CSS to hide ad elements
const ANTI_AD_CSS = `
<style>
  [class*="ad-"], [class*="ads-"], [class*="popup"], [class*="overlay"]:not(#wrapper):not(.controls):not(.panel),
  [id*="ad-"], [id*="ads-"], [id*="popup"],
  a[target="_blank"], 
  div[onclick*="window.open"],
  iframe[src*="ads"], iframe[src*="pop"], iframe[src*="banner"],
  div[style*="visibility: hidden"] {
    display: none !important;
    pointer-events: none !important;
  }
  
  /* Ensure video player is always clickable */
  video, .jw-video, .plyr, #player, .video-js {
    pointer-events: auto !important;
    z-index: 10 !important;
  }
</style>
`;

const ALLOWED_DOMAINS = [
  "vidsrc.cc",
  "vidsrc.net",
  "vidsrc.xyz", 
  "vidsrc.icu",
  "embed.su",
  "superflixapi.one",
  "autoembed.co",
];

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_DOMAINS.some(d => parsed.hostname.endsWith(d));
  } catch {
    return false;
  }
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let targetUrl: string | null = null;

    if (req.method === "GET") {
      const params = new URL(req.url).searchParams;
      targetUrl = params.get("url");
    } else {
      const body = await req.json();
      targetUrl = body.url;
    }

    if (!targetUrl || !isAllowedUrl(targetUrl)) {
      return new Response(
        JSON.stringify({ error: "Invalid or disallowed URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const domain = getDomain(targetUrl);
    const origin = getOrigin(targetUrl);

    console.log(`[Proxy] Fetching: ${targetUrl}`);

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Referer": origin + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return new Response(`Upstream error: ${response.status}`, {
        status: response.status,
        headers: corsHeaders,
      });
    }

    const contentType = response.headers.get("content-type") || "";

    // If not HTML, just pass through (CSS, JS, images, etc.)
    if (!contentType.includes("text/html")) {
      const body = await response.arrayBuffer();
      return new Response(body, {
        headers: {
          ...corsHeaders,
          "Content-Type": contentType,
          "X-Frame-Options": "ALLOWALL",
        },
      });
    }

    let html = await response.text();

    // === HTML MANIPULATION ===

    // 1. Remove known ad scripts
    html = html.replace(/<script[^>]*(?:ads|advert|pop|banner|track|analytics|google_ads|doubleclick|adnxs|taboola|outbrain)[^>]*>[\s\S]*?<\/script>/gi, "");
    html = html.replace(/<script[^>]*(?:ads|advert|pop|banner|track|analytics)[^>]*\/>/gi, "");

    // 2. Remove ad-related link tags
    html = html.replace(/<link[^>]*(?:ads|advert|pop|banner|track)[^>]*>/gi, "");

    // 3. Remove inline onclick handlers that open popups
    html = html.replace(/onclick\s*=\s*["'][^"']*window\.open[^"']*["']/gi, "");
    html = html.replace(/onclick\s*=\s*["'][^"']*popup[^"']*["']/gi, "");

    // 4. Remove hidden tracking iframes
    html = html.replace(/<iframe[^>]*(?:visibility:\s*hidden|width:\s*[01]|height:\s*[01]|display:\s*none)[^>]*>[\s\S]*?<\/iframe>/gi, "");
    html = html.replace(/<iframe[^>]*(?:visibility:\s*hidden|width:\s*[01]|height:\s*[01]|display:\s*none)[^>]*\/>/gi, "");

    // 5. Rewrite relative URLs to absolute
    html = html.replace(/(src|href)="\/(?!\/)/g, `$1="${origin}/`);
    html = html.replace(/(src|href)='\/(?!\/)/g, `$1='${origin}/`);

    // 6. Inject base tag + anti-ad protections
    const injection = `<base href="${origin}/"><meta name="referrer" content="no-referrer">${ANTI_AD_CSS}${ANTI_AD_SCRIPT}`;

    if (html.includes("<head>")) {
      html = html.replace("<head>", `<head>${injection}`);
    } else if (html.includes("<HEAD>")) {
      html = html.replace("<HEAD>", `<HEAD>${injection}`);
    } else {
      html = `<head>${injection}</head>${html}`;
    }

    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "X-Frame-Options": "ALLOWALL",
        "Content-Security-Policy": "frame-ancestors *",
      },
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Proxy failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
