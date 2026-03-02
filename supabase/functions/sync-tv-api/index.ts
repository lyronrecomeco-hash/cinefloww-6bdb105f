/**
 * Sync TV channels from CineVeo API (type=canais).
 * Fetches ALL pages automatically and upserts into tv_channels.
 * Dynamic category creation - no static map needed.
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

/** Normalize category name: strip emojis/symbols, trim, title-case */
function normalizeCategory(raw: string): string {
  return raw
    .replace(/[✨⚽🎬🏆]/g, "")
    .replace(/^\s+|\s+$/g, "")
    .trim();
}

/** Remove /live/ segment from stream URLs — fixes broken channels */
function cleanStreamUrl(url: string): string {
  return url.replace(/\/live\//gi, "/");
}

/** Generate a stable numeric ID from category name */
function categoryHash(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 90000) + 100; // 100-90099 range
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
      signal: AbortSignal.timeout(15000),
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

    // Build dynamic categories from API data
    const categoryMap = new Map<string, number>(); // normalized name → id
    for (const ch of allChannels) {
      const name = normalizeCategory(ch.category);
      if (!name) continue;
      if (!categoryMap.has(name)) {
        categoryMap.set(name, categoryHash(name));
      }
    }

    // Upsert all categories
    const catRows = Array.from(categoryMap.entries()).map(([name, id], idx) => ({
      id,
      name,
      sort_order: idx,
    }));
    if (catRows.length > 0) {
      const { error: catErr } = await supabase
        .from("tv_categories")
        .upsert(catRows, { onConflict: "id" });
      if (catErr) console.error("[sync-tv-api] Category upsert error:", catErr.message);
    }

    console.log(`[sync-tv-api] ${catRows.length} categories synced`);

    // Transform and deduplicate channels
    const seen = new Set<string>();
    const dbChannels = allChannels.map((ch, idx) => {
      const slug = `api-${ch.id}`;
      if (seen.has(slug)) return null;
      seen.add(slug);

      const catName = normalizeCategory(ch.category);
      const catId = categoryMap.get(catName);

      return {
        id: slug,
        name: ch.title,
        image_url: ch.poster && ch.poster !== "" ? ch.poster : null,
        stream_url: cleanStreamUrl(ch.stream_url),
        category: catName || ch.category,
        categories: catId ? [catId] : [],
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

    // Remove channels NOT from the API (old manual entries)
    const apiIds = Array.from(seen);
    // Fetch ALL existing channel IDs (handle >1000 rows)
    let allDbIds: string[] = [];
    let offset = 0;
    const PAGE = 1000;
    while (true) {
      const { data: batch } = await supabase
        .from("tv_channels")
        .select("id")
        .range(offset, offset + PAGE - 1);
      if (!batch || batch.length === 0) break;
      allDbIds.push(...batch.map(c => c.id));
      if (batch.length < PAGE) break;
      offset += PAGE;
    }
    if (allDbIds.length > 0) {
      const apiIdSet = new Set(apiIds);
      const toDelete = allDbIds.filter(id => !apiIdSet.has(id));
      if (toDelete.length > 0) {
        for (let i = 0; i < toDelete.length; i += 50) {
          const batch = toDelete.slice(i, i + 50);
          await supabase.from("tv_channels").delete().in("id", batch);
        }
        console.log(`[sync-tv-api] Removed ${toDelete.length} old non-API channels`);
      }
    }

    // Update last sync timestamp
    await supabase.from("site_settings").upsert(
      { key: "tv_last_sync", value: { ts: Date.now(), channels: upserted, total_api: allChannels.length } },
      { onConflict: "key" }
    );

    console.log(`[sync-tv-api] Done: ${upserted}/${allChannels.length} channels synced`);

    return new Response(JSON.stringify({
      success: true,
      total_api: allChannels.length,
      channels_upserted: upserted,
      total_pages: totalPages,
      categories_synced: catRows.length,
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
