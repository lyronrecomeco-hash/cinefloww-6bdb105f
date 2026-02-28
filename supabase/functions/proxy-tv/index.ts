/**
 * TV Proxy v3 — fetches embedtv/cineveo pages server-side:
 * 1. Strips ALL anti-iframe/sandbox detection scripts (obfuscated included)
 * 2. Injects window.top/parent/frameElement overrides FIRST
 * 3. Strips ad scripts and overlays
 * 4. Returns cleaned HTML for srcdoc rendering (NO sandbox attr on iframe)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Nuclear override script — runs BEFORE any page JS.
 * 1) Freezes window.top/parent/frameElement so page can't detect iframe
 * 2) Patches createElement to neuter hidden iframe sandbox checks
 * 3) Aggressively removes sandbox overlays + ads
 */
const OVERRIDE_SCRIPT = `<script>
(function(){
  // === PHASE 1: Freeze iframe detection properties ===
  var w=window,d=document;
  function freeze(obj,prop,val){
    try{Object.defineProperty(obj,prop,{get:function(){return val},set:function(){},configurable:false,enumerable:true})}catch(e){}
  }
  freeze(w,'frameElement',null);
  freeze(w,'top',w.self);
  freeze(w,'parent',w.self);
  freeze(w,'length',0);
  
  // Prevent any script from re-defining these
  var origDefProp=Object.defineProperty;
  Object.defineProperty=function(obj,prop,desc){
    if(obj===window&&(prop==='top'||prop==='parent'||prop==='frameElement'||prop==='length')){
      return obj;
    }
    return origDefProp.call(Object,obj,prop,desc);
  };

  // === PHASE 2: Neuter hidden iframe creation (anti-sandbox technique) ===
  var origCreateElement=d.createElement.bind(d);
  d.createElement=function(tag){
    var el=origCreateElement(tag);
    if(tag.toLowerCase()==='iframe'){
      // Override contentWindow to return current window (prevents clean-window detection)
      try{
        Object.defineProperty(el,'contentWindow',{get:function(){return w},configurable:true});
        Object.defineProperty(el,'contentDocument',{get:function(){return d},configurable:true});
      }catch(e){}
    }
    return el;
  };

  // === PHASE 3: Override common detection functions ===
  w.__sandbox=false;
  w.inIframe=function(){return false};
  w.open=function(){return null};

  // === PHASE 4: Aggressive DOM cleanup ===
  function clean(){
    // Remove sandbox_detect by ID
    var sd=d.getElementById('sandbox_detect');
    if(sd){try{sd.remove()}catch(e){sd.style.display='none'}}

    // Remove any element mentioning SANDBOX or DIGA NÃO
    d.querySelectorAll('div,section,aside,span').forEach(function(el){
      var t=(el.textContent||'').trim();
      if(t.length<300&&(t.indexOf('SANDBOX')>-1||t.indexOf('DIGA N')>-1||t.indexOf('sandbox')>-1||t.indexOf('embedtv.best')>-1)){
        try{el.remove()}catch(e){el.style.display='none'}
      }
    });

    // Remove fixed/absolute overlays with high z-index
    d.querySelectorAll('[style]').forEach(function(el){
      var s=el.style;
      var z=parseInt(s.zIndex||'0',10);
      if((s.position==='fixed'||s.position==='absolute')&&z>=100){
        if(!el.querySelector('video')&&el.tagName!=='VIDEO'&&!el.classList.contains('player-poster')){
          try{el.remove()}catch(e){el.style.display='none'}
        }
      }
    });

    // Remove ad elements
    ['[id*="ad_"]','[class*="ad-wrap"]','[class*="popup"]','[id*="popup"]',
     'a[target="_blank"][onclick]','[class*="preroll"]','[class*="vast"]'].forEach(function(sel){
      d.querySelectorAll(sel).forEach(function(el){
        if(el.tagName!=='VIDEO'&&el.tagName!=='IFRAME'&&!el.querySelector('video')){
          try{el.remove()}catch(e){el.style.display='none'}
        }
      });
    });
  }

  // Run cleanup immediately + on DOM ready + periodically for 60s
  clean();
  if(d.readyState==='loading'){d.addEventListener('DOMContentLoaded',clean)}
  var c=0,ci=setInterval(function(){c++;if(c>120){clearInterval(ci);return;}clean()},500);

  // Block ad tab opens
  d.addEventListener('click',function(e){
    var t=e.target;
    while(t&&t!==d.body){
      if(t.tagName==='A'&&t.target==='_blank'){e.preventDefault();e.stopPropagation();return false;}
      t=t.parentElement;
    }
  },true);
})();
</script>`;

