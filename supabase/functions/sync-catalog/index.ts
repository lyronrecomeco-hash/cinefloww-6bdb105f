/**
 * sync-catalog: Crawls CineVeo API (movies + series) → static catalog + video shards.
 * 
 * Modes:
 *   action: "count" → returns total pages/items from API (fast)
 *   action: "sync"  → full crawl + build (self-chaining)
 */
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

const PAGES_PER_RUN = 15;
const ITEMS_PER_FILE = 100;
const M3U_BUCKETS = 100;
const UPLOAD_BATCH = 15;
const DELAY_MS = 50;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface CrawledItem {
  tmdb_id: number;
  title: string;
  poster: string | null;
  backdrop: string | null;
  year: string | null;
  synopsis: string | null;
  content_type: "movie" | "series";
  stream_url: string | null;
  episodes: Array<{ season: number; episode: number; stream_url: string }>;
}

function normalizeYear(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (/^\d{4}$/.test(raw)) return raw;
  const m = raw.match(/(\d{4})/);
  return m ? m[1] : null;
}

async function fetchApiPage(type: string, page: number) {
  const url = `${CINEVEO_API}?username=${CINEVEO_USER}&password=${CINEVEO_PASS}&type=${type}&page=${page}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`API ${type} p${page} → ${res.status}`);
  const payload = await res.json();
  const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  const totalPages = Number(payload?.pagination?.total_pages || 0) || null;
  const totalItems = Number(payload?.pagination?.total_items || 0) || 0;
  return { items, totalPages, totalItems };
}

async function uploadWithRetry(supabase: any, path: string, blob: Blob, retries = 2): Promise<boolean> {
  for (let i = 0; i <= retries; i++) {
    const { error } = await supabase.storage.from("catalog").upload(path, blob, {
      upsert: true,
      contentType: "application/json",
    });
    if (!error) return true;
    if (i < retries) await sleep(300);
  }
  return false;
}

async function uploadBatch(supabase: any, uploads: Array<{ path: string; data: any }>): Promise<number> {
  let uploaded = 0;
  for (let i = 0; i < uploads.length; i += UPLOAD_BATCH) {
    const batch = uploads.slice(i, i + UPLOAD_BATCH);
    const results = await Promise.allSettled(
      batch.map(({ path, data }) =>
        uploadWithRetry(supabase, path, new Blob([JSON.stringify(data)], { type: "application/json" }))
      ),
    );
    for (const r of results) if (r.status === "fulfilled" && r.value) uploaded++;
  }
  return uploaded;
}

async function saveProgress(supabase: any, data: Record<string, unknown>) {
  try {
    await supabase.from("site_settings").upsert({
      key: "catalog_sync_progress",
      value: { updated_at: new Date().toISOString(), ...data },
    }, { onConflict: "key" });
  } catch (e) {
    console.warn("[sync] saveProgress failed:", e);
  }
}

function selfChain(body: Record<string, unknown>) {
  const selfUrl = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/sync-catalog`;
  fetch(selfUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
    },
    body: JSON.stringify({ ...body, _exec: true }),
  }).catch(() => {});
}

// ── Count mode: fast API probe ──

async function handleCount(): Promise<any> {
  const [moviesRes, seriesRes] = await Promise.all([
    fetchApiPage("movies", 1),
    fetchApiPage("series", 1),
  ]);

  return {
    movies: {
      total_pages: moviesRes.totalPages || 0,
      total_items: moviesRes.totalItems || moviesRes.items.length,
      sample_page_size: moviesRes.items.length,
    },
    series: {
      total_pages: seriesRes.totalPages || 0,
      total_items: seriesRes.totalItems || seriesRes.items.length,
      sample_page_size: seriesRes.items.length,
    },
    total_items: (moviesRes.totalItems || 0) + (seriesRes.totalItems || 0),
    total_pages: (moviesRes.totalPages || 0) + (seriesRes.totalPages || 0),
  };
}

// ── Crawl phase ──

