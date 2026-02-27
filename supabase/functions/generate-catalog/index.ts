import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CINEVEO_API = "https://cinetvembed.cineveo.site/api/catalog.php";
const CINEVEO_USER = "lyneflix-vods";
const CINEVEO_PASS = "uVljs2d";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

const ITEMS_PER_FILE = 100;
const PAGES_PER_RUN = 8;
const DELAY_MS = 1000; // Rate limit: 1s between API pages

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
    const apiType: string = body.type || "movies";
    const startPage: number = Number(body.start_page || 1);
    const accumulated: any[] = body.accumulated || [];

    // Ensure storage bucket
    await supabase.storage.createBucket("catalog", {
      public: true,
      fileSizeLimit: 52428800,
      allowedMimeTypes: ["application/json"],
    }).catch(() => {});

    // Fetch pages with rate limiting
    let currentPage = startPage;
    let allItems = [...accumulated];
    let totalApiPages: number | null = null;
    let pagesThisRun = 0;

    for (let i = 0; i < PAGES_PER_RUN; i++) {
      try {
        const { items, totalPages } = await fetchCineveoPage(apiType, currentPage);
        if (totalPages) totalApiPages = totalPages;

        if (items.length === 0) break;

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
          });
        }

        pagesThisRun++;
        currentPage++;

        if (totalApiPages && currentPage > totalApiPages) break;
        if (i < PAGES_PER_RUN - 1) await sleep(DELAY_MS);
      } catch (err) {
        console.warn(`[generate-catalog] Failed page ${currentPage}:`, err);
        currentPage++;
        await sleep(DELAY_MS * 2);
      }
    }

    // Check if more pages to fetch
    const needsMore = totalApiPages ? currentPage <= totalApiPages : pagesThisRun === PAGES_PER_RUN;

    if (needsMore) {
      // Self-chain for next batch
      const selfUrl = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/generate-catalog`;
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
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // All pages fetched — deduplicate and write static JSON files
    const seen = new Map<number, any>();
    for (const item of allItems) {
      seen.set(item.tmdb_id, item);
    }
    const unique = [...seen.values()];

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
      const pageData = {
        total: unique.length,
        page: p + 1,
        per_page: ITEMS_PER_FILE,
        items: pageItems,
      };

      const filePath = `${contentType}/${p + 1}.json`;
      const blob = new Blob([JSON.stringify(pageData)], { type: "application/json" });
      const { error } = await supabase.storage
        .from("catalog")
        .upload(filePath, blob, { upsert: true, contentType: "application/json" });

      if (!error) uploaded++;
    }

    // Merge manifest
    let existingManifest: any = { updated_at: null, types: {} };
    try {
      const { data: manifestFile } = await supabase.storage.from("catalog").download("manifest.json");
      if (manifestFile) {
        existingManifest = JSON.parse(await manifestFile.text());
      }
    } catch {}

    const mergedManifest = {
      updated_at: new Date().toISOString(),
      types: {
        ...(existingManifest?.types || {}),
        [contentType]: {
          total: unique.length,
          pages: totalPages,
        },
      },
    };

    const manifestBlob = new Blob([JSON.stringify(mergedManifest)], { type: "application/json" });
    await supabase.storage.from("catalog").upload("manifest.json", manifestBlob, {
      upsert: true,
      contentType: "application/json",
    });

    // Auto-chain to series if we just finished movies
    if (apiType === "movies" && !body.skip_series) {
      const selfUrl = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/generate-catalog`;
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
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[generate-catalog] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Generation failed",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