/**
 * Remove ALL obfuscated anti-iframe scripts from HTML.
 * These scripts typically:
 * - Create hidden iframes to get a "clean" window reference
 * - Check window.top !== window.self
 * - Use heavily obfuscated string arrays (split/reduce patterns)
 */
function stripAntiIframeScripts(html: string): string {
  // 1. Remove the obfuscated script that uses split("").reduce pattern
  //    This is the main anti-iframe detection used by embedtv
  html = html.replace(/<script[^>]*>[\s\S]*?\.split\s*\(\s*["']["']\s*\)\s*\.reduce[\s\S]*?<\/script>/gi, "");

  // 2. Remove scripts containing sandbox_detect, inIframe, frameElement checks
  html = html.replace(/<script[^>]*>[\s\S]*?(sandbox_detect|inIframe|window\.top\s*!==?\s*window\.self)[\s\S]*?<\/script>/gi, "");

  // 3. Remove commented-out anti-iframe scripts (<!-- <script ...> -->)
  html = html.replace(/<!--\s*<script[^>]*>[\s\S]*?<\/script>\s*-->/gi, "");

  // 4. Remove div#sandbox_detect and its content
  html = html.replace(/<div[^>]*id\s*=\s*["']?sandbox_detect["']?[^>]*>[\s\S]*?<\/div>(\s*<\/div>)*/gi, "");

  // 5. Remove scripts that reference 'ChmaorrC' or similar obfuscation markers
  html = html.replace(/<script[^>]*>[\s\S]*?ChmaorrC[\s\S]*?<\/script>/gi, "");

  // 6. Remove scripts with data-cfasync that contain obfuscated code
  html = html.replace(/<script[^>]*data-cfasync[^>]*>[\s\S]*?<\/script>/gi, "");

  return html;
}

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
    const host = parsed.hostname;
    if (!host.includes("embedtv") && !host.includes("cineveo")) {
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
        Referer: parsed.origin + "/",
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

    // Strip ALL anti-iframe/sandbox detection scripts
    html = stripAntiIframeScripts(html);

    // Set <base href> for relative resource loading
    const basePath = parsed.pathname.includes("/") 
      ? parsed.pathname.replace(/\/[^/]*$/, "/") 
      : "/";
    const baseTag = `<base href="${parsed.origin + basePath}">`;

    // CSS to hide any remaining sandbox/ad overlays
    const hideCSS = `<style>
#sandbox_detect,[id*="sandbox"],[class*="sandbox"]{display:none!important;width:0!important;height:0!important}
div[style*="z-index: 999"],div[style*="z-index:9999"],
div[style*="z-index: 99999"],div[style*="z-index:99999"]{display:none!important}
</style>`;

    // Inject override script at VERY START of <head>
    if (html.includes("<head")) {
      html = html.replace(/<head[^>]*>/, "$&" + OVERRIDE_SCRIPT + hideCSS + baseTag);
    } else {
      html = "<!DOCTYPE html><html><head>" + OVERRIDE_SCRIPT + hideCSS + baseTag + "</head>" + html;
    }

    // Remove X-Frame-Options meta tags
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
