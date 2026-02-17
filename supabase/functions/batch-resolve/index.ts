import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 20; // items per invocation
const CONCURRENCY = 5; // parallel extract calls

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    // Get all cached tmdb_ids
    const cachedIds = new Set<number>();
    let offset = 0;
    while (true) {
      const { data } = await supabase
        .from("video_cache")
        .select("tmdb_id")
        .gt("expires_at", new Date().toISOString())
        .range(offset, offset + 999);
      if (!data?.length) break;
      data.forEach((c: { tmdb_id: number }) => cachedIds.add(c.tmdb_id));
      if (data.length < 1000) break;
      offset += 1000;
    }

    console.log(`[batch-resolve] ${cachedIds.size} items already cached`);

    // Get next batch of content without cache, ordered alphabetically
    const { data: items, error } = await supabase
      .from("content")
      .select("tmdb_id, imdb_id, content_type, title")
      .order("title", { ascending: true })
      .limit(500); // fetch more to filter

    if (error || !items?.length) {
      return new Response(JSON.stringify({ message: "No items found", resolved: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter out already cached
    const missing = items.filter((i: { tmdb_id: number }) => !cachedIds.has(i.tmdb_id));
    const batch = missing.slice(0, BATCH_SIZE);

    if (batch.length === 0) {
      // Try next page
      const { data: items2 } = await supabase
        .from("content")
        .select("tmdb_id, imdb_id, content_type, title")
        .order("title", { ascending: true })
        .range(500, 999);

      const missing2 = (items2 || []).filter((i: { tmdb_id: number }) => !cachedIds.has(i.tmdb_id));
      if (missing2.length === 0) {
        return new Response(JSON.stringify({ message: "All items resolved!", resolved: 0, remaining: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    console.log(`[batch-resolve] Processing ${batch.length} items, ${missing.length} total missing in first 500`);

    // Process batch with concurrency
    let resolved = 0;
    let failed = 0;

    const processItem = async (item: { tmdb_id: number; imdb_id: string | null; content_type: string; title: string }) => {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/extract-video`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            tmdb_id: item.tmdb_id,
            imdb_id: item.imdb_id,
            content_type: item.content_type,
            audio_type: "legendado",
          }),
        });

        const data = await res.json();
        if (data?.url) {
          resolved++;
          console.log(`[batch-resolve] ✓ ${item.title} → ${data.provider}`);
        } else {
          failed++;
          console.log(`[batch-resolve] ✗ ${item.title} → no link`);
        }
      } catch (err) {
        failed++;
        console.log(`[batch-resolve] ✗ ${item.title} → error: ${err}`);
      }
    };

    // Run with concurrency limit
    const queue = [...batch];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) await processItem(item);
      }
    });

    await Promise.all(workers);

    const totalMissing = missing.length - resolved;

    return new Response(JSON.stringify({
      message: `Batch complete`,
      resolved,
      failed,
      remaining: Math.max(0, totalMissing),
      totalCached: cachedIds.size + resolved,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[batch-resolve] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
