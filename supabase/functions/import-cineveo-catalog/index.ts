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

const PAGE_BATCH_PER_RUN = 25;

type ApiType = "movies" | "series";

type CatalogState = {
  types: ApiType[];
  type_index: number;
  page: number;
  imported_content_total: number;
  imported_cache_total: number;
  processed_pages: number;
};

const normalizeAudio = (value?: string): "dublado" | "legendado" | "cam" => {
  const v = (value || "").toLowerCase();
  if (v.includes("dub") || v.includes("pt") || v.includes("port")) return "dublado";
  if (v.includes("cam")) return "cam";
  return "legendado";
};

const pickStreamUrl = (item: any): string | null =>
  item?.stream_url || item?.streamUrl || item?.url || item?.video_url || item?.link || item?.embed_url || null;

const normalizeReleaseDate = (value: unknown): string | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (/^-?\d{1,4}$/.test(raw)) {
    const year = Number(raw);
    if (!Number.isFinite(year) || year < 1800 || year > 2100) return null;
    return `${String(year).padStart(4, "0")}-01-01`;
  }

  const datePart = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;

  const parsed = new Date(`${datePart}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== datePart) return null;

  return datePart;
};

async function fetchCatalogPage(apiType: ApiType, page: number) {
  const url = `${CINEVEO_API}?username=${CINEVEO_USER}&password=${CINEVEO_PASS}&type=${apiType}&page=${page}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`CineVeo ${apiType} page=${page} returned ${res.status}`);

  const payload = await res.json();
  const items = Array.isArray(payload)
    ? payload
    : payload?.data || payload?.results || payload?.items || [];
  const parsedTotalPages = Number(payload?.pagination?.total_pages || 0) || 0;
  const totalPages = parsedTotalPages > 0 ? parsedTotalPages : null;

  return {
    items: Array.isArray(items) ? items : [],
    totalPages,
    totalItems: Number(payload?.pagination?.total_items || 0) || 0,
  };
}

