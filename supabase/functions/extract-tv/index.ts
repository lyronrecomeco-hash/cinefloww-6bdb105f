/**
 * Extract clean m3u8 stream URL from CineVeo TV embed pages.
 * Uses the `const src = "..."` pattern to get the raw playlist URL.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CINEVEO_BASE = "https://cinetvembed.cineveo.site";

/**
 * Extract the raw stream URL from an embed page using multiple patterns.
 * Priority: const src > file/source attributes > m3u8 patterns
 */
function cleanUrl(raw: string): string {
  // Remove escaped forward slashes (common in JS source: \/)
  return raw.replace(/\\\//g, "/");
}

function extractStreamUrl(html: string, embedUrl: string): { url: string; type: "m3u8" | "mp4" } | null {
  const origin = new URL(embedUrl).origin;

  // 1. Primary: const src = "..." pattern (most reliable)
  const srcPatterns = [
    /const\s+src\s*=\s*"(https?:[^"]+\.m3u8[^"]*)"/,
    /const\s+src\s*=\s*"(https?:[^"]+\.mp4[^"]*)"/,
    /const\s+src\s*=\s*"([^"]+\.m3u8[^"]*)"/,
    /var\s+src\s*=\s*"([^"]+\.m3u8[^"]*)"/,
    /let\s+src\s*=\s*"([^"]+\.m3u8[^"]*)"/,
    /src\s*=\s*'([^']+\.m3u8[^']*)'/,
    /src\s*=\s*"([^"]+\.m3u8[^"]*)"/,
  ];

  for (const pattern of srcPatterns) {
    const match = pattern.exec(html);
    if (match?.[1]) {
      let url = cleanUrl(match[1]);
      // Validate it looks like a real URL, not JS code
      if (url.length > 500 || url.includes("function") || url.includes("document.")) continue;
      if (url.startsWith("/")) url = origin + url;
      if (!url.startsWith("http")) url = origin + "/" + url;
      const type = url.includes(".m3u8") ? "m3u8" : "mp4";
      return { url, type };
    }
  }

  // 2. HLS.js loadSource or file/source attributes
  const hlsPatterns = [
    /hls\.loadSource\(\s*['"]([^'"]+)['"]\s*\)/,
    /file\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/,
    /source\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/,
    /player\.src\(\s*\{\s*src\s*:\s*['"]([^'"]+)['"]/,
  ];

  for (const pattern of hlsPatterns) {
    const match = pattern.exec(html);
    if (match?.[1]) {
      let url = cleanUrl(match[1]);
      if (url.startsWith("/")) url = origin + url;
      if (!url.startsWith("http")) url = origin + "/" + url;
      return { url, type: "m3u8" };
    }
  }

  // 3. Generic m3u8/mp4 URL extraction
  const genericPatterns = [
    /['"]([^'"]*\/playlist\.m3u8[^'"]*)['"]/,
    /['"]([^'"]*\.m3u8[^'"]*)['"]/gi,
    /['"]([^'"]*\.mp4[^'"]*)['"]/gi,
  ];

  for (const pattern of genericPatterns) {
    const match = pattern.exec(html);
    if (match?.[1] && !match[1].includes("logo") && !match[1].includes(".js")) {
      let url = cleanUrl(match[1]);
      if (url.startsWith("/")) url = origin + url;
      if (!url.startsWith("http")) url = origin + "/" + url;
      if (url.startsWith("http://")) url = url.replace("http://", "https://");
      const type = url.includes(".m3u8") ? "m3u8" : "mp4";
      return { url, type };
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { channel_id, embed_url } = body;

    // Allow passing embed_url directly or channel_id for DB lookup
    let targetUrl = embed_url;
    let channelName = "Canal";

    if (!targetUrl && channel_id) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: channel } = await supabase
        .from("tv_channels")
        .select("*")
        .eq("id", channel_id)
        .eq("active", true)
        .single();

      if (!channel) {
        return new Response(JSON.stringify({ error: "Channel not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      targetUrl = channel.stream_url;
      channelName = channel.name;
    }

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: "channel_id or embed_url required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure it's a full URL
    if (!targetUrl.startsWith("http")) {
      targetUrl = `${CINEVEO_BASE}/embed/${targetUrl}`;
    }

    console.log(`[extract-tv] Fetching embed: ${targetUrl}`);

    // Fetch the embed page
    const resp = await fetch(targetUrl, {
      headers: {
        "User-Agent": UA,
        "Referer": CINEVEO_BASE + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    if (!resp.ok) {
      console.error(`[extract-tv] Upstream ${resp.status} for ${targetUrl}`);
      return new Response(JSON.stringify({ error: "Upstream error", status: resp.status }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = await resp.text();
    const found = extractStreamUrl(html, targetUrl);

    if (found) {
      // Force HTTPS
      let secureUrl = found.url;
      if (secureUrl.startsWith("http://")) {
        secureUrl = secureUrl.replace("http://", "https://");
      }

      console.log(`[extract-tv] ✓ Found ${found.type}: ${secureUrl.substring(0, 80)}...`);

      return new Response(JSON.stringify({
        url: secureUrl,
        type: found.type,
        provider: "cineveo",
        channel_name: channelName,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // No stream found - return embed URL for iframe fallback
    console.log(`[extract-tv] No stream found for ${targetUrl}, returning iframe fallback`);
    return new Response(JSON.stringify({
      url: targetUrl,
      type: "iframe",
      provider: "cineveo",
      channel_name: channelName,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[extract-tv] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
