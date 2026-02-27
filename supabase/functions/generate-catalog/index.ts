import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IPTV_URL = "https://cineveo.site/api/generate_iptv_list.php?user=lyneflix-vods";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

const ITEMS_PER_FILE = 100;
const M3U_BUCKETS = 100;
const UPLOAD_BATCH = 15;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Parse a single M3U EXTINF + URL pair.
 * Handles formats:
 *   tvg-id="movie:12345"
 *   tvg-id="series:12345:1:3"   (series with S:E embedded)
 *   tvg-id="serie:12345"
 *   tvg-id="tv:12345"
 *   tvg-id="12345" (infers type from group-title or URL)
 */
function parseM3UEntry(extinf: string, url: string) {
  // Try typed tvg-id with optional season:episode
  let idMatch = extinf.match(/tvg-id="(movie|serie|tv|series)[:\s]*(\d+)(?::(\d+):(\d+))?"/i);
  let tmdb_id: number;
  let content_type: "movie" | "series";
  let season = 0;
  let episode = 0;

  if (idMatch) {
    tmdb_id = Number(idMatch[2]);
    const rawType = String(idMatch[1]).toLowerCase();
    content_type = rawType === "movie" ? "movie" : "series";
    if (idMatch[3]) season = Number(idMatch[3]) || 0;
    if (idMatch[4]) episode = Number(idMatch[4]) || 0;
  } else {
    const plainMatch = extinf.match(/tvg-id="(\d+)"/i);
    if (!plainMatch) return null;
    tmdb_id = Number(plainMatch[1]);
    // Infer from group-title or URL
    const groupMatch = extinf.match(/group-title="([^"]+)"/i);
    const group = groupMatch?.[1]?.toLowerCase() || "";
    if (group.includes("movie") || group.includes("filme")) {
      content_type = "movie";
    } else if (group.includes("serie") || group.includes("tv") || group.includes("anime") || group.includes("dorama")) {
      content_type = "series";
    } else if (url.includes("/series/") || url.includes("/tv/")) {
      content_type = "series";
    } else {
      content_type = "movie";
    }
  }

  if (!tmdb_id) return null;

  // Extract S:E from URL if not already parsed
  if (content_type === "series" && season === 0) {
    const se = url.match(/\/(\d+)\/(\d+)(?:\.[a-zA-Z0-9]+)?(?:\?|$)/);
    if (se) {
      season = Number(se[1]) || 0;
      episode = Number(se[2]) || 0;
    }
  }

  // Extract poster from tvg-logo
  const logoMatch = extinf.match(/tvg-logo="([^"]+)"/i);
  const poster = logoMatch?.[1] || null;

  // Extract clean title: from tvg-name or after last comma
  let title: string | null = null;
  const nameMatch = extinf.match(/tvg-name="([^"]+)"/i);
  if (nameMatch) {
    let raw = nameMatch[1].trim();
    // Remove episode prefix like "S01E01 - "
    raw = raw.replace(/^S\d+E\d+\s*[-–]\s*/i, "").trim();
    title = raw || null;
  }
  if (!title) {
    const commaMatch = extinf.match(/,\s*(.+)$/);
    title = commaMatch?.[1]?.trim() || null;
  }

  // Extract year from title
  let year: string | null = null;
  if (title) {
    const yearMatch = title.match(/\((\d{4})\)/);
    if (yearMatch) year = yearMatch[1];
  }

  return {
    tmdb_id,
    content_type,
    season,
    episode,
    url,
    type: url.toLowerCase().includes(".m3u8") ? "m3u8" as const : "mp4" as const,
    provider: "cineveo-m3u",
    poster,
    title,
    year,
  };
}

/** Upload a blob to storage with retry */
async function uploadWithRetry(supabase: any, path: string, blob: Blob, retries = 2): Promise<boolean> {
  for (let i = 0; i <= retries; i++) {
    const { error } = await supabase.storage.from("catalog").upload(path, blob, {
      upsert: true,
      contentType: "application/json",
    });
    if (!error) return true;
    if (i < retries) await sleep(500);
  }
  return false;
}

/** Upload items in parallel batches */
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

