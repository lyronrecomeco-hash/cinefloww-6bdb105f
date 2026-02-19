import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VideoItem {
  nome: string;
  ano: string;
  tmdb_id: string;
  video_url: string;
  url_origem: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const items: VideoItem[] = body.items || body;

    if (!Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "items array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter valid items
    const valid = items.filter(i => 
      i.tmdb_id && i.tmdb_id !== "00000" && i.tmdb_id !== "0" && 
      parseInt(i.tmdb_id) > 0 &&
      i.video_url && i.video_url.startsWith("http")
    );

    // Get unique tmdb_ids
    const tmdbIds = [...new Set(valid.map(i => parseInt(i.tmdb_id)))];

    // Check existing in batches
    const existingSet = new Set<number>();
    for (let i = 0; i < tmdbIds.length; i += 300) {
      const chunk = tmdbIds.slice(i, i + 300);
      const { data } = await supabase
        .from("video_cache")
        .select("tmdb_id")
        .in("tmdb_id", chunk)
        .eq("content_type", "movie");
      if (data) data.forEach(e => existingSet.add(e.tmdb_id));
    }

    // Deduplicate new items
    const seen = new Set<number>();
    const deduped: VideoItem[] = [];
    for (const item of valid) {
      const id = parseInt(item.tmdb_id);
      if (!existingSet.has(id) && !seen.has(id)) {
        seen.add(id);
        deduped.push(item);
      }
    }

    // Insert in batches
    const inserted: { nome: string; tmdb_id: number }[] = [];
    const failed: { nome: string; tmdb_id: number; error: string }[] = [];

    for (let i = 0; i < deduped.length; i += 50) {
      const batch = deduped.slice(i, i + 50);
      const rows = batch.map(item => ({
        tmdb_id: parseInt(item.tmdb_id),
        content_type: "movie",
        audio_type: "dublado",
        video_url: item.video_url,
        video_type: "m3u8",
        provider: "filmesdanet",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }));

      const { error } = await supabase.from("video_cache").insert(rows);

      if (error) {
        for (let j = 0; j < rows.length; j++) {
          const { error: e } = await supabase.from("video_cache").insert(rows[j]);
          if (e) failed.push({ nome: batch[j].nome, tmdb_id: rows[j].tmdb_id, error: e.message });
          else inserted.push({ nome: batch[j].nome, tmdb_id: rows[j].tmdb_id });
        }
      } else {
        batch.forEach(item => inserted.push({ nome: item.nome, tmdb_id: parseInt(item.tmdb_id) }));
      }
    }

    return new Response(JSON.stringify({
      total_no_arquivo: items.length,
      validos: valid.length,
      ja_existiam: existingSet.size,
      novos_unicos: deduped.length,
      inseridos: inserted.length,
      falhas: failed.length,
      inseridos_lista: inserted.slice(0, 50),
      falhas_lista: failed.slice(0, 20),
      ignorados_sem_tmdb: items.length - valid.length,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[bulk-import] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
