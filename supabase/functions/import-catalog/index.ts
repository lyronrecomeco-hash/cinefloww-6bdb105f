import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const TMDB_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI1MDFiOWNkYjllNDQ0NjkxMDJiODk5YjQ0YjU2MWQ5ZCIsIm5iZiI6MTc3MTIzMDg1My43NjYsInN1YiI6IjY5OTJkNjg1NzZjODAxNTdmMjFhZjMxMSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.c47JvphccOz_oyaUuQWCHQ1mXAsSH01OB14vKE2uenw";
const TMDB_BASE = "https://api.themoviedb.org/3";
const tmdbHeaders = {
  Authorization: `Bearer ${TMDB_TOKEN}`,
  "Content-Type": "application/json",
};

const _h = atob("aHR0cHM6Ly9jaW5ldmVvLnNpdGU=");

interface CatalogItem {
  tmdb_id: string;
  title: string;
  name: string;
  poster_path: string;
  media_type: string;
  slug: string;
  release_date: string;
  runtime: string;
  vote_average: string;
}

async function fetchCatalogPage(type: "movie" | "tv", page: number): Promise<CatalogItem[]> {
  const url = `${_h}/category.php?fetch_mode=1&type=${type}&page=${page}&genre=`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json, */*" } });
    if (!res.ok) return [];
    const data = await res.json();
    if (data.success && Array.isArray(data.results)) return data.results;
  } catch { /* skip */ }
  return [];
}

async function getTotalPages(type: "movie" | "tv"): Promise<number> {
  async function pageHasResults(page: number): Promise<boolean> {
    const url = `${_h}/category.php?fetch_mode=1&type=${type}&page=${page}&genre=`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json, */*" } });
      if (!res.ok) return false;
      const data = await res.json();
      return data.success && Array.isArray(data.results) && data.results.length > 0;
    } catch { return false; }
  }

  let low = 1;
  let high = 100;
  while (await pageHasResults(high)) {
    low = high;
    high *= 2;
    if (high > 5000) break;
  }
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (await pageHasResults(mid)) low = mid;
    else high = mid - 1;
  }
  return low;
}

async function fetchTMDBBatch(items: { tmdbId: number; type: "movie" | "tv" }[], concurrency = 8): Promise<Map<number, any>> {
  const results = new Map<number, any>();
  const queue = [...items];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      try {
        const url = `${TMDB_BASE}/${item.type}/${item.tmdbId}?language=pt-BR&append_to_response=external_ids`;
        const res = await fetch(url, { headers: tmdbHeaders });
        if (res.ok) {
          results.set(item.tmdbId, await res.json());
        }
      } catch { /* skip */ }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function sanitizeDate(d: string | null | undefined): string | null {
  if (!d || d === "0000-00-00" || d.startsWith("0000")) return null;
  return d;
}

const MAX_PAGES_PER_CALL = 20;

// ── Dorama import via TMDB Discover (Korean/Japanese dramas) ────────
async function fetchDoramaTMDBPage(page: number): Promise<any[]> {
  // Search Korean and Japanese drama TV shows
  const urls = [
    `${TMDB_BASE}/discover/tv?language=pt-BR&sort_by=popularity.desc&with_origin_country=KR&with_genres=18&page=${page}`,
    `${TMDB_BASE}/discover/tv?language=pt-BR&sort_by=popularity.desc&with_origin_country=JP&with_genres=18&page=${page}`,
  ];
  const allResults: any[] = [];
  const seenIds = new Set<number>();

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: tmdbHeaders });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data.results)) {
        for (const item of data.results) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            allResults.push(item);
          }
        }
      }
    } catch { /* skip */ }
  }
  return allResults;
}

async function getDoramaTotalPages(): Promise<number> {
  try {
    const res = await fetch(
      `${TMDB_BASE}/discover/tv?language=pt-BR&sort_by=popularity.desc&with_origin_country=KR&with_genres=18&page=1`,
      { headers: tmdbHeaders },
    );
    if (!res.ok) return 50;
    const data = await res.json();
    return Math.min(data.total_pages || 50, 500);
  } catch { return 50; }
}

