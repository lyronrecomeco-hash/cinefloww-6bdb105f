import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-pass",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Check admin password
  const adminPass = req.headers.get("x-admin-pass");
  const expectedPass = Deno.env.get("ADMIN_LOGS_PASS");

  if (!expectedPass || adminPass !== expectedPass) {
    return new Response(JSON.stringify({ error: "Acesso negado" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const type = url.searchParams.get("type") || "resolve";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

    let data: any[] = [];

    if (type === "resolve") {
      const { data: logs } = await supabase
        .from("resolve_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      data = logs || [];
    } else if (type === "visitors") {
      const { data: visitors } = await supabase
        .from("site_visitors")
        .select("visitor_id, visited_at, pathname, hostname, referrer, user_agent")
        .order("visited_at", { ascending: false })
        .limit(limit);
      data = visitors || [];
    } else if (type === "api") {
      const { data: apiLogs } = await supabase
        .from("api_access_log")
        .select("*")
        .order("accessed_at", { ascending: false })
        .limit(limit);
      data = apiLogs || [];
    } else if (type === "auth") {
      const { data: authLogs } = await supabase
        .from("auth_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      data = authLogs || [];
    }

    return new Response(JSON.stringify({ data, count: data.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
