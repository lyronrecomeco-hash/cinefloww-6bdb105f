import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // 1. Get all failures older than 6 hours
    const retryThreshold = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: failures, error: fetchErr } = await supabase
      .from("resolve_failures")
      .select("tmdb_id, content_type")
      .lt("attempted_at", retryThreshold)
      .limit(50);

    if (fetchErr || !failures?.length) {
      return new Response(JSON.stringify({ 
        message: "No failures to retry", 
        count: 0 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[auto-retry] Retrying ${failures.length} failed items`);

    let resolved = 0;
    let stillFailed = 0;
    const CONCURRENCY = 5;

    const processItem = async (item: { tmdb_id: number; content_type: string }) => {
      try {
        // Get content title from catalog
        const { data: content } = await supabase
          .from("content")
          .select("title, imdb_id")
          .eq("tmdb_id", item.tmdb_id)
          .eq("content_type", item.content_type)
          .maybeSingle();

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        const res = await fetch(`${supabaseUrl}/functions/v1/extract-video`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            tmdb_id: item.tmdb_id,
            imdb_id: content?.imdb_id || null,
            content_type: item.content_type,
            audio_type: "legendado",
            title: content?.title || `TMDB ${item.tmdb_id}`,
            _skip_providers: ["playerflix"],
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);
        const data = await res.json();

        if (data?.url && data?.type !== "iframe-proxy") {
          // Success! Remove from failures
          await supabase
            .from("resolve_failures")
            .delete()
            .eq("tmdb_id", item.tmdb_id)
            .eq("content_type", item.content_type);
          resolved++;
          console.log(`[auto-retry] ✓ ${content?.title || item.tmdb_id} → ${data.provider}`);
        } else {
          // Still failing, update timestamp
          await supabase
            .from("resolve_failures")
            .update({ attempted_at: new Date().toISOString() })
            .eq("tmdb_id", item.tmdb_id)
            .eq("content_type", item.content_type);
          stillFailed++;
        }
      } catch {
        stillFailed++;
        await supabase
          .from("resolve_failures")
          .update({ attempted_at: new Date().toISOString() })
          .eq("tmdb_id", item.tmdb_id)
          .eq("content_type", item.content_type);
      }
    };

    // Process with concurrency
    const queue = [...failures];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) await processItem(item);
      }
    });

    await Promise.all(workers);

    // Log the retry results
    await supabase.from("resolve_logs").insert({
      tmdb_id: 0,
      title: `Auto-Retry Batch`,
      content_type: "system",
      provider: "auto-retry",
      success: resolved > 0,
      error_message: `Resolved: ${resolved}, Still failed: ${stillFailed}`,
    });

    return new Response(JSON.stringify({
      message: "Auto-retry complete",
      resolved,
      stillFailed,
      total: failures.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[auto-retry] Error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Failed" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
