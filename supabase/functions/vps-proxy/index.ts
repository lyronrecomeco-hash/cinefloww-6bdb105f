import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HARDCODED_VPS_URL = "http://147.93.12.83:3377";

function isAllowedPath(path: string): boolean {
  return /^\/health(?:\?.*)?$/i.test(path) || /^\/api\/[a-z0-9\-_/]+(?:\?.*)?$/i.test(path);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const functionPrefix = "/functions/v1/vps-proxy";
    const suffixPath = url.pathname.includes(functionPrefix)
      ? url.pathname.slice(url.pathname.indexOf(functionPrefix) + functionPrefix.length)
      : "";
    const rawPath = url.searchParams.get("path") || decodeURIComponent(suffixPath || "") || "/health";
    const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;

    if (!isAllowedPath(path)) {
      return new Response(JSON.stringify({ error: "Invalid path" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let baseUrl = HARDCODED_VPS_URL;
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "vps_api_url")
      .maybeSingle();

    if (data?.value) {
      const parsed = typeof data.value === "string"
        ? data.value.replace(/^"|"$/g, "")
        : String(data.value).replace(/^"|"$/g, "");
      if (/^https?:\/\//i.test(parsed)) baseUrl = parsed;
    }

    const target = `${baseUrl.replace(/\/+$/, "")}${path}`;
    const upstreamHeaders = new Headers();
    const contentType = req.headers.get("content-type");
    if (contentType) upstreamHeaders.set("content-type", contentType);

    const upstream = await fetch(target, {
      method: req.method,
      headers: upstreamHeaders,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.text(),
      signal: AbortSignal.timeout(120_000),
    });

    const body = await upstream.arrayBuffer();
    const responseHeaders = new Headers(corsHeaders);
    responseHeaders.set("Cache-Control", "no-store");
    responseHeaders.set("Content-Type", upstream.headers.get("content-type") || "application/json");

    return new Response(body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Proxy error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