async function handleCrawl(supabase: any, body: any): Promise<any> {
  const apiType: string = body.type || "movies";
  const startPage: number = body.page || 1;
  const batchIndex: number = body.batch || 0;
  const moviesBatches: number = body.movies_batches || 0;

  await saveProgress(supabase, {
    phase: "crawling",
    type: apiType,
    page: startPage,
    batch: batchIndex,
  });

  const items: CrawledItem[] = [];
  let currentPage = startPage;
  let totalApiPages: number | null = null;
  let pagesProcessed = 0;

  for (let i = 0; i < PAGES_PER_RUN; i++) {
    try {
      const { items: pageItems, totalPages } = await fetchApiPage(apiType, currentPage);
      if (totalPages) totalApiPages = totalPages;
      if (pageItems.length === 0) break;

      for (const item of pageItems) {
        const tmdbId = Number(item.tmdb_id || item.id);
        if (!tmdbId) continue;

        const episodes: CrawledItem["episodes"] = [];
        if (apiType === "series" && Array.isArray(item.episodes)) {
          for (const ep of item.episodes) {
            if (ep.stream_url) {
              episodes.push({
                season: Number(ep.season || 1),
                episode: Number(ep.episode || 1),
                stream_url: ep.stream_url,
              });
            }
          }
        }

        items.push({
          tmdb_id: tmdbId,
          title: item.title || `TMDB ${tmdbId}`,
          poster: item.poster || null,
          backdrop: item.backdrop || null,
          year: normalizeYear(item.year),
          synopsis: item.synopsis || null,
          content_type: apiType === "movies" ? "movie" : "series",
          stream_url: item.stream_url || null,
          episodes,
        });
      }

      pagesProcessed++;
      currentPage++;
      if (totalApiPages && currentPage > totalApiPages) break;
      if (i < PAGES_PER_RUN - 1) await sleep(DELAY_MS);
    } catch (err) {
      console.warn(`[sync] Failed ${apiType} p${currentPage}:`, err);
      currentPage++;
    }
  }

  // Save batch to Storage
  if (items.length > 0) {
    const blob = new Blob([JSON.stringify(items)], { type: "application/json" });
    await uploadWithRetry(supabase, `_sync/${apiType}_${batchIndex}.json`, blob);
  }

  const currentBatchCount = batchIndex + (items.length > 0 ? 1 : 0);
  const hasMore = pagesProcessed > 0 && (totalApiPages ? currentPage <= totalApiPages : true);

  if (hasMore) {
    await saveProgress(supabase, {
      phase: "crawling",
      type: apiType,
      page: currentPage,
      batch: currentBatchCount,
      total_pages: totalApiPages,
    });
    selfChain({
      phase: "crawl",
      type: apiType,
      page: currentPage,
      batch: currentBatchCount,
      movies_batches: moviesBatches,
    });
    return { done: false, type: apiType, page: currentPage, batch: currentBatchCount };
  }

  if (apiType === "movies") {
    await saveProgress(supabase, { phase: "crawling", type: "series", page: 1, movies_batches: currentBatchCount });
    selfChain({ phase: "crawl", type: "series", page: 1, batch: 0, movies_batches: currentBatchCount });
    return { done: false, movies_done: true, movies_batches: currentBatchCount };
  }

  // Both done → build
  await saveProgress(supabase, { phase: "building", movies_batches: moviesBatches, series_batches: currentBatchCount });
  selfChain({ phase: "build", movies_batches: moviesBatches, series_batches: currentBatchCount });
  return { done: false, phase: "building" };
}

// ── Build phase ──

