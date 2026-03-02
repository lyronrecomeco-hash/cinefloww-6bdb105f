/**
 * Sync TV channels from CineVeo API.
 * Uses type=get_live_streams for active channel validation.
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

/** Real browser User-Agent to avoid bot detection and link expiration */
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/** Normalize category name: strip emojis/symbols, trim, title-case */
function normalizeCategory(raw: string): string {
  return raw
    .replace(/[✨⚽🎬🏆]/g, "")
    .replace(/^\s+|\s+$/g, "")
    .trim();
}

/**
 * Strictly remove /live/ segment and ensure correct URL pattern:
 * https://cinetvembed.cineveo.site/{username}/{password}/{CHANNEL_ID}.m3u8
 */
function cleanStreamUrl(url: string): string {
  // Remove /live/ directory completely
  let clean = url.replace(/\/live\//gi, "/");
  // Ensure the URL follows the correct pattern
  // If it has cineveo.site, make sure it's the clean format
  if (clean.includes("cineveo.site")) {
    // Normalize double slashes (except after protocol)
    clean = clean.replace(/([^:])\/\//g, "$1/");
  }
  return clean;
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
  status?: string;
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

/** Fetch a page from the API with browser-like headers */
async function fetchPage(page: number, apiType = "canais"): Promise<ApiResponse | null> {
  const url = `${API_BASE}?username=${USERNAME}&password=${PASSWORD}&type=${apiType}&page=${page}`;
  try {
    const resp = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": BROWSER_UA,
        "Connection": "keep-alive",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Referer": "https://cinetvembed.cineveo.site/",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/** Fetch active channel IDs from get_live_streams for validation */
async function fetchActiveStreamIds(): Promise<Set<number>> {
  const activeIds = new Set<number>();
  try {
    const firstPage = await fetchPage(1, "get_live_streams");
    if (!firstPage?.success) return activeIds;
    
    for (const ch of firstPage.data) activeIds.add(ch.id);
    
    const totalPages = firstPage.pagination.total_pages;
    const PARALLEL = 5;
    for (let batch = 2; batch <= totalPages; batch += PARALLEL) {
      const promises: Promise<ApiResponse | null>[] = [];
      for (let p = batch; p < batch + PARALLEL && p <= totalPages; p++) {
        promises.push(fetchPage(p, "get_live_streams"));
      }
      const results = await Promise.all(promises);
      for (const r of results) {
        if (r?.data) for (const ch of r.data) activeIds.add(ch.id);
      }
    }
    console.log(`[sync-tv-api] Found ${activeIds.size} active live streams`);
  } catch (err) {
    console.warn("[sync-tv-api] Failed to fetch live streams, skipping validation:", err);
  }
  return activeIds;
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

    // Step 1: Fetch active stream IDs for validation
    const activeStreamIds = await fetchActiveStreamIds();

    // Step 2: Fetch all channels from catalog
    const firstPage = await fetchPage(1);
    if (!firstPage?.success) {
      return new Response(JSON.stringify({ error: "Failed to fetch API" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalPages = firstPage.pagination.total_pages;
    const totalItems = firstPage.pagination.total_items;
    console.log(`[sync-tv-api] Total: ${totalItems} channels across ${totalPages} pages`);

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

    // Step 3: Log active count but keep ALL channels
    const activeCount = activeStreamIds.size > 0
      ? allChannels.filter(ch => activeStreamIds.has(ch.id)).length
      : allChannels.length;
    console.log(`[sync-tv-api] ${activeCount}/${allChannels.length} channels are active`);

    // Build dynamic categories from ALL API data
    const categoryMap = new Map<string, number>();
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

    // Transform and deduplicate ALL channels (set active based on live stream validation)
    const seen = new Set<string>();
    const dbChannels = allChannels.map((ch, idx) => {
      const slug = `api-${ch.id}`;
      if (seen.has(slug)) return null;
      seen.add(slug);

      const catName = normalizeCategory(ch.category);
      const catId = categoryMap.get(catName);

      // Build clean stream URL: strictly https://cinetvembed.cineveo.site/{username}/{password}/{id}.m3u8
      const rawStreamUrl = ch.stream_url || `https://cinetvembed.cineveo.site/${USERNAME}/${PASSWORD}/${ch.id}.m3u8`;
      const finalStreamUrl = cleanStreamUrl(rawStreamUrl);

      // Set active based on live stream validation (if available)
      const isActive = activeStreamIds.size > 0 ? activeStreamIds.has(ch.id) : true;

      return {
        id: slug,
        name: ch.title,
        image_url: ch.poster && ch.poster !== "" ? ch.poster : null,
        stream_url: finalStreamUrl,
        category: catName || ch.category,
        categories: catId ? [catId] : [],
        active: isActive,
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
      { key: "tv_last_sync", value: { ts: Date.now(), channels: upserted, total_api: allChannels.length, active_validated: validChannels.length } },
      { onConflict: "key" }
    );

    console.log(`[sync-tv-api] Done: ${upserted}/${allChannels.length} channels synced (${activeCount} active)`);

    return new Response(JSON.stringify({
      success: true,
      total_api: allChannels.length,
      active_validated: activeCount,
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
