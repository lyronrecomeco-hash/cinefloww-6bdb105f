import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 50;
const CONCURRENCY = 15;

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
    // Use RPC for fast query
    const { data: missing, error: qErr } = await supabase.rpc("get_unresolved_content", {
      batch_limit: BATCH_SIZE,
    });

    if (qErr) {
      console.log(`[batch-resolve] RPC error: ${qErr.message}, using fallback`);
      return await fallbackResolve(supabase, supabaseUrl, serviceKey);
    }

    if (!missing?.length) {
      return new Response(JSON.stringify({ message: "All items processed!", resolved: 0, failed: 0, remaining: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[batch-resolve] Processing ${missing.length} items with ${CONCURRENCY} workers`);

    let resolved = 0;
    let failed = 0;
    const failedItems: { tmdb_id: number; content_type: string }[] = [];

    const processItem = async (item: { tmdb_id: number; imdb_id: string | null; content_type: string; title: string }) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

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
          signal: controller.signal,
        });

        clearTimeout(timeout);
        const data = await res.json();
        if (data?.url) {
          resolved++;
          console.log(`[batch-resolve] ✓ ${item.title} → ${data.provider}`);
        } else {
          failed++;
          failedItems.push({ tmdb_id: item.tmdb_id, content_type: item.content_type });
        }
      } catch {
        failed++;
        failedItems.push({ tmdb_id: item.tmdb_id, content_type: item.content_type });
      }
    };

    // Run with high concurrency
    const queue = [...missing];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) await processItem(item);
      }
    });

    await Promise.all(workers);

    // Record failures
    if (failedItems.length > 0) {
      await supabase.from("resolve_failures").upsert(
        failedItems.map(f => ({ tmdb_id: f.tmdb_id, content_type: f.content_type, attempted_at: new Date().toISOString() })),
        { onConflict: "tmdb_id,content_type" }
      );
    }

    return new Response(JSON.stringify({
      message: "Batch complete",
      resolved,
      failed,
      batchSize: missing.length,
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

// Fallback when RPC doesn't exist
async function fallbackResolve(supabase: any, supabaseUrl: string, serviceKey: string) {
  const cachedIds = new Set<number>();
  let offset = 0;
  while (true) {
    const { data } = await supabase.from("video_cache").select("tmdb_id").gt("expires_at", new Date().toISOString()).range(offset, offset + 999);
    if (!data?.length) break;
    data.forEach((c: { tmdb_id: number }) => cachedIds.add(c.tmdb_id));
    if (data.length < 1000) break;
    offset += 1000;
  }

  const failedIds = new Set<number>();
  offset = 0;
  while (true) {
    const { data } = await supabase.from("resolve_failures").select("tmdb_id").range(offset, offset + 999);
    if (!data?.length) break;
    data.forEach((c: { tmdb_id: number }) => failedIds.add(c.tmdb_id));
    if (data.length < 1000) break;
    offset += 1000;
  }

  let contentOffset = 0;
  const batch: any[] = [];
  while (batch.length < BATCH_SIZE) {
    const { data: items } = await supabase.from("content").select("tmdb_id, imdb_id, content_type, title").order("title", { ascending: true }).range(contentOffset, contentOffset + 199);
    if (!items?.length) break;
    for (const item of items) {
      if (!cachedIds.has(item.tmdb_id) && !failedIds.has(item.tmdb_id)) {
        batch.push(item);
        if (batch.length >= BATCH_SIZE) break;
      }
    }
    contentOffset += 200;
  }

  if (batch.length === 0) {
    return new Response(JSON.stringify({ message: "All items processed!", resolved: 0, failed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let resolved = 0;
  let failed = 0;
  const failedItems: { tmdb_id: number; content_type: string }[] = [];

  const processItem = async (item: any) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`${supabaseUrl}/functions/v1/extract-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
        body: JSON.stringify({ tmdb_id: item.tmdb_id, imdb_id: item.imdb_id, content_type: item.content_type, audio_type: "legendado" }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (data?.url) { resolved++; } else { failed++; failedItems.push({ tmdb_id: item.tmdb_id, content_type: item.content_type }); }
    } catch { failed++; failedItems.push({ tmdb_id: item.tmdb_id, content_type: item.content_type }); }
  };

  const queue = [...batch];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) { const item = queue.shift(); if (item) await processItem(item); }
  });
  await Promise.all(workers);

  if (failedItems.length > 0) {
    await supabase.from("resolve_failures").upsert(
      failedItems.map(f => ({ tmdb_id: f.tmdb_id, content_type: f.content_type, attempted_at: new Date().toISOString() })),
      { onConflict: "tmdb_id,content_type" }
    );
  }

  return new Response(JSON.stringify({ message: "Batch complete", resolved, failed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
