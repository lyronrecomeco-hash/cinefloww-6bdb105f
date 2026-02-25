import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // 1. Clear ALL resolve_failures to unblock everything
    const { count } = await supabase
      .from("resolve_failures")
      .delete()
      .gte("tmdb_id", 0)
      .select("*", { count: "exact" });

    console.log(`[turbo-resolve] Cleared ${count} failures`);

    // 2. Also clear expired video_cache
    await supabase
      .from("video_cache")
      .delete()
      .lt("expires_at", new Date().toISOString());

    // 3. Fire parallel batch-resolve calls (limited to avoid DB overload)
    const PARALLEL_CALLS = 3;
    for (let i = 0; i < PARALLEL_CALLS; i++) {
      fetch(`${supabaseUrl}/functions/v1/batch-resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ _wave: i }),
      }).catch(() => {});
    }

    return new Response(
      JSON.stringify({
        message: "Turbo resolve launched!",
        cleared_failures: count || 0,
        waves_fired: PARALLEL_CALLS,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[turbo-resolve] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