async function handleDoramaImport(
  action: string, startPage: number, _enrich: boolean,
  userId: string, adminClient: any,
): Promise<Response> {
  if (action === "count") {
    const totalPages = await getDoramaTotalPages();
    return new Response(
      JSON.stringify({ success: true, total_pages: totalPages, estimated_items: totalPages * 20 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (action === "sync-check") {
    const totalPages = await getDoramaTotalPages();
    const { count: dbCount } = await adminClient
      .from("content").select("*", { count: "exact", head: true })
      .eq("content_type", "dorama");

    return new Response(
      JSON.stringify({
        success: true,
        total_pages: totalPages,
        estimated_total: totalPages * 20,
        in_database: dbCount || 0,
        estimated_missing: Math.max(0, totalPages * 20 - (dbCount || 0)),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Import action
  const endPage = startPage + Math.min(MAX_PAGES_PER_CALL, 10) - 1;
  console.log(`[import-dorama] Pages ${startPage}-${endPage}`);

  const allItems: any[] = [];
  const seenIds = new Set<number>();

  for (let p = startPage; p <= endPage; p++) {
    const items = await fetchDoramaTMDBPage(p);
    for (const item of items) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        allItems.push(item);
      }
    }
    if (items.length === 0) break;
  }

  console.log(`[import-dorama] Fetched ${allItems.length} doramas`);

  const rows = allItems.map(item => ({
    tmdb_id: item.id,
    content_type: "dorama",
    title: item.name || item.original_name || "Sem título",
    original_title: item.original_name || null,
    overview: item.overview || "",
    poster_path: item.poster_path || null,
    backdrop_path: item.backdrop_path || null,
    release_date: sanitizeDate(item.first_air_date),
    vote_average: item.vote_average || 0,
    number_of_seasons: null,
    number_of_episodes: null,
    status: "published",
    featured: false,
    audio_type: ["legendado"],
    created_by: userId,
  }));

  let imported = 0;
  const errors: string[] = [];
  const BATCH_SIZE = 100;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await adminClient.from("content").upsert(batch, {
      onConflict: "tmdb_id,content_type",
    });
    if (error) {
      errors.push(error.message);
    } else {
      imported += batch.length;
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      imported,
      total: allItems.length,
      next_page: allItems.length > 0 ? endPage + 1 : null,
      has_more: allItems.length > 0,
      pages_processed: endPage - startPage + 1,
      errors: errors.slice(0, 5),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await adminClient
      .from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "admin");
    if (!roles?.length) throw new Error("Not admin");

    const body = await req.json();
    const action: string = body.action || "import";
    const contentType: string = body.content_type || "movie";
    const startPage: number = body.start_page || 1;
    const enrichWithTmdb: boolean = body.enrich !== false;
    const isDorama = contentType === "dorama";
    const catalogType: "movie" | "tv" = contentType === "movie" ? "movie" : "tv";

    // ── Dorama imports use TMDB Discover API (Korean/Japanese dramas) ──
    if (isDorama) {
      return await handleDoramaImport(action, startPage, enrichWithTmdb, user.id, adminClient);
    }

    if (action === "count") {
      const totalAvailable = await getTotalPages(catalogType);
      return new Response(
        JSON.stringify({ success: true, total_pages: totalAvailable, estimated_items: totalAvailable * 30 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "sync-check") {
      const totalPages = await getTotalPages(catalogType);
      const samplePages = [1, Math.ceil(totalPages / 2), totalPages];
      const sampleItems: string[] = [];
      for (const p of samplePages) {
        const items = await fetchCatalogPage(catalogType, p);
        items.forEach(i => sampleItems.push(i.tmdb_id));
      }

      const { count: dbCount } = await adminClient
        .from("content")
        .select("*", { count: "exact", head: true })
        .eq("content_type", contentType);

      const estimatedTotal = totalPages * 30;

      return new Response(
        JSON.stringify({
          success: true,
          total_pages: totalPages,
          estimated_total: estimatedTotal,
          in_database: dbCount || 0,
          estimated_missing: Math.max(0, estimatedTotal - (dbCount || 0)),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const endPage = startPage + MAX_PAGES_PER_CALL - 1;
    console.log(`[import] Catalog ${catalogType} pages ${startPage}-${endPage}`);

    const pagePromises = [];
    for (let p = startPage; p <= endPage; p++) {
      pagePromises.push(fetchCatalogPage(catalogType, p).then(items => ({ page: p, items })));
    }
    const pageResults = await Promise.all(pagePromises);

    const allItems: CatalogItem[] = [];
    const seenIds = new Set<string>();
    let lastPageWithData = startPage - 1;

    pageResults.sort((a, b) => a.page - b.page);
    for (const { page: pg, items } of pageResults) {
      if (items.length === 0) break;
      lastPageWithData = pg;
      for (const item of items) {
        if (!seenIds.has(item.tmdb_id)) {
          seenIds.add(item.tmdb_id);
          allItems.push(item);
        }
      }
    }

    console.log(`[import] Fetched ${allItems.length} items from pages ${startPage}-${lastPageWithData}`);

    let tmdbResults = new Map<number, any>();
    if (enrichWithTmdb && allItems.length > 0) {
      const tmdbRequests = allItems.map(item => ({
        tmdbId: parseInt(item.tmdb_id),
        type: catalogType,
      }));
      tmdbResults = await fetchTMDBBatch(tmdbRequests, 8);
    }

    const rows = allItems.map(item => {
      const tmdbId = parseInt(item.tmdb_id);
      const detail = tmdbResults.get(tmdbId);

      if (detail) {
        return {
          tmdb_id: tmdbId,
          imdb_id: detail.imdb_id || detail.external_ids?.imdb_id || null,
          content_type: contentType,
          title: detail.title || detail.name || item.title || item.name,
          original_title: detail.original_title || detail.original_name || null,
          overview: detail.overview || "",
          poster_path: detail.poster_path || item.poster_path || null,
          backdrop_path: detail.backdrop_path || null,
          release_date: sanitizeDate(detail.release_date || detail.first_air_date || item.release_date),
          vote_average: detail.vote_average || 0,
          runtime: detail.runtime || (parseInt(item.runtime) || null),
          number_of_seasons: detail.number_of_seasons || null,
          number_of_episodes: detail.number_of_episodes || null,
          status: "published",
          featured: false,
          audio_type: ["legendado"],
          created_by: user.id,
        };
      }
      return {
        tmdb_id: tmdbId,
        content_type: contentType,
        title: item.title || item.name || "Sem título",
        poster_path: item.poster_path || null,
        release_date: sanitizeDate(item.release_date),
        runtime: parseInt(item.runtime) || null,
        vote_average: parseFloat(item.vote_average) || 0,
        status: "published",
        featured: false,
        audio_type: ["legendado"],
        created_by: user.id,
      };
    });

    let imported = 0;
    const errors: string[] = [];
    const BATCH_SIZE = 100;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await adminClient.from("content").upsert(batch, {
        onConflict: "tmdb_id,content_type",
      });
      if (error) {
        errors.push(error.message);
        console.log(`[import] Upsert batch error: ${error.message}`);
      } else {
        imported += batch.length;
      }
    }

    const hasMore = lastPageWithData >= endPage && allItems.length > 0;
    const nextPage = hasMore ? endPage + 1 : null;

    return new Response(
      JSON.stringify({
        success: true,
        imported,
        total: allItems.length,
        next_page: nextPage,
        has_more: hasMore,
        pages_processed: lastPageWithData - startPage + 1,
        errors: errors.slice(0, 5),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Import error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
