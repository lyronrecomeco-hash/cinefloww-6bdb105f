const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Script that intercepts video URLs and posts them to parent window
const INTERCEPTOR_SCRIPT = `
<script>
(function() {
  var found = {};
  function send(url, source) {
    if (!url || found[url]) return;
    found[url] = true;
    console.log('[Interceptor] Found video: ' + source + ' -> ' + url);
    try {
      window.parent.postMessage({ type: '__VIDEO_SOURCE__', url: url, source: source }, '*');
    } catch(e) {}
  }

  // 1. Override HTMLMediaElement.src setter
  try {
    var origSrcDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    if (origSrcDesc && origSrcDesc.set) {
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        set: function(val) {
          if (val && (val.includes('.m3u8') || val.includes('.mp4') || val.includes('/playlist') || val.includes('/master') || val.includes('index-'))) {
            send(val, 'src-setter');
          }
          return origSrcDesc.set.call(this, val);
        },
        get: origSrcDesc.get,
        configurable: true
      });
    }
  } catch(e) {}

  // 2. Override appendChild to catch <source> elements
  var origAppend = Element.prototype.appendChild;
  Element.prototype.appendChild = function(child) {
    try {
      if (child && child.tagName === 'SOURCE' && child.src) {
        if (child.src.includes('.m3u8') || child.src.includes('.mp4')) send(child.src, 'source-el');
      }
    } catch(e) {}
    return origAppend.call(this, child);
  };

  // 3. Intercept XHR
  var origXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (url && typeof url === 'string') {
      if (url.includes('.m3u8') || url.includes('.mp4') || url.includes('/playlist') || url.includes('/master') || url.includes('index-')) {
        send(url, 'xhr');
      }
    }
    return origXHROpen.apply(this, arguments);
  };

  // 4. Intercept fetch
  var origFetch = window.fetch;
  window.fetch = function(input) {
    var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    if (url && (url.includes('.m3u8') || url.includes('.mp4') || url.includes('/playlist') || url.includes('/master') || url.includes('index-'))) {
      send(url, 'fetch');
    }
    return origFetch.apply(this, arguments);
  };

  // 5. Monitor DOM for video elements
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      m.addedNodes.forEach(function(node) {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'VIDEO') {
          if (node.src) send(node.src, 'video-dom');
          node.querySelectorAll('source').forEach(function(s) { if (s.src) send(s.src, 'source-dom'); });
        }
        if (node.querySelectorAll) {
          node.querySelectorAll('video, source').forEach(function(v) {
            if (v.src && (v.src.includes('.m3u8') || v.src.includes('.mp4'))) send(v.src, 'deep-scan');
          });
        }
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // 6. Intercept HLS.js loadSource
  var checkHls = setInterval(function() {
    if (window.Hls) {
      var origLoad = window.Hls.prototype.loadSource;
      window.Hls.prototype.loadSource = function(url) {
        if (url) send(url, 'hls.js');
        return origLoad.apply(this, arguments);
      };
      clearInterval(checkHls);
    }
    // Periodic scan for video elements
    document.querySelectorAll('video').forEach(function(v) {
      if (v.src) send(v.src, 'periodic');
      if (v.currentSrc) send(v.currentSrc, 'currentSrc');
      v.querySelectorAll('source').forEach(function(s) { if (s.src) send(s.src, 'periodic-source'); });
    });
  }, 800);

  // 7. Block ads
  window.open = function() { return null; };
  setInterval(function() {
    document.querySelectorAll('[id*="ad"], [class*="ad-"], [class*="popup"], [class*="overlay"], a[target="_blank"]').forEach(function(el) {
      if (el.tagName !== 'VIDEO' && el.tagName !== 'SOURCE' && !el.closest('video')) {
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
      }
    });
  }, 1500);

  console.log('[Interceptor] Active - monitoring for video sources');
})();
</script>
`;

const ANTI_AD_CSS = `
<style>
  [class*="ad-"], [class*="ads-"], [class*="popup"], [class*="overlay"]:not(#wrapper):not(.controls),
  [id*="ad-"], [id*="ads-"], [id*="popup"], a[target="_blank"],
  div[onclick*="window.open"], iframe[src*="ads"], iframe[src*="pop"],
  div[style*="visibility: hidden"] {
    display: none !important;
    pointer-events: none !important;
  }
  video, .jw-video, .plyr, #player, .video-js {
    pointer-events: auto !important;
    z-index: 10 !important;
  }
</style>
`;

