import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CINEVEO_API = "https://cinetvembed.cineveo.site/api/catalog.php";
const CINEVEO_USER = "lyneflix-vods";
const CINEVEO_PASS = "uVljs2d";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

const ITEMS_PER_FILE = 100;
const PAGES_PER_RUN = 8;
const DELAY_MS = 800;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^\d{4}$/.test(raw)) return `${raw}-01-01`;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
}

async function fetchCineveoPage(type: string, page: number) {
  const url = `${CINEVEO_API}?username=${CINEVEO_USER}&password=${CINEVEO_PASS}&type=${type}&page=${page}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`CineVeo ${type} p${page} → ${res.status}`);
  const payload = await res.json();
  const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  const totalPages = Number(payload?.pagination?.total_pages || 0) || null;
  return { items, totalPages };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const apiType: string = body.type || "movies"; // "movies" or "series"
    const startPage: number = Number(body.start_page || 1);
    const accumulated: any[] = body.accumulated || [];
    const reset = !!body.reset;

    // Ensure storage bucket
    await supabase.storage.createBucket("catalog", {
      public: true,
      fileSizeLimit: 52428800,
      allowedMimeTypes: ["application/json"],
    }).catch(() => {});

    // Save progress
    const saveProgress = async (phase: string, extra: Record<string, unknown> = {}) => {
      await supabase.from("site_settings").upsert({
        key: "catalog_sync_progress",
        value: { phase, type: apiType, updated_at: new Date().toISOString(), ...extra },
      }, { onConflict: "key" });
    };

    await saveProgress("fetching", { page: startPage, accumulated: accumulated.length });

    // Fetch pages from CineVeo API
    let currentPage = startPage;
    let allItems = [...accumulated];
    let totalApiPages: number | null = null;
    let pagesThisRun = 0;

    for (let i = 0; i < PAGES_PER_RUN; i++) {
      try {
        const { items, totalPages } = await fetchCineveoPage(apiType, currentPage);
        if (totalPages) totalApiPages = totalPages;

        if (items.length === 0) {
          // No more data — we're done with this type
          break;
        }

        for (const item of items) {
          const tmdbId = Number(item.tmdb_id || item.id);
          if (!tmdbId) continue;
          allItems.push({
            id: `ct-${tmdbId}`,
            tmdb_id: tmdbId,
            title: item.title || `TMDB ${tmdbId}`,
            poster_path: item.poster || null,
            backdrop_path: item.backdrop || null,
            vote_average: 0,
            release_date: normalizeDate(item.year),
            content_type: apiType === "movies" ? "movie" : "series",
            stream_url: item.stream_url || null,
          });
        }

        pagesThisRun++;
        currentPage++;

        if (totalApiPages && currentPage > totalApiPages) break;
        if (i < PAGES_PER_RUN - 1) await sleep(DELAY_MS);
      } catch (err) {
        console.warn(`[sync-catalog] Failed page ${currentPage}:`, err);
        currentPage++;
        await sleep(DELAY_MS * 2);
      }
    }

    // Check if we need to continue fetching
    const needsMore = totalApiPages ? currentPage <= totalApiPages : pagesThisRun === PAGES_PER_RUN;

    if (needsMore) {
      await saveProgress("fetching", {
        page: currentPage,
        accumulated: allItems.length,
        total_api_pages: totalApiPages,
      });

      // Self-chain for next batch
      const selfUrl = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/sync-catalog`;
      fetch(selfUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
        },
        body: JSON.stringify({
          type: apiType,
          start_page: currentPage,
          accumulated: allItems,
        }),
      }).catch(() => {});

      return new Response(JSON.stringify({
        done: false,
        type: apiType,
        fetched_so_far: allItems.length,
        next_page: currentPage,
        total_api_pages: totalApiPages,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // All pages fetched — deduplicate and generate static JSON files
    await saveProgress("generating", { total_items: allItems.length });

    // Deduplicate by tmdb_id
    const seen = new Map<number, any>();
    for (const item of allItems) {
      seen.set(item.tmdb_id, item);
    }
    const unique = [...seen.values()];

    // Sort by release_date descending
    unique.sort((a, b) => {
      const da = a.release_date || "0000";
      const db = b.release_date || "0000";
      return db.localeCompare(da);
    });

    const contentType = apiType === "movies" ? "movie" : "series";
    const totalPages = Math.ceil(unique.length / ITEMS_PER_FILE);
    let uploaded = 0;

    for (let p = 0; p < totalPages; p++) {
      const pageItems = unique.slice(p * ITEMS_PER_FILE, (p + 1) * ITEMS_PER_FILE);
      // Remove stream_url from public JSON (security)
      const cleanItems = pageItems.map(({ stream_url, ...rest }) => rest);
      const pageData = {
        total: unique.length,
        page: p + 1,
        per_page: ITEMS_PER_FILE,
        items: cleanItems,
      };

      const filePath = `${contentType}/${p + 1}.json`;
      const blob = new Blob([JSON.stringify(pageData)], { type: "application/json" });
      const { error } = await supabase.storage
        .from("catalog")
        .upload(filePath, blob, { upsert: true, contentType: "application/json" });

      if (!error) uploaded++;
    }

    // Also upsert video_cache with stream URLs (for the player)
    const cacheRows = unique
      .filter((item) => item.stream_url)
      .map((item) => ({
        tmdb_id: item.tmdb_id,
        content_type: contentType,
        audio_type: "dublado",
        video_url: item.stream_url,
        video_type: item.stream_url.includes(".m3u8") ? "m3u8" : "mp4",
        provider: "cineveo-api",
        season: 0,
        episode: 0,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      }));

    for (let i = 0; i < cacheRows.length; i += 200) {
      const batch = cacheRows.slice(i, i + 200);
      await supabase.from("video_cache").upsert(batch, {
        onConflict: "tmdb_id,content_type,audio_type,season,episode",
      }).catch(() => {});
    }

    // Upload manifest
    const manifestBlob = new Blob([JSON.stringify({
      updated_at: new Date().toISOString(),
      types: { [contentType]: { total: unique.length, pages: totalPages } },
    })], { type: "application/json" });
    await supabase.storage.from("catalog").upload("manifest.json", manifestBlob, {
      upsert: true,
      contentType: "application/json",
    });

    await saveProgress("done", {
      type: apiType,
      total_items: unique.length,
      files_uploaded: uploaded,
      cache_rows: cacheRows.length,
    });

    // Auto-chain to next type if we started with movies
    if (apiType === "movies" && !body.skip_series) {
      const selfUrl = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/sync-catalog`;
      fetch(selfUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
        },
        body: JSON.stringify({ type: "series", start_page: 1, accumulated: [], skip_series: true }),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({
      done: true,
      type: apiType,
      total_items: unique.length,
      files_uploaded: uploaded,
      cache_rows: cacheRows.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[sync-catalog] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Sync failed",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
