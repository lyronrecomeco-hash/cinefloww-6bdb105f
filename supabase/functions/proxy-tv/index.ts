/**
 * TV Proxy — fetches embedtv pages server-side with minimal modifications:
 * 1. Removes ONLY the sandbox_detect div (not scripts!)
 * 2. Injects window.top/parent/frameElement overrides before any other JS
 * 3. Returns cleaned HTML as JSON for srcdoc rendering
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Override script injected before ANY page scripts.
 * Spoofs window.top/parent/frameElement so the page thinks it's top-level.
 * Also auto-removes any sandbox overlay div that appears.
 */
const OVERRIDE_SCRIPT = `<script>
(function(){
  // Spoof top-level context
  try{Object.defineProperty(window,'frameElement',{get:function(){return null},configurable:true})}catch(e){}
  try{Object.defineProperty(window,'top',{get:function(){return window.self},configurable:true})}catch(e){}
  try{Object.defineProperty(window,'parent',{get:function(){return window.self},configurable:true})}catch(e){}
  // Monitor and remove sandbox overlay
  function clean(){
    var el=document.getElementById('sandbox_detect');
    if(el){el.parentNode.removeChild(el);}
    document.querySelectorAll('div').forEach(function(d){
      var t=d.textContent||'';
      var s=d.style;
      if((t.indexOf('SANDBOX')>-1||t.indexOf('DIGA N')>-1)&&(s.position==='fixed'||s.zIndex>100)){
        d.parentNode.removeChild(d);
      }
    });
  }
  // Run cleanup on DOM ready and periodically
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',clean)}else{clean()}
  var c=0,ci=setInterval(function(){c++;if(c>60){clearInterval(ci);return;}clean()},500);
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

    // Fetch the embed page as a top-level browser navigation
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

    // === MINIMAL MODIFICATIONS ===

    // 1. Remove ONLY the sandbox_detect div (preserve all scripts!)
    html = html.replace(
      /<div\s+id=["']sandbox_detect["'][^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i,
      ""
    );

    // 2. Set <base href> for relative resource loading
    const baseTag = `<base href="${parsed.origin + parsed.pathname.replace(/\/[^/]*$/, "/")}">`;

    // 3. Inject override script at the VERY START of <head> (before any page JS)
    if (html.includes("<head")) {
      html = html.replace(/<head[^>]*>/, "$&" + OVERRIDE_SCRIPT + baseTag);
    } else {
      // No <head>, inject at document start
      html = "<!DOCTYPE html><html><head>" + OVERRIDE_SCRIPT + baseTag + "</head>" + html;
    }

    // 4. Remove X-Frame-Options meta tags
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
