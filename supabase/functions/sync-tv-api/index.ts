/**
 * Sync TV channels from CineVeo API (type=canais).
 * Fetches ALL pages automatically and upserts into tv_channels.
 * Supports auto-rotation with configurable refresh intervals.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://cinetvembed.cineveo.site/api/catalog.php";
const USERNAME = "lyneflix-vods";
const PASSWORD = "uVljs2d";

// Category normalization
const CATEGORY_MAP: Record<string, { id: number; name: string }> = {
  "JOGOS DO DIA": { id: 15, name: "Jogos do Dia" },
  "BBB - 2026": { id: 8, name: "BBB 2026" },
  "BBB 2026": { id: 8, name: "BBB 2026" },
  "Desenhos": { id: 2, name: "Infantil" },
  "DESENHOS": { id: 2, name: "Infantil" },
  "Premiere": { id: 9, name: "Premiere" },
  "PREMIERE": { id: 9, name: "Premiere" },
  "DAZN BR": { id: 10, name: "DAZN" },
  "⚽ DAZN BR": { id: 10, name: "DAZN" },
  "ESPORTES": { id: 1, name: "Esportes" },
  "⚽ ESPORTES": { id: 1, name: "Esportes" },
  "PARAMOUNT": { id: 11, name: "Paramount" },
  "⚽ PARAMOUNT": { id: 11, name: "Paramount" },
  "PAY-PER-VIEW": { id: 12, name: "Pay-Per-View" },
  "⚽ PAY-PER-VIEW": { id: 12, name: "Pay-Per-View" },
  "Abertos": { id: 3, name: "Abertos" },
  "ABERTOS": { id: 3, name: "Abertos" },
  "Filmes e Séries": { id: 4, name: "Filmes e Séries" },
  "FILMES E SÉRIES": { id: 4, name: "Filmes e Séries" },
  "Infantil": { id: 2, name: "Infantil" },
  "INFANTIL": { id: 2, name: "Infantil" },
  "Notícias": { id: 5, name: "Notícias" },
  "NOTÍCIAS": { id: 5, name: "Notícias" },
  "Variedades": { id: 6, name: "Variedades" },
  "VARIEDADES": { id: 6, name: "Variedades" },
  "Documentários": { id: 13, name: "Documentários" },
  "DOCUMENTÁRIOS": { id: 13, name: "Documentários" },
  "Música": { id: 14, name: "Música" },
  "MÚSICA": { id: 14, name: "Música" },
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[•\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

interface ApiChannel {
  id: number;
  title: string;
  type: string;
  poster: string;
  category: string;
  stream_url: string;
}

interface ApiResponse {
  success: boolean;
  pagination: {
    current_page: number;
    total_pages: number;
    total_items: number;
    limit: number;
  };
  data: ApiChannel[];
}

async function fetchPage(page: number): Promise<ApiResponse | null> {
  const url = `${API_BASE}?username=${USERNAME}&password=${PASSWORD}&type=canais&page=${page}`;
  try {
    const resp = await fetch(url, {
      headers: { "Accept": "application/json" },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
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

    console.log("[sync-tv-api] Starting full channel sync from CineVeo API...");

    // Fetch first page to get pagination info
    const firstPage = await fetchPage(1);
    if (!firstPage?.success) {
      return new Response(JSON.stringify({ error: "Failed to fetch API" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalPages = firstPage.pagination.total_pages;
    const totalItems = firstPage.pagination.total_items;
    console.log(`[sync-tv-api] Total: ${totalItems} channels across ${totalPages} pages`);

    // Collect all channels from all pages
    const allChannels: ApiChannel[] = [...firstPage.data];

    // Fetch remaining pages in parallel batches of 5
    const PARALLEL = 5;
    for (let batch = 2; batch <= totalPages; batch += PARALLEL) {
      const promises: Promise<ApiResponse | null>[] = [];
      for (let p = batch; p < batch + PARALLEL && p <= totalPages; p++) {
        promises.push(fetchPage(p));
      }
      const results = await Promise.all(promises);
      for (const r of results) {
        if (r?.data) allChannels.push(...r.data);
      }
    }

    console.log(`[sync-tv-api] Fetched ${allChannels.length} channels total`);

    // Ensure categories exist
    const seenCats = new Set<number>();
    for (const ch of allChannels) {
      const mapped = CATEGORY_MAP[ch.category];
      if (mapped && !seenCats.has(mapped.id)) {
        seenCats.add(mapped.id);
        await supabase.from("tv_categories").upsert(
          { id: mapped.id, name: mapped.name, sort_order: mapped.id },
          { onConflict: "id" }
        );
      }
    }

    // Also ensure "Jogos do Dia" category exists
    await supabase.from("tv_categories").upsert(
      { id: 15, name: "Jogos do Dia", sort_order: 0 },
      { onConflict: "id" }
    );

    // Transform and deduplicate
    const seen = new Set<string>();
    const dbChannels = allChannels.map((ch, idx) => {
      const slug = `api-${ch.id}`;
      if (seen.has(slug)) return null;
      seen.add(slug);

      const mapped = CATEGORY_MAP[ch.category];
      return {
        id: slug,
        name: ch.title,
        image_url: ch.poster && ch.poster !== "" ? ch.poster : null,
        stream_url: ch.stream_url,
        category: mapped?.name || ch.category,
        categories: mapped ? [mapped.id] : [7],
        active: true,
        sort_order: idx,
      };
    }).filter(Boolean);

    // Upsert in batches
    let upserted = 0;
    const BATCH = 50;
    for (let i = 0; i < dbChannels.length; i += BATCH) {
      const batch = dbChannels.slice(i, i + BATCH);
      const { error } = await supabase
        .from("tv_channels")
        .upsert(batch as any[], { onConflict: "id" });

      if (error) {
        console.error(`[sync-tv-api] Batch ${i} error:`, error.message);
      } else {
        upserted += batch.length;
      }
    }

    // Update last sync timestamp in site_settings
    await supabase.from("site_settings").upsert(
      { key: "tv_last_sync", value: { ts: Date.now(), channels: upserted } },
      { onConflict: "key" }
    );

    console.log(`[sync-tv-api] Done: ${upserted} channels synced`);

    return new Response(JSON.stringify({
      success: true,
      total_api: allChannels.length,
      channels_upserted: upserted,
      total_pages: totalPages,
      categories_synced: seenCats.size,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[sync-tv-api] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error", details: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
