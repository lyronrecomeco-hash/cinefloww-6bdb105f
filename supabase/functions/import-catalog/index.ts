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

interface CineveoItem {
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

async function fetchCineveoPage(type: "movie" | "tv", page: number): Promise<CineveoItem[]> {
  const url = `https://cineveo.site/category.php?fetch_mode=1&type=${type}&page=${page}&genre=`;
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
    const url = `https://cineveo.site/category.php?fetch_mode=1&type=${type}&page=${page}&genre=`;
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

// Parallel TMDB fetch with concurrency limit
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

// Max pages per single call
const MAX_PAGES_PER_CALL = 10;

Deno.serve(async (req) => {
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
    const cineveoType: "movie" | "tv" = contentType === "movie" ? "movie" : "tv";

    // ── COUNT action ──
    if (action === "count") {
      const totalAvailable = await getTotalPages(cineveoType);
      return new Response(
        JSON.stringify({ success: true, total_pages: totalAvailable, estimated_items: totalAvailable * 30 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── SYNC-CHECK action: compare CineVeo first page sample with DB ──
    if (action === "sync-check") {
      const totalPages = await getTotalPages(cineveoType);
      // Sample pages 1, middle, last to estimate total unique items
      const samplePages = [1, Math.ceil(totalPages / 2), totalPages];
      const sampleItems: string[] = [];
      for (const p of samplePages) {
        const items = await fetchCineveoPage(cineveoType, p);
        items.forEach(i => sampleItems.push(i.tmdb_id));
      }

      // Count existing in DB
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

    // ── BATCH IMPORT action ── (processes MAX_PAGES_PER_CALL pages)
    const endPage = startPage + MAX_PAGES_PER_CALL - 1;
    console.log(`[import] CineVeo ${cineveoType} pages ${startPage}-${endPage}`);

    // Fetch all pages in parallel
    const pagePromises = [];
    for (let p = startPage; p <= endPage; p++) {
      pagePromises.push(fetchCineveoPage(cineveoType, p).then(items => ({ page: p, items })));
    }
    const pageResults = await Promise.all(pagePromises);

    const allItems: CineveoItem[] = [];
    const seenIds = new Set<string>();
    let lastPageWithData = startPage - 1;

    // Sort by page number to maintain order
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

    // Enrich with TMDB in parallel
    let tmdbResults = new Map<number, any>();
    if (enrichWithTmdb && allItems.length > 0) {
      const tmdbRequests = allItems.map(item => ({
        tmdbId: parseInt(item.tmdb_id),
        type: cineveoType,
      }));
      tmdbResults = await fetchTMDBBatch(tmdbRequests, 8);
    }

    // Build rows
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
          release_date: detail.release_date || detail.first_air_date || item.release_date || null,
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
        release_date: item.release_date || null,
        runtime: parseInt(item.runtime) || null,
        vote_average: parseFloat(item.vote_average) || 0,
        status: "published",
        featured: false,
        audio_type: ["legendado"],
        created_by: user.id,
      };
    });

    // Upsert in batches of 100 for reliability
    let imported = 0;
    const errors: string[] = [];
    const BATCH_SIZE = 100;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { data: upserted, error } = await adminClient.from("content").upsert(batch, {
        onConflict: "tmdb_id,content_type",
      }).select("id");
      if (error) {
        errors.push(error.message);
        console.log(`[import] Upsert batch error: ${error.message}`);
      } else {
        imported += upserted?.length || 0;
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
