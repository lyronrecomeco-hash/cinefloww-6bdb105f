import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 50;
const CONCURRENCY = 10;
const MAX_RUNTIME_MS = 120_000; // 2min safe limit before 150s edge timeout

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { chat_id, offset = 0, batch_size = BATCH_SIZE, provider_id, session_id } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const TELEGRAM_API = TELEGRAM_TOKEN ? `https://api.telegram.org/bot${TELEGRAM_TOKEN}` : null;

    const sendTg = async (text: string) => {
      if (!TELEGRAM_API || !chat_id) return;
      try {
        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id, text, parse_mode: "HTML" }),
        });
      } catch {}
    };

    // Load active providers sorted by priority
    let providerQuery = supabase
      .from("scraping_providers")
      .select("*")
      .eq("active", true)
      .order("priority", { ascending: true });
    
    if (provider_id) providerQuery = providerQuery.eq("id", provider_id);
    const { data: providers } = await providerQuery;

    if (!providers?.length) {
      return new Response(JSON.stringify({ error: "No active providers" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get unresolved content
    const { data: unresolvedRpc, error: rpcErr } = await supabase.rpc("get_unresolved_content", { batch_limit: batch_size });
    
    let unresolved: any[] = [];
    if (rpcErr) {
      // Fallback: manual query
      const { data: content } = await supabase
        .from("content")
        .select("tmdb_id, imdb_id, content_type, title")
        .order("title")
        .range(offset, offset + batch_size - 1);
      unresolved = content || [];
    } else {
      unresolved = unresolvedRpc || [];
    }

    if (!unresolved.length) {
      await sendTg("✅ <b>Raspagem concluída!</b>\nTodo o catálogo está indexado.");
      return new Response(JSON.stringify({ 
        done: true, processed: 0, success: 0, failed: 0, offset 
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const startTime = Date.now();
    let processed = 0, success = 0, failed = 0;
    const results: string[] = [];

    // Check if scraping was cancelled
    const isCancelled = async (): Promise<boolean> => {
      if (!session_id) return false;
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", `scrape_session_${session_id}`)
        .maybeSingle();
      return (data?.value as any)?.cancelled === true;
    };

    // Process items in batches of CONCURRENCY
    for (let i = 0; i < unresolved.length; i += CONCURRENCY) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) break;
      if (await isCancelled()) {
        await sendTg("⏹ <b>Raspagem cancelada pelo usuário.</b>");
        break;
      }

      const batch = unresolved.slice(i, i + CONCURRENCY);
      const promises = batch.map(async (item: any) => {
        try {
          const { data: result } = await supabase.functions.invoke("extract-video", {
            body: {
              tmdb_id: item.tmdb_id,
              imdb_id: item.imdb_id,
              content_type: item.content_type,
              title: item.title,
              _skip_providers: ["playerflix"], // skip browser-only
            },
          });

          processed++;
          if (result?.url && result?.type !== "iframe-proxy") {
            success++;
            const provName = result.provider || "?";
            results.push(`✅ ${item.title} → ${provName}`);

            // Update provider health
            if (result.provider) {
              await supabase
                .from("scraping_providers")
                .update({ 
                  success_count: providers.find((p: any) => p.name.toLowerCase().includes(result.provider))?.success_count + 1 || 1,
                  health_status: "healthy",
                  last_checked_at: new Date().toISOString(),
                })
                .ilike("name", `%${result.provider}%`);
            }
          } else {
            failed++;
            results.push(`❌ ${item.title}`);

            // Record failure
            await supabase.from("resolve_failures").upsert({
              tmdb_id: item.tmdb_id,
              content_type: item.content_type,
              attempted_at: new Date().toISOString(),
            }, { onConflict: "tmdb_id,content_type" });
          }
        } catch (err) {
          failed++;
          processed++;
          results.push(`❌ ${item.title} (erro)`);
        }
      });

      await Promise.all(promises);

      // Send progress to Telegram every batch
      if (chat_id && results.length > 0) {
        const progressMsg = results.slice(-CONCURRENCY).join("\n");
        await sendTg(
          `📊 <b>Progresso:</b> ${processed}/${unresolved.length}\n` +
          `✅ ${success} | ❌ ${failed}\n\n${progressMsg}`
        );
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const nextOffset = offset + batch_size;
    const hasMore = unresolved.length === batch_size && (Date.now() - startTime <= MAX_RUNTIME_MS);

    // Self-chain if there's more to process
    if (hasMore && !(await isCancelled())) {
      // Trigger next batch
      const selfUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/smart-scraper`;
      fetch(selfUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ chat_id, offset: nextOffset, batch_size, provider_id, session_id }),
      }).catch(() => {});

      await sendTg(
        `🔄 <b>Lote ${Math.floor(offset / batch_size) + 1} concluído em ${elapsed}s</b>\n` +
        `✅ ${success} | ❌ ${failed}\n\nIniciando próximo lote...`
      );
    } else {
      await sendTg(
        `🏁 <b>Raspagem finalizada!</b>\n\n` +
        `⏱ Tempo: ${elapsed}s\n` +
        `✅ Sucesso: ${success}\n` +
        `❌ Falha: ${failed}\n` +
        `📦 Total processado: ${processed}`
      );
    }

    return new Response(JSON.stringify({
      done: !hasMore,
      processed,
      success,
      failed,
      offset,
      next_offset: hasMore ? nextOffset : null,
      elapsed_seconds: parseFloat(elapsed),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[smart-scraper] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
