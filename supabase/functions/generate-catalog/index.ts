import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CINEVEO_API = "https://cinetvembed.cineveo.site/api/catalog.php";
const CINEVEO_USER = "lyneflix-vods";
const CINEVEO_PASS = "uVljs2d";
const IPTV_URL = "https://cineveo.site/api/generate_iptv_list.php?user=lyneflix-vods";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

const ITEMS_PER_FILE = 100;
const PAGES_PER_RUN = 8;
const DELAY_MS = 1000;
const M3U_BUCKETS = 100;
const M3U_LOCK_PATH = "m3u-index/_lock.json";
const M3U_LOCK_TTL_MS = 15 * 60 * 1000;

interface M3ULockState {
  running: boolean;
  run_id: string | null;
  started_at_ms: number;
  updated_at: string;
  finished_at?: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readM3ULock(supabase: any): Promise<M3ULockState | null> {
  try {
    const { data } = await supabase.storage.from("catalog").download(M3U_LOCK_PATH);
    if (!data) return null;
    const raw = await data.text();
    const parsed = JSON.parse(raw || "{}");
    if (typeof parsed?.running !== "boolean") return null;
    return parsed as M3ULockState;
  } catch {
    return null;
  }
}

function isFreshM3ULock(lock: M3ULockState | null): boolean {
  if (!lock?.running) return false;
  return Date.now() - Number(lock.started_at_ms || 0) < M3U_LOCK_TTL_MS;
}

async function acquireM3ULock(supabase: any, runId: string): Promise<boolean> {
  const createPayload = () => new Blob([JSON.stringify({
    running: true,
    run_id: runId,
    started_at_ms: Date.now(),
    updated_at: new Date().toISOString(),
  } satisfies M3ULockState)], { type: "application/json" });

  const tryCreate = async () => {
    return await supabase.storage.from("catalog").upload(M3U_LOCK_PATH, createPayload(), {
      upsert: false,
      contentType: "application/json",
    });
  };

  const firstTry = await tryCreate();
  if (!firstTry.error) return true;

  const currentLock = await readM3ULock(supabase);
  if (isFreshM3ULock(currentLock)) return false;

  await supabase.storage.from("catalog").remove([M3U_LOCK_PATH]).catch(() => {});
  const secondTry = await tryCreate();
  return !secondTry.error;
}

async function releaseM3ULock(supabase: any): Promise<void> {
  await supabase.storage.from("catalog").remove([M3U_LOCK_PATH]).catch(() => {});
}

function normalizeDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^\d{4}$/.test(raw)) return `${raw}-01-01`;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
}