async function handleBuild(supabase: any, body: any): Promise<any> {
  const moviesBatches = body.movies_batches || 0;
  const seriesBatches = body.series_batches || 0;

  await saveProgress(supabase, { phase: "building", step: "reading_batches" });

  const readBatch = async (path: string): Promise<CrawledItem[]> => {
    try {
      const { data, error } = await supabase.storage.from("catalog").download(path);
      if (error || !data) return [];
      return JSON.parse(await data.text());
    } catch {
      return [];
    }
  };

  const reads: Promise<CrawledItem[]>[] = [];
  for (let i = 0; i < moviesBatches; i++) reads.push(readBatch(`_sync/movies_${i}.json`));
  for (let i = 0; i < seriesBatches; i++) reads.push(readBatch(`_sync/series_${i}.json`));

  const batches = await Promise.all(reads);
  const allItems = batches.flat();

  console.log(`[sync] Read ${allItems.length} items from ${moviesBatches + seriesBatches} batches`);

  // Deduplicate
  const seen = new Map<string, CrawledItem>();
  for (const item of allItems) {
    const key = `${item.content_type}:${item.tmdb_id}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, item);
    } else {
      if (item.episodes?.length) {
        const existingEps = new Set(existing.episodes.map((e) => `${e.season}:${e.episode}`));
        for (const ep of item.episodes) {
          if (!existingEps.has(`${ep.season}:${ep.episode}`)) existing.episodes.push(ep);
        }
      }
      if (item.poster && !existing.poster) existing.poster = item.poster;
      if (item.backdrop && !existing.backdrop) existing.backdrop = item.backdrop;
      if (item.synopsis && !existing.synopsis) existing.synopsis = item.synopsis;
    }
  }

  const movies: CrawledItem[] = [];
  const series: CrawledItem[] = [];
  for (const item of seen.values()) {
    if (item.content_type === "movie") movies.push(item);
    else series.push(item);
  }

  movies.sort((a, b) => (b.year || "0000").localeCompare(a.year || "0000"));
  series.sort((a, b) => (b.year || "0000").localeCompare(a.year || "0000"));

  console.log(`[sync] Unique: ${movies.length} movies, ${series.length} series`);
  await saveProgress(supabase, { phase: "building", step: "generating", movies: movies.length, series: series.length });

  const uploads: Array<{ path: string; data: any }> = [];
  const now = new Date().toISOString();

  // Catalog pages
  const buildPages = (items: CrawledItem[], type: string) => {
    const totalPages = Math.ceil(items.length / ITEMS_PER_FILE) || 1;
    for (let p = 0; p < totalPages; p++) {
      uploads.push({
        path: `${type}/${p + 1}.json`,
        data: {
          total: items.length,
          page: p + 1,
          per_page: ITEMS_PER_FILE,
          items: items.slice(p * ITEMS_PER_FILE, (p + 1) * ITEMS_PER_FILE).map((item) => ({
            id: `ct-${item.tmdb_id}`,
            tmdb_id: item.tmdb_id,
            title: item.title,
            poster_path: item.poster,
            backdrop_path: item.backdrop,
            vote_average: 0,
            release_date: item.year ? `${item.year}-01-01` : null,
            content_type: item.content_type,
          })),
        },
      });
    }
    return totalPages;
  };

  const moviePages = buildPages(movies, "movie");
  const seriesPages = buildPages(series, "series");

  // Link shards
  const movieBuckets: Record<string, any>[] = Array.from({ length: M3U_BUCKETS }, () => ({}));
  const seriesBuckets: Record<string, any>[] = Array.from({ length: M3U_BUCKETS }, () => ({}));

  for (const item of movies) {
    if (!item.stream_url) continue;
    const bucket = item.tmdb_id % M3U_BUCKETS;
    movieBuckets[bucket][String(item.tmdb_id)] = {
      url: item.stream_url,
      type: item.stream_url.includes(".m3u8") ? "m3u8" : "mp4",
      provider: "cineveo-api",
    };
  }

  for (const item of series) {
    const bucket = item.tmdb_id % M3U_BUCKETS;
    const key = String(item.tmdb_id);
    const entry: any = { default: null, episodes: {} };

    if (item.episodes?.length) {
      for (const ep of item.episodes) {
        entry.episodes[`${ep.season}:${ep.episode}`] = {
          url: ep.stream_url,
          type: ep.stream_url.includes(".m3u8") ? "m3u8" : "mp4",
          provider: "cineveo-api",
        };
        if (!entry.default) {
          entry.default = {
            url: ep.stream_url,
            type: ep.stream_url.includes(".m3u8") ? "m3u8" : "mp4",
            provider: "cineveo-api",
            season: ep.season,
            episode: ep.episode,
          };
        }
      }
    } else if (item.stream_url) {
      entry.default = {
        url: item.stream_url,
        type: item.stream_url.includes(".m3u8") ? "m3u8" : "mp4",
        provider: "cineveo-api",
      };
    }

    if (entry.default || Object.keys(entry.episodes).length > 0) {
      seriesBuckets[bucket][key] = entry;
    }
  }

  for (let i = 0; i < M3U_BUCKETS; i++) {
    uploads.push({ path: `m3u-index/movie/${i}.json`, data: { updated_at: now, bucket: i, items: movieBuckets[i] } });
    uploads.push({ path: `m3u-index/series/${i}.json`, data: { updated_at: now, bucket: i, items: seriesBuckets[i] } });
  }

  const movieIds = movies.map((m) => m.tmdb_id);
  const seriesIds = series.map((s) => s.tmdb_id);
  const moviesWithVideo = movies.filter((m) => m.stream_url).length;
  const seriesWithVideo = series.filter((s) => s.stream_url || s.episodes?.length > 0).length;

  uploads.push({
    path: "m3u-index/ids.json",
    data: { updated_at: now, movies: movieIds, series: seriesIds, total: movieIds.length + seriesIds.length },
  });
  uploads.push({
    path: "m3u-index/manifest.json",
    data: { updated_at: now, source: "cineveo-api", m3u_movies: moviesWithVideo, m3u_series: seriesWithVideo, m3u_total: moviesWithVideo + seriesWithVideo },
  });

  console.log(`[sync] Uploading ${uploads.length} files...`);
  await saveProgress(supabase, { phase: "uploading", files: uploads.length });

  const uploaded = await uploadBatch(supabase, uploads);

  const manifest = {
    updated_at: now,
    types: {
      movie: { total: movies.length, pages: moviePages },
      series: { total: series.length, pages: seriesPages },
    },
    video_coverage: {
      m3u_movies: moviesWithVideo,
      m3u_series: seriesWithVideo,
      m3u_total: moviesWithVideo + seriesWithVideo,
      total_links_parsed: moviesWithVideo + seriesWithVideo,
      indexed_at: now,
    },
  };

  await uploadWithRetry(supabase, "manifest.json", new Blob([JSON.stringify(manifest)], { type: "application/json" }));

  // Cleanup temp files
  const cleanups: Promise<any>[] = [];
  for (let i = 0; i < moviesBatches; i++) cleanups.push(supabase.storage.from("catalog").remove([`_sync/movies_${i}.json`]));
  for (let i = 0; i < seriesBatches; i++) cleanups.push(supabase.storage.from("catalog").remove([`_sync/series_${i}.json`]));
  await Promise.allSettled(cleanups);

  await saveProgress(supabase, {
    phase: "done",
    done: true,
    movies: movies.length,
    series: series.length,
    movies_with_video: moviesWithVideo,
    series_with_video: seriesWithVideo,
    files_uploaded: uploaded,
  });

  return { done: true, movies: movies.length, series: series.length, moviesWithVideo, seriesWithVideo, files_uploaded: uploaded };
}

// ── HTTP Handler ──

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
    const action = body.action || "sync";

    // Fast count mode — probe API for totals
    if (action === "count") {
      const counts = await handleCount();
      return new Response(JSON.stringify(counts), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure bucket
    try {
      await supabase.storage.createBucket("catalog", {
        public: true,
        fileSizeLimit: 52428800,
        allowedMimeTypes: ["application/json"],
      });
    } catch {}

    // Direct execution (self-chained calls)
    if (body._exec) {
      const phase = body.phase || "crawl";
      const result = phase === "build"
        ? await handleBuild(supabase, body)
        : await handleCrawl(supabase, body);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initial trigger
    await saveProgress(supabase, { phase: "starting" });
    selfChain({ phase: "crawl", type: "movies", page: 1, batch: 0 });

    return new Response(
      JSON.stringify({ started: true, message: "Sincronização iniciada." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[sync] Error:", error);
    try {
      await saveProgress(supabase, { phase: "error", error: error instanceof Error ? error.message : String(error) });
    } catch {}
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Sync failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
