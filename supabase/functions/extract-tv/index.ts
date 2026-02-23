import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Extract m3u8/mp4 URL from embed page HTML
function findVideoUrl(html: string): { url: string; type: "m3u8" | "mp4" } | null {
  // Try m3u8 first
  const m3u8Patterns = [
    /['"]([^'"]*\.m3u8[^'"]*)['"]/gi,
    /source:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/gi,
    /file:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/gi,
    /src:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/gi,
    /hls\.loadSource\(['"]([^'"]+)['"]\)/gi,
  ];
  for (const pattern of m3u8Patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return { url: match[1], type: "m3u8" };
  }
  // Try mp4
  const mp4Patterns = [
    /['"]([^'"]*\.mp4[^'"]*)['"]/gi,
    /source:\s*['"]([^'"]+\.mp4[^'"]*)['"]/gi,
  ];
  for (const pattern of mp4Patterns) {
    const match = pattern.exec(html);
    if (match?.[1] && !match[1].includes("logo")) return { url: match[1], type: "mp4" };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { channel_id } = await req.json();
    if (!channel_id) {
      return new Response(JSON.stringify({ error: "channel_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get channel from DB
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

    const embedUrl = channel.stream_url;
    const isCineveo = embedUrl.includes("cineveo");

    // Fetch the embed page
    const resp = await fetch(embedUrl, {
      headers: {
        "User-Agent": UA,
        "Referer": isCineveo ? "https://cinetvembed.cineveo.site/" : new URL(embedUrl).origin + "/",
        "Accept": "text/html,application/xhtml+xml",
      },
    });

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: "Upstream error", status: resp.status }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = await resp.text();
    const found = findVideoUrl(html);

    if (found) {
      // Force HTTPS to avoid mixed-content blocking on HTTPS pages
      let secureUrl = found.url;
      if (secureUrl.startsWith("http://")) {
        secureUrl = secureUrl.replace("http://", "https://");
      }
      return new Response(JSON.stringify({
        url: secureUrl,
        type: found.type,
        provider: "embedtv",
        channel_name: channel.name,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If no direct URL found, return the embed URL for iframe proxy
    return new Response(JSON.stringify({
      url: embedUrl,
      type: "iframe",
      provider: "embedtv",
      channel_name: channel.name,
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
