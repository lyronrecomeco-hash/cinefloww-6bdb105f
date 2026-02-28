/**
 * TV Proxy — fetches embedtv/cineveo pages server-side:
 * 1. Removes sandbox detection elements and scripts
 * 2. Injects window.top/parent/frameElement overrides before any other JS
 * 3. Strips ad scripts and overlays
 * 4. Returns cleaned HTML as JSON for srcdoc rendering (NO sandbox attr)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Override script injected FIRST in <head>.
 * Spoofs top-level context so page thinks it's NOT inside an iframe.
 * Aggressively removes sandbox overlays + ad elements.
 */
const OVERRIDE_SCRIPT = `<script>
(function(){
  // 1) Spoof top-level context BEFORE any page JS runs
  try{Object.defineProperty(window,'frameElement',{get:function(){return null},configurable:true})}catch(e){}
  try{Object.defineProperty(window,'top',{get:function(){return window.self},configurable:true})}catch(e){}
  try{Object.defineProperty(window,'parent',{get:function(){return window.self},configurable:true})}catch(e){}
  try{Object.defineProperty(window,'length',{get:function(){return 0},configurable:true})}catch(e){}

  // 2) Override sandbox detection functions commonly used
  window.__sandbox = false;
  window.inIframe = function(){return false};

  // 3) Block popups
  window.open=function(){return null};

  // 4) Aggressive cleanup function
  function clean(){
    // Remove sandbox_detect by ID
    var sd=document.getElementById('sandbox_detect');
    if(sd){try{sd.remove()}catch(e){sd.style.display='none'}}

    // Remove any element mentioning SANDBOX or "DIGA NÃO"
    document.querySelectorAll('div,section,aside').forEach(function(d){
      var t=(d.textContent||'').trim();
      if(t.length<200 && (t.indexOf('SANDBOX')>-1||t.indexOf('DIGA N')>-1||t.indexOf('sandbox')>-1||t.indexOf('embedtv.best')>-1)){
        try{d.remove()}catch(e){d.style.display='none'}
      }
    });

    // Remove fixed/absolute overlays with high z-index (ads, gates)
    document.querySelectorAll('div[style],a[style]').forEach(function(el){
      var s=el.style;
      var z=parseInt(s.zIndex||'0',10);
      if((s.position==='fixed'||s.position==='absolute')&&z>=100){
        // Don't remove the video player itself
        if(!el.querySelector('video')&&!el.querySelector('iframe[src*="m3u8"]')){
          try{el.remove()}catch(e){el.style.display='none'}
        }
      }
    });

    // Remove ad-related elements
    var adSels=['[id*="ad_"]','[class*="ad-wrap"]','[class*="overlay"]','[id*="overlay"]',
      '[class*="popup"]','[id*="popup"]','a[target="_blank"][onclick]',
      '[class*="preroll"]','[id*="preroll"]','[class*="vast"]'];
    adSels.forEach(function(s){
      document.querySelectorAll(s).forEach(function(el){
        if(el.tagName!=='VIDEO'&&el.tagName!=='IFRAME'&&!el.querySelector('video')){
          try{el.remove()}catch(e){el.style.display='none'}
        }
      });
    });
  }

  // Run on DOM ready + periodically for 30s
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',clean)}else{clean()}
  var c=0,ci=setInterval(function(){c++;if(c>60){clearInterval(ci);return;}clean()},500);

  // Also intercept click events that try to open ad tabs
  document.addEventListener('click',function(e){
    var t=e.target;
    while(t&&t!==document.body){
      if(t.tagName==='A'&&t.target==='_blank'){e.preventDefault();e.stopPropagation();return false;}
      t=t.parentElement;
    }
  },true);
})();
</script>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let channelUrl: string | null = null;

    if (req.method === "POST") {
      const body = await req.json();
      channelUrl = body.url;
    } else {
      channelUrl = new URL(req.url).searchParams.get("url");
    }

    if (!channelUrl) {
      return new Response(JSON.stringify({ error: "url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = new URL(channelUrl);
    if (!parsed.hostname.includes("embedtv") && !parsed.hostname.includes("cineveo")) {
      return new Response(JSON.stringify({ error: "Invalid URL" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch as top-level browser navigation
    const resp = await fetch(channelUrl, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
    });

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: "Upstream error", status: resp.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let html = await resp.text();

    // === SERVER-SIDE CLEANUP ===

    // 1. Remove sandbox_detect div and ALL its content (multiple nesting patterns)
    html = html.replace(/<div[^>]*id=["']sandbox_detect["'][^>]*>[\s\S]*?<\/div>\s*(<\/div>\s*)*<\/div>/gi, "");
    // Also catch simpler patterns
    html = html.replace(/<div[^>]*id=["']?sandbox_detect["']?[^>]*>[\s\S]{0,2000}?SANDBOX[\s\S]{0,500}?<\/div>/gi, "");

    // 2. Remove inline scripts that check for sandbox/iframe
    html = html.replace(/<script[^>]*>[\s\S]*?(sandbox_detect|inIframe|frameElement|window\.top\s*!==?\s*window\.self)[\s\S]*?<\/script>/gi, "");

    // 3. Set <base href> for relative resource loading
    const baseTag = `<base href="${parsed.origin + parsed.pathname.replace(/\/[^/]*$/, "/")}">`;

    // 4. Add CSS to hide any remaining sandbox/ad overlays
    const hideCSS = `<style>
#sandbox_detect,[id*="sandbox"]{display:none!important}
div[style*="z-index: 999"],div[style*="z-index:9999"],
div[style*="z-index: 99999"]{display:none!important}
</style>`;

    // 5. Inject override script at VERY START of <head>
    if (html.includes("<head")) {
      html = html.replace(/<head[^>]*>/, "$&" + OVERRIDE_SCRIPT + hideCSS + baseTag);
    } else {
      html = "<!DOCTYPE html><html><head>" + OVERRIDE_SCRIPT + hideCSS + baseTag + "</head>" + html;
    }

    // 6. Remove X-Frame-Options meta tags
    html = html.replace(/<meta[^>]*x-frame-options[^>]*>/gi, "");

    return new Response(JSON.stringify({ html }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store",
      },
    });
  } catch (err) {
    console.error("[proxy-tv] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