/**
 * MAIN: Parse the entire M3U list and build:
 * 1. Catalog pages (movie/1.json, series/1.json, etc.) with title, poster, year
 * 2. Link shards (m3u-index/movie/0-99.json, m3u-index/series/0-99.json) for fast playback lookup
 * 3. IDs file (m3u-index/ids.json) for cross-reference
 * 4. Manifest with complete stats
 */
async function buildFullCatalogFromM3U(supabase: any) {
  console.log("[m3u] Downloading IPTV list...");
  const res = await fetch(IPTV_URL, {
    headers: { "User-Agent": UA, Accept: "text/plain,*/*" },
    signal: AbortSignal.timeout(180_000), // 3min for large lists
  });
  if (!res.ok) throw new Error(`M3U download failed: ${res.status}`);

  const text = await res.text();
  const lines = text.split("\n");
  console.log(`[m3u] ${lines.length} lines downloaded`);

  // ── Step 1: Parse all entries ──
  // Unique catalog items by tmdb_id+type
  const catalogMap = new Map<string, {
    tmdb_id: number;
    title: string;
    poster: string | null;
    content_type: "movie" | "series";
    year: string | null;
  }>();

  // Link shards
  const movieBuckets: Record<string, any>[] = Array.from({ length: M3U_BUCKETS }, () => ({}));
  const seriesBuckets: Record<string, any>[] = Array.from({ length: M3U_BUCKETS }, () => ({}));

  let totalParsed = 0;

  for (let i = 0; i < lines.length; i++) {
    const extinf = lines[i]?.trim();
    if (!extinf?.startsWith("#EXTINF:")) continue;

    const url = (lines[i + 1] || "").trim();
    if (!url || url.startsWith("#")) continue;

    const entry = parseM3UEntry(extinf, url);
    if (!entry) continue;

    totalParsed++;
    const catalogKey = `${entry.content_type}:${entry.tmdb_id}`;
    const bucket = entry.tmdb_id % M3U_BUCKETS;
    const key = String(entry.tmdb_id);

    // Collect unique catalog item (prefer entries with poster/title)
    if (!catalogMap.has(catalogKey)) {
      catalogMap.set(catalogKey, {
        tmdb_id: entry.tmdb_id,
        title: entry.title || `TMDB ${entry.tmdb_id}`,
        poster: entry.poster,
        content_type: entry.content_type,
        year: entry.year,
      });
    } else if (entry.poster && !catalogMap.get(catalogKey)!.poster) {
      const existing = catalogMap.get(catalogKey)!;
      existing.poster = entry.poster;
      if (entry.title) existing.title = entry.title;
      if (entry.year) existing.year = entry.year;
    }

    // Build link shards
    if (entry.content_type === "movie") {
      if (!movieBuckets[bucket][key]) {
        movieBuckets[bucket][key] = {
          url: entry.url,
          type: entry.type,
          provider: entry.provider,
        };
      }
    } else {
      const existing = seriesBuckets[bucket][key] || { default: null, episodes: {} };
      if (entry.season > 0 && entry.episode > 0) {
        existing.episodes[`${entry.season}:${entry.episode}`] = {
          url: entry.url,
          type: entry.type,
          provider: entry.provider,
        };
        if (!existing.default) {
          existing.default = {
            url: entry.url,
            type: entry.type,
            provider: entry.provider,
            season: entry.season,
            episode: entry.episode,
          };
        }
      } else if (!existing.default) {
        existing.default = {
          url: entry.url,
          type: entry.type,
          provider: entry.provider,
          season: 0,
          episode: 0,
        };
      }
      seriesBuckets[bucket][key] = existing;
    }
  }

  console.log(`[m3u] Parsed ${totalParsed} entries → ${catalogMap.size} unique titles`);

  // ── Step 2: Build catalog pages ──
  const movies: any[] = [];
  const series: any[] = [];

  for (const item of catalogMap.values()) {
    const entry = {
      id: `ct-${item.tmdb_id}`,
      tmdb_id: item.tmdb_id,
      title: item.title,
      poster_path: item.poster,
      backdrop_path: null,
      vote_average: 0,
      release_date: item.year ? `${item.year}-01-01` : null,
      content_type: item.content_type,
    };
    if (item.content_type === "movie") {
      movies.push(entry);
    } else {
      series.push(entry);
    }
  }

  // Sort by year descending
  const sortByYear = (a: any, b: any) => (b.release_date || "0000").localeCompare(a.release_date || "0000");
  movies.sort(sortByYear);
  series.sort(sortByYear);

  console.log(`[m3u] Catalog: ${movies.length} movies, ${series.length} series`);

  // ── Step 3: Build all uploads ──
  const uploads: Array<{ path: string; data: any }> = [];
  const now = new Date().toISOString();

  // Catalog pages
  const moviePages = Math.ceil(movies.length / ITEMS_PER_FILE) || 1;
  for (let p = 0; p < moviePages; p++) {
    uploads.push({
      path: `movie/${p + 1}.json`,
      data: {
        total: movies.length,
        page: p + 1,
        per_page: ITEMS_PER_FILE,
        items: movies.slice(p * ITEMS_PER_FILE, (p + 1) * ITEMS_PER_FILE),
      },
    });
  }

  const seriesPages = Math.ceil(series.length / ITEMS_PER_FILE) || 1;
  for (let p = 0; p < seriesPages; p++) {
    uploads.push({
      path: `series/${p + 1}.json`,
      data: {
        total: series.length,
        page: p + 1,
        per_page: ITEMS_PER_FILE,
        items: series.slice(p * ITEMS_PER_FILE, (p + 1) * ITEMS_PER_FILE),
      },
    });
  }

  // Link shards
  for (let i = 0; i < M3U_BUCKETS; i++) {
    uploads.push({
      path: `m3u-index/movie/${i}.json`,
      data: { updated_at: now, bucket: i, items: movieBuckets[i] },
    });
    uploads.push({
      path: `m3u-index/series/${i}.json`,
      data: { updated_at: now, bucket: i, items: seriesBuckets[i] },
    });
  }

  // IDs file for fast cross-reference
  const movieIds = movies.map((m) => m.tmdb_id);
  const seriesIds = series.map((s) => s.tmdb_id);
  uploads.push({
    path: "m3u-index/ids.json",
    data: {
      updated_at: now,
      movies: movieIds,
      series: seriesIds,
      total: movieIds.length + seriesIds.length,
    },
  });

  // M3U manifest
  uploads.push({
    path: "m3u-index/manifest.json",
    data: {
      updated_at: now,
      parsed: totalParsed,
      buckets: M3U_BUCKETS,
      source: IPTV_URL,
      m3u_movies: movieIds.length,
      m3u_series: seriesIds.length,
      m3u_total: movieIds.length + seriesIds.length,
    },
  });

  console.log(`[m3u] Uploading ${uploads.length} files...`);
  const uploaded = await uploadBatch(supabase, uploads);
  console.log(`[m3u] Uploaded ${uploaded}/${uploads.length} files`);

  // ── Step 4: Main manifest ──
  const manifest = {
    updated_at: now,
    types: {
      movie: { total: movies.length, pages: moviePages },
      series: { total: series.length, pages: seriesPages },
    },
    video_coverage: {
      m3u_movies: movieIds.length,
      m3u_series: seriesIds.length,
      m3u_total: movieIds.length + seriesIds.length,
      total_links_parsed: totalParsed,
      indexed_at: now,
    },
  };

  await uploadWithRetry(
    supabase,
    "manifest.json",
    new Blob([JSON.stringify(manifest)], { type: "application/json" }),
  );

  return {
    movies: movies.length,
    series: series.length,
    total: movies.length + series.length,
    links_parsed: totalParsed,
    files_uploaded: uploaded,
  };
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

    // Ensure bucket exists
    await supabase.storage
      .createBucket("catalog", {
        public: true,
        fileSizeLimit: 52428800,
        allowedMimeTypes: ["application/json", "text/plain"],
      })
      .catch(() => {});

    // Background execution mode
    if (body._run) {
      try {
        const result = await buildFullCatalogFromM3U(supabase);
        console.log("[generate-catalog] Done:", JSON.stringify(result));
        return new Response(JSON.stringify({ done: true, ...result }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error("[generate-catalog] Background error:", err);
        return new Response(
          JSON.stringify({ error: err instanceof Error ? err.message : "Failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Trigger background execution and return immediately
    const selfUrl = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/generate-catalog`;
    fetch(selfUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
      },
      body: JSON.stringify({ _run: true }),
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        started: true,
        message: "Sincronização iniciada em background. Catálogo + links serão gerados da lista IPTV completa.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[generate-catalog] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Generation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
