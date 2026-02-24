import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 30;
const CONCURRENCY = 8;
const ITEM_TIMEOUT_MS = 12_000;
const MAX_RUNTIME_MS = 110_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { mode = "expiring", batch_size = BATCH_SIZE, session_id } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Check cancellation
    const isCancelled = async (): Promise<boolean> => {
      if (!session_id) return false;
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", `refresh_session_${session_id}`)
        .maybeSingle();
      return (data?.value as any)?.cancelled === true;
    };

    // Determine which links to refresh based on mode
    let query = supabase
      .from("video_cache")
      .select("tmdb_id, content_type, audio_type, season, episode, provider, video_type, id")
      .order("expires_at", { ascending: true })
      .limit(batch_size);

    if (mode === "expiring") {
      // Links expiring within 24h
      const soon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      query = query.lt("expires_at", soon);
    } else if (mode === "iframe-proxy") {
      // Replace iframe-proxy with direct links
      query = query.eq("video_type", "iframe-proxy");
    } else if (mode === "old") {
      // Oldest links first (created > 3 days ago)
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      query = query.lt("created_at", threeDaysAgo);
    } else {
      // "all" mode — just get oldest by expires_at
    }

    const { data: staleLinks, error: fetchErr } = await query;

    if (fetchErr || !staleLinks?.length) {
      // Save progress as done
      await supabase.from("site_settings").upsert({
        key: "refresh_links_progress",
        value: { done: true, processed: 0, updated: 0, failed: 0, mode, updated_at: new Date().toISOString() },
      }, { onConflict: "key" });

      return new Response(JSON.stringify({
        done: true, processed: 0, updated: 0, failed: 0, message: "Nenhum link para atualizar"
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get content info for titles (for logging)
    const tmdbIds = [...new Set(staleLinks.map(l => l.tmdb_id))];
    const { data: contentInfo } = await supabase
      .from("content")
      .select("tmdb_id, title, imdb_id, content_type")
      .in("tmdb_id", tmdbIds);

    const contentMap = new Map<string, any>();
    contentInfo?.forEach(c => contentMap.set(`${c.tmdb_id}_${c.content_type}`, c));

    const startTime = Date.now();
    let processed = 0, updated = 0, failed = 0;

    const processItem = async (item: any) => {
      if (Date.now() - startTime > MAX_RUNTIME_MS) return;

      const content = contentMap.get(`${item.tmdb_id}_${item.content_type}`);
      const title = content?.title || `ID:${item.tmdb_id}`;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ITEM_TIMEOUT_MS);

        const res = await fetch(`${supabaseUrl}/functions/v1/extract-video`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            tmdb_id: item.tmdb_id,
            imdb_id: content?.imdb_id || null,
            content_type: item.content_type,
            title,
            audio_type: item.audio_type || "legendado",
            season: item.season || undefined,
            episode: item.episode || undefined,
            _skip_providers: ["playerflix"],
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);
        const data = await res.json();
        processed++;

        if (data?.url && data?.type !== "iframe-proxy") {
          updated++;
          console.log(`✅ ${title} → ${data.provider}`);
        } else {
          failed++;
          console.log(`❌ ${title} (no direct link)`);
        }
      } catch {
        processed++;
        failed++;
        console.log(`❌ ${title} (timeout)`);
      }
    };

    // Process in parallel batches
    for (let i = 0; i < staleLinks.length; i += CONCURRENCY) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) break;
      if (await isCancelled()) break;

      const batch = staleLinks.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(processItem));

      // Save progress incrementally
      await supabase.from("site_settings").upsert({
        key: "refresh_links_progress",
        value: {
          done: false,
          processed,
          updated,
          failed,
          total: staleLinks.length,
          mode,
          updated_at: new Date().toISOString(),
        },
      }, { onConflict: "key" });
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const hasMore = staleLinks.length === batch_size && !await isCancelled();

    // Self-chain if more to process
    if (hasMore) {
      fetch(`${supabaseUrl}/functions/v1/refresh-links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ mode, batch_size, session_id }),
      }).catch(() => {});
    }

    // Final progress
    await supabase.from("site_settings").upsert({
      key: "refresh_links_progress",
      value: {
        done: !hasMore,
        processed,
        updated,
        failed,
        total: staleLinks.length,
        mode,
        elapsed_seconds: parseFloat(elapsed),
        updated_at: new Date().toISOString(),
      },
    }, { onConflict: "key" });

    return new Response(JSON.stringify({
      done: !hasMore,
      processed,
      updated,
      failed,
      elapsed_seconds: parseFloat(elapsed),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[refresh-links] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