function parseM3UEntry(extinf: string, url: string) {
  const idMatch = extinf.match(/tvg-id="(movie|serie|tv|series)[:\s]*(\d+)"/i);
  if (!idMatch) return null;

  const tmdb_id = Number(idMatch[2]);
  if (!tmdb_id) return null;

  const rawType = String(idMatch[1]).toLowerCase();
  const content_type: "movie" | "series" = rawType === "movie" ? "movie" : "series";

  let season = 0;
  let episode = 0;
  if (content_type === "series") {
    const se = url.match(/\/(\d+)\/(\d+)(?:\.[a-zA-Z0-9]+)?(?:\?|$)/);
    if (se) {
      season = Number(se[1]) || 0;
      episode = Number(se[2]) || 0;
    }
  }

  return {
    tmdb_id,
    content_type,
    season,
    episode,
    url,
    type: url.toLowerCase().includes(".m3u8") ? "m3u8" : "mp4",
    provider: "cineveo-m3u",
  };
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

async function generateM3UIndex(supabase: any) {
  const res = await fetch(IPTV_URL, {
    headers: { "User-Agent": UA, Accept: "text/plain,*/*" },
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`M3U download failed: ${res.status}`);

  const text = await res.text();
  const lines = text.split("\n");

  const movieBuckets: Record<string, any>[] = Array.from({ length: M3U_BUCKETS }, () => ({}));
  const seriesBuckets: Record<string, any>[] = Array.from({ length: M3U_BUCKETS }, () => ({}));

  let parsed = 0;
  for (let i = 0; i < lines.length; i++) {
    const extinf = lines[i]?.trim();
    if (!extinf?.startsWith("#EXTINF:")) continue;

    const url = (lines[i + 1] || "").trim();
    if (!url || url.startsWith("#")) continue;

    const entry = parseM3UEntry(extinf, url);
    if (!entry) continue;

    parsed++;
    const bucket = entry.tmdb_id % M3U_BUCKETS;
    const key = String(entry.tmdb_id);

    if (entry.content_type === "movie") {
      if (!movieBuckets[bucket][key]) {
        movieBuckets[bucket][key] = {
          url: entry.url,
          type: entry.type,
          provider: entry.provider,
        };
      }
      continue;
    }

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

  for (let i = 0; i < M3U_BUCKETS; i++) {
    const movieBlob = new Blob([
      JSON.stringify({ updated_at: new Date().toISOString(), bucket: i, items: movieBuckets[i] }),
    ], { type: "application/json" });

    const seriesBlob = new Blob([
      JSON.stringify({ updated_at: new Date().toISOString(), bucket: i, items: seriesBuckets[i] }),
    ], { type: "application/json" });

    await supabase.storage.from("catalog").upload(`m3u-index/movie/${i}.json`, movieBlob, {
      upsert: true,
      contentType: "application/json",
    });

    await supabase.storage.from("catalog").upload(`m3u-index/series/${i}.json`, seriesBlob, {
      upsert: true,
      contentType: "application/json",
    });
  }

  const m3uManifest = {
    updated_at: new Date().toISOString(),
    parsed,
    buckets: M3U_BUCKETS,
    source: IPTV_URL,
  };

  await supabase.storage.from("catalog").upload(
    "m3u-index/manifest.json",
    new Blob([JSON.stringify(m3uManifest)], { type: "application/json" }),
    { upsert: true, contentType: "application/json" },
  );

  return m3uManifest;
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

    await supabase.storage.createBucket("catalog", {
      public: true,
      fileSizeLimit: 52428800,
      allowedMimeTypes: ["application/json", "text/plain"],
    }).catch(() => {});

    if (body.mode === "m3u-only") {
      // Fast-start mode com lock atômico para impedir loops por múltiplos cliques
      if (!body._run) {
        const runId = crypto.randomUUID();
        const acquired = await acquireM3ULock(supabase, runId);
        if (!acquired) {
          const lock = await readM3ULock(supabase);
          return new Response(JSON.stringify({
            done: false,
            started: false,
            mode: "m3u-only",
            message: "Indexação M3U já está em andamento",
            run_id: lock?.run_id || null,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const selfUrl = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/generate-catalog`;
        fetch(selfUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
          },
          body: JSON.stringify({ mode: "m3u-only", _run: true, run_id: runId }),
        }).catch(() => {});

        return new Response(JSON.stringify({
          done: false,
          started: true,
          mode: "m3u-only",
          run_id: runId,
          message: "Indexação M3U iniciada em background",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const currentLock = await readM3ULock(supabase);
      if (!currentLock?.running || currentLock.run_id !== body.run_id) {
        return new Response(JSON.stringify({
          done: false,
          started: false,
          ignored: true,
          mode: "m3u-only",
          message: "Execução ignorada (run inválido ou lock expirado)",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const manifest = await generateM3UIndex(supabase);
        return new Response(JSON.stringify({ done: true, mode: "m3u-only", ...manifest }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } finally {
        await releaseM3ULock(supabase);
      }
    }

    const apiType: string = body.type || "movies";
    const startPage: number = Number(body.start_page || 1);
    const accumulated: any[] = body.accumulated || [];

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

    const needsMore = totalApiPages ? currentPage <= totalApiPages : pagesThisRun === PAGES_PER_RUN;
    if (needsMore) {
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
          skip_series: body.skip_series,
        }),
      }).catch(() => {});

      return new Response(JSON.stringify({
        done: false,
        type: apiType,
        fetched_so_far: allItems.length,
        next_page: currentPage,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const seen = new Map<number, any>();
    for (const item of allItems) seen.set(item.tmdb_id, item);
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
      const pageData = { total: unique.length, page: p + 1, per_page: ITEMS_PER_FILE, items: pageItems };
      const filePath = `${contentType}/${p + 1}.json`;
      const blob = new Blob([JSON.stringify(pageData)], { type: "application/json" });
      const { error } = await supabase.storage.from("catalog").upload(filePath, blob, {
        upsert: true,
        contentType: "application/json",
      });
      if (!error) uploaded++;
    }

    let existingManifest: any = { updated_at: null, types: {} };
    try {
      const { data: manifestFile } = await supabase.storage.from("catalog").download("manifest.json");
      if (manifestFile) existingManifest = JSON.parse(await manifestFile.text());
    } catch {}

    const mergedManifest = {
      updated_at: new Date().toISOString(),
      types: {
        ...(existingManifest?.types || {}),
        [contentType]: { total: unique.length, pages: totalPages },
      },
    };

    await supabase.storage.from("catalog").upload(
      "manifest.json",
      new Blob([JSON.stringify(mergedManifest)], { type: "application/json" }),
      { upsert: true, contentType: "application/json" },
    );

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

    // Build/update M3U ultra-fast lookup index after full run
    if (apiType === "series") {
      try {
        await generateM3UIndex(supabase);
      } catch (m3uErr) {
        console.warn("[generate-catalog] m3u index failed:", m3uErr);
      }
    }

    return new Response(JSON.stringify({
      done: true,
      type: apiType,
      total_items: unique.length,
      files_uploaded: uploaded,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[generate-catalog] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Generation failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