const ALLOWED_DOMAINS = [
  "embedplayapi.site",
  "embed.su", "autoembed.co", "videasy.net",
  "vidsrc.cc", "vidsrc.net", "vidsrc.xyz", "vidsrc.icu",
  "megaembed.com",
];

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_DOMAINS.some(d => parsed.hostname.endsWith(d));
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let targetUrl: string | null = null;

    if (req.method === "GET") {
      targetUrl = new URL(req.url).searchParams.get("url");
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

    const origin = new URL(targetUrl).origin;
    console.log(`[proxy] Fetching: ${targetUrl}`);

    // Use our own domain as referer, not the API's domain
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": UA,
        "Referer": "https://embedplayapi.site/",
        "Origin": "https://embedplayapi.site",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
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

    if (!contentType.includes("text/html")) {
      const body = await response.arrayBuffer();
      return new Response(body, {
        headers: { ...corsHeaders, "Content-Type": contentType },
      });
    }

    let html = await response.text();

    // Remove ad scripts
    html = html.replace(/<script[^>]*(?:ads|advert|pop|banner|track|analytics|doubleclick|adnxs|taboola|chorumebbbbgoza)[^>]*>[\s\S]*?<\/script>/gi, "");

    // Remove the obfuscated anti-sandbox/ad script (__Y object)
    html = html.replace(/<script>\s*var\s+_0x[a-f0-9]+[\s\S]*?__Y\[.*?\]\(\);\s*<\/script>/gi, "");

    // Remove onclick popups
    html = html.replace(/onclick\s*=\s*["'][^"']*window\.open[^"']*["']/gi, "");

    // Remove hidden iframes
    html = html.replace(/<iframe[^>]*(?:visibility:\s*hidden|width:\s*[01]|height:\s*[01]|display:\s*none)[^>]*>[\s\S]*?<\/iframe>/gi, "");

    // Check if this is a gate page (has "Acesso Restrito" or gate-card)
    const isGatePage = html.includes("gate-card") || html.includes("Acesso Restrito");

    if (isGatePage) {
      console.log("[proxy] Detected gate page, extracting embed URL and auto-redirecting");
      
      // Extract the actual embed URL from the gate page
      const embedMatch = html.match(/src="(https?:\/\/superflixapi\.[^"]+)"/i);
      if (embedMatch?.[1]) {
        const embedUrl = embedMatch[1];
        console.log(`[proxy] Found embed URL in gate: ${embedUrl}`);
        
        // Build a minimal page that loads the embed directly as a full-screen iframe
        const playerHtml = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>*{margin:0;padding:0}html,body{width:100%;height:100%;overflow:hidden;background:#000}iframe{width:100%;height:100%;border:0}</style>
${ANTI_AD_CSS}
${INTERCEPTOR_SCRIPT}
<script>window.open=function(){return null};</script>
</head><body>
<iframe src="${embedUrl}" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture; fullscreen" style="width:100%;height:100%;border:0"></iframe>
</body></html>`;

        return new Response(playerHtml, {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/html; charset=utf-8",
            "X-Frame-Options": "ALLOWALL",
            "Content-Security-Policy": "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-src *; media-src * blob:; connect-src *; worker-src * blob:;",
          },
        });
      }
    }

    // Fix relative URLs
    html = html.replace(/(src|href)="\/(?!\/)/g, `$1="${origin}/`);
    html = html.replace(/(src|href)='\/(?!\/)/g, `$1='${origin}/`);

    // Inject base tag + interceptor + anti-ad
    const injection = `<base href="${origin}/"><meta name="referrer" content="no-referrer">${ANTI_AD_CSS}${INTERCEPTOR_SCRIPT}`;

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
        "Content-Security-Policy": "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-src *; media-src * blob:; connect-src *; worker-src * blob:;",
      },
    });
  } catch (error) {
    console.error("[proxy] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Proxy failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