function buildRows(items: any[], apiType: ApiType) {
  const contentType = apiType === "movies" ? "movie" : "series";
  const contentMap = new Map<number, any>();
  const cacheRows: any[] = [];

  for (const item of items) {
    const tmdbId = Number(item?.tmdb_id || item?.tmdbId || item?.id);
    if (!tmdbId) continue;

    if (!contentMap.has(tmdbId)) {
      contentMap.set(tmdbId, {
        tmdb_id: tmdbId,
        content_type: contentType,
        title: item?.title || item?.name || `TMDB ${tmdbId}`,
        original_title: item?.original_title || item?.original_name || null,
        overview: item?.synopsis || item?.overview || item?.description || "",
        poster_path: item?.poster_path || item?.poster || null,
        backdrop_path: item?.backdrop_path || item?.backdrop || null,
        release_date: normalizeReleaseDate(item?.release_date || item?.first_air_date || item?.year),
        vote_average: item?.vote_average || item?.rating || 0,
        imdb_id: item?.imdb_id || null,
        status: "published",
        featured: false,
        audio_type: ["dublado"],
      });
    }

    if (apiType === "movies") {
      const streamUrl = pickStreamUrl(item);
      if (!streamUrl) continue;
      cacheRows.push({
        tmdb_id: tmdbId,
        content_type: "movie",
        audio_type: normalizeAudio(item?.language || item?.audio),
        video_url: streamUrl,
        video_type: streamUrl.includes(".m3u8") ? "m3u8" : "mp4",
        provider: "cineveo-api",
        season: 0,
        episode: 0,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      continue;
    }

    const episodes = Array.isArray(item?.episodes) ? item.episodes : [];
    if (episodes.length > 0) {
      for (const ep of episodes) {
        const streamUrl = pickStreamUrl(ep);
        if (!streamUrl) continue;
        const season = Number(ep?.season ?? ep?.temporada ?? ep?.s ?? 1) || 1;
        const episode = Number(ep?.episode ?? ep?.ep ?? ep?.e ?? 1) || 1;
        cacheRows.push({
          tmdb_id: tmdbId,
          content_type: "series",
          audio_type: normalizeAudio(ep?.language || ep?.audio || ep?.lang),
          video_url: streamUrl,
          video_type: streamUrl.includes(".m3u8") ? "m3u8" : "mp4",
          provider: "cineveo-api",
          season,
          episode,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    } else {
      const streamUrl = pickStreamUrl(item);
      if (!streamUrl) continue;
      cacheRows.push({
        tmdb_id: tmdbId,
        content_type: "series",
        audio_type: normalizeAudio(item?.language || item?.audio),
        video_url: streamUrl,
        video_type: streamUrl.includes(".m3u8") ? "m3u8" : "mp4",
        provider: "cineveo-api",
        season: 0,
        episode: 0,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }
  }

  return {
    contentRows: [...contentMap.values()],
    cacheRows,
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

  const saveProgress = async (phase: string, data: Record<string, unknown> = {}) => {
    await supabase.from("site_settings").upsert({
      key: "cineveo_import_progress",
      value: { phase, updated_at: new Date().toISOString(), ...data },
    }, { onConflict: "key" });
  };

  try {
    const body = await req.json().catch(() => ({}));

    const state: CatalogState = {
      types: (body.types || ["movies", "series"]).filter((t: string) => t === "movies" || t === "series"),
      type_index: Number(body.type_index || 0) || 0,
      page: Number(body.page || 1) || 1,
      imported_content_total: Number(body.imported_content_total || 0) || 0,
      imported_cache_total: Number(body.imported_cache_total || 0) || 0,
      processed_pages: Number(body.processed_pages || 0) || 0,
    };

    if (!state.types.length) state.types = ["movies", "series"];

    await saveProgress("syncing", state as unknown as Record<string, unknown>);

    const pagesThisRun = Number(body.pages_per_run || PAGE_BATCH_PER_RUN) || PAGE_BATCH_PER_RUN;
    let currentType = state.types[state.type_index] || "movies";
    let currentPage = state.page;

    let importedContent = 0;
    let importedCache = 0;

    let emptyStreakForType = 0;

    for (let processed = 0; processed < pagesThisRun; processed++) {
      const pageData = await fetchCatalogPage(currentType, currentPage);
      const { contentRows, cacheRows } = buildRows(pageData.items, currentType);

      if (pageData.items.length === 0) emptyStreakForType += 1;
      else emptyStreakForType = 0;

      for (let i = 0; i < contentRows.length; i += 200) {
        const batch = contentRows.slice(i, i + 200);
        const { error } = await supabase.from("content").upsert(batch, { onConflict: "tmdb_id,content_type" });
        if (!error) importedContent += batch.length;
      }

      for (let i = 0; i < cacheRows.length; i += 200) {
        const batch = cacheRows.slice(i, i + 200);
        const { error } = await supabase.from("video_cache").upsert(batch, { onConflict: "tmdb_id,content_type,audio_type,season,episode" });
        if (!error) importedCache += batch.length;
      }

      state.processed_pages += 1;
      state.imported_content_total += contentRows.length;
      state.imported_cache_total += cacheRows.length;

      await saveProgress("syncing", {
        ...state,
        current_type: currentType,
        current_page: currentPage,
        total_pages_for_type: pageData.totalPages,
        total_items_for_type: pageData.totalItems,
        empty_streak_for_type: emptyStreakForType,
      });

      const reachedEndByPagination = !!pageData.totalPages && currentPage >= pageData.totalPages;
      const reachedEndByEmptyPages = !pageData.totalPages && emptyStreakForType >= 2;

      if (!reachedEndByPagination && !reachedEndByEmptyPages) {
        currentPage += 1;
      } else {
        state.type_index += 1;
        emptyStreakForType = 0;

        if (state.type_index >= state.types.length) {
          await saveProgress("done", {
            ...state,
            done: true,
            imported_content_total: state.imported_content_total,
            imported_cache_total: state.imported_cache_total,
          });

          return new Response(JSON.stringify({
            done: true,
            imported_content_run: importedContent,
            imported_cache_run: importedCache,
            imported_content_total: state.imported_content_total,
            imported_cache_total: state.imported_cache_total,
            processed_pages: state.processed_pages,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        currentType = state.types[state.type_index];
        currentPage = 1;
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const selfUrl = `${supabaseUrl}/functions/v1/import-cineveo-catalog`;

    fetch(selfUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        types: state.types,
        type_index: state.type_index,
        page: currentPage,
        pages_per_run: pagesThisRun,
        imported_content_total: state.imported_content_total,
        imported_cache_total: state.imported_cache_total,
        processed_pages: state.processed_pages,
      }),
    }).catch(() => {});

    return new Response(JSON.stringify({
      done: false,
      queued: true,
      next_type: currentType,
      next_page: currentPage,
      imported_content_run: importedContent,
      imported_cache_run: importedCache,
      imported_content_total: state.imported_content_total,
      imported_cache_total: state.imported_cache_total,
      processed_pages: state.processed_pages,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
