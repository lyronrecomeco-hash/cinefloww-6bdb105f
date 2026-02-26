import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CINEVEO_API = "https://cinetvembed.cineveo.site/api/catalog.php";
const CINEVEO_USER = "lyneflix-vods";
const CINEVEO_PASS = "uVljs2d";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const PAGES_PER_RUN = 10;
const MAX_PAGE_ERRORS = 5;

type ApiType = "movies" | "series";

interface CineVeoItem {
  id: number;
  tmdb_id: number;
  title: string;
  type: string; // "filme" or "serie"
  poster: string;
  backdrop: string;
  year: string;
  genres: string;
  synopsis: string;
  stream_url: string;
  // Series may have episodes array
  episodes?: Array<{
    season: number;
    episode: number;
    stream_url: string;
    title?: string;
  }>;
}

function normalizeDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^\d{4}$/.test(raw)) {
    const year = Number(raw);
    if (year < 1800 || year > 2100) return null;
    return `${raw}-01-01`;
  }
  const datePart = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  return datePart;
}

async function fetchPage(apiType: ApiType, page: number) {
  const url = `${CINEVEO_API}?username=${CINEVEO_USER}&password=${CINEVEO_PASS}&type=${apiType}&page=${page}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`CineVeo ${apiType} page=${page} returned ${res.status}`);
  const payload = await res.json();

  // API returns { success, pagination: { current_page, total_pages, total_items, limit }, data: [...] }
  const items: CineVeoItem[] = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload) ? payload : [];

  const totalPages = Number(payload?.pagination?.total_pages || 0) || null;
  const totalItems = Number(payload?.pagination?.total_items || 0) || 0;

  return { items, totalPages, totalItems };
}

function buildRows(items: CineVeoItem[], apiType: ApiType) {
  const contentType = apiType === "movies" ? "movie" : "series";
  const contentRows: any[] = [];
  const cacheRows: any[] = [];
  const seen = new Set<number>();

  for (const item of items) {
    const tmdbId = Number(item.tmdb_id || item.id);
    if (!tmdbId) continue;

    if (!seen.has(tmdbId)) {
      seen.add(tmdbId);
      contentRows.push({
        tmdb_id: tmdbId,
        content_type: contentType,
        title: item.title || `TMDB ${tmdbId}`,
        overview: item.synopsis || "",
        poster_path: item.poster || null,
        backdrop_path: item.backdrop || null,
        release_date: normalizeDate(item.year),
        vote_average: 0,
        status: "published",
        featured: false,
        audio_type: ["dublado"],
      });
    }

    // Build video cache rows
    if (apiType === "movies") {
      if (item.stream_url) {
        cacheRows.push({
          tmdb_id: tmdbId,
          content_type: "movie",
          audio_type: "dublado",
          video_url: item.stream_url,
          video_type: item.stream_url.includes(".m3u8") ? "m3u8" : "mp4",
          provider: "cineveo-api",
          season: 0,
          episode: 0,
          expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    } else {
      // Series: check for episodes array
      const episodes = Array.isArray(item.episodes) ? item.episodes : [];
      if (episodes.length > 0) {
        for (const ep of episodes) {
          if (!ep.stream_url) continue;
          cacheRows.push({
            tmdb_id: tmdbId,
            content_type: "series",
            audio_type: "dublado",
            video_url: ep.stream_url,
            video_type: ep.stream_url.includes(".m3u8") ? "m3u8" : "mp4",
            provider: "cineveo-api",
            season: Number(ep.season || 1),
            episode: Number(ep.episode || 1),
            expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      } else if (item.stream_url) {
        // Single stream for series (no episode breakdown)
        cacheRows.push({
          tmdb_id: tmdbId,
          content_type: "series",
          audio_type: "dublado",
          video_url: item.stream_url,
          video_type: item.stream_url.includes(".m3u8") ? "m3u8" : "mp4",
          provider: "cineveo-api",
          season: 0,
          episode: 0,
          expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }
  }

  return { contentRows, cacheRows };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const saveProgress = async (phase: string, data: Record<string, unknown> = {}) => {
    await supabase.from("site_settings").upsert({
      key: "cineveo_import_progress",
      value: { phase, updated_at: new Date().toISOString(), ...data },
    }, { onConflict: "key" });
  };

  try {
    const body = await req.json().catch(() => ({}));
    const reset = !!body.reset;
    const brute = !!body.brute;

    const types: ApiType[] = (body.types || ["movies", "series"]).filter(
      (t: string) => t === "movies" || t === "series"
    );

    let typeIndex = Number(body.type_index || 0) || 0;
    let currentPage = Number(body.page || 1) || 1;
    let totalContentImported = Number(body.imported_content_total || 0) || 0;
    let totalCacheImported = Number(body.imported_cache_total || 0) || 0;
    let totalPagesProcessed = Number(body.processed_pages || 0) || 0;
    let failedPages = Number(body.failed_pages || 0) || 0;

    if (reset) {
      typeIndex = 0;
      currentPage = 1;
      totalContentImported = 0;
      totalCacheImported = 0;
      totalPagesProcessed = 0;
      failedPages = 0;
    }

    if (!types.length) types.push("movies", "series");

    await saveProgress("syncing", {
      current_type: types[typeIndex],
      current_page: currentPage,
      imported_content_total: totalContentImported,
      imported_cache_total: totalCacheImported,
      processed_pages: totalPagesProcessed,
    });

    const pagesThisRun = Number(body.pages_per_run || 0) || (brute ? 15 : PAGES_PER_RUN);
    let currentType = types[typeIndex] || "movies";
    let contentThisRun = 0;
    let cacheThisRun = 0;
    let pageErrors = 0;

    for (let p = 0; p < pagesThisRun; p++) {
      let pageData;
      try {
        pageData = await fetchPage(currentType, currentPage);
      } catch (err) {
        pageErrors++;
        failedPages++;
        currentPage++;
        if (pageErrors >= MAX_PAGE_ERRORS) break;
        continue;
      }

      if (pageData.items.length === 0) {
        // Move to next type
        typeIndex++;
        if (typeIndex >= types.length) {
          await saveProgress("done", {
            done: true,
            imported_content_total: totalContentImported,
            imported_cache_total: totalCacheImported,
            processed_pages: totalPagesProcessed,
          });
          return new Response(JSON.stringify({
            done: true,
            imported_content_total: totalContentImported,
            imported_cache_total: totalCacheImported,
            processed_pages: totalPagesProcessed,
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        currentType = types[typeIndex];
        currentPage = 1;
        continue;
      }

      const { contentRows, cacheRows } = buildRows(pageData.items, currentType);

      // Upsert content
      for (let i = 0; i < contentRows.length; i += 200) {
        const batch = contentRows.slice(i, i + 200);
        const { error } = await supabase.from("content").upsert(batch, { onConflict: "tmdb_id,content_type" });
        if (!error) contentThisRun += batch.length;
      }

      // Upsert cache
      for (let i = 0; i < cacheRows.length; i += 200) {
        const batch = cacheRows.slice(i, i + 200);
        const { error } = await supabase.from("video_cache").upsert(batch, { onConflict: "tmdb_id,content_type,audio_type,season,episode" });
        if (!error) cacheThisRun += batch.length;
      }

      totalContentImported += contentRows.length;
      totalCacheImported += cacheRows.length;
      totalPagesProcessed++;

      await saveProgress("syncing", {
        current_type: currentType,
        current_page: currentPage,
        total_pages_for_type: pageData.totalPages,
        total_items_for_type: pageData.totalItems,
        imported_content_total: totalContentImported,
        imported_cache_total: totalCacheImported,
        processed_pages: totalPagesProcessed,
      });

      // Check if reached end
      if (pageData.totalPages && currentPage >= pageData.totalPages) {
        typeIndex++;
        if (typeIndex >= types.length) {
          await saveProgress("done", {
            done: true,
            imported_content_total: totalContentImported,
            imported_cache_total: totalCacheImported,
            processed_pages: totalPagesProcessed,
          });
          return new Response(JSON.stringify({
            done: true,
            imported_content_total: totalContentImported,
            imported_cache_total: totalCacheImported,
            processed_pages: totalPagesProcessed,
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        currentType = types[typeIndex];
        currentPage = 1;
      } else {
        currentPage++;
      }
    }

    // Self-chain for next batch
    const selfUrl = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/import-cineveo-catalog`;
    fetch(selfUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
      },
      body: JSON.stringify({
        types,
        type_index: typeIndex,
        page: currentPage,
        pages_per_run: pagesThisRun,
        brute,
        imported_content_total: totalContentImported,
        imported_cache_total: totalCacheImported,
        processed_pages: totalPagesProcessed,
        failed_pages: failedPages,
      }),
    }).catch(() => {});

    return new Response(JSON.stringify({
      done: false,
      queued: true,
      next_type: currentType,
      next_page: currentPage,
      imported_content_total: totalContentImported,
      imported_cache_total: totalCacheImported,
      processed_pages: totalPagesProcessed,
      failed_pages: failedPages,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[cineveo-import] Error:", error);
    await saveProgress("error", {
      error: error instanceof Error ? error.message : String(error),
      done: true,
    });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Import failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
