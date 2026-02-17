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

async function fetchCineveoPage(
  type: "movie" | "tv",
  page: number,
): Promise<CineveoItem[]> {
  const url = `https://cineveo.site/category.php?fetch_mode=1&type=${type}&page=${page}&genre=`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json, */*" },
    });
    if (!res.ok) return [];
    const text = await res.text();
    const data = JSON.parse(text);
    if (data.success && Array.isArray(data.results)) return data.results;
  } catch { /* skip */ }
  return [];
}

async function getTotalPages(type: "movie" | "tv"): Promise<number> {
  async function pageHasResults(page: number): Promise<boolean> {
    const url = `https://cineveo.site/category.php?fetch_mode=1&type=${type}&page=${page}&genre=`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json, */*" },
      });
      if (!res.ok) return false;
      const text = await res.text();
      const data = JSON.parse(text);
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
  console.log(`[cineveo] Total pages for ${type}: ${low}`);
  return low;
}

async function fetchTMDBDetails(tmdbId: number, type: "movie" | "tv"): Promise<any | null> {
  try {
    const url = `${TMDB_BASE}/${type}/${tmdbId}?language=pt-BR&append_to_response=external_ids`;
    const res = await fetch(url, { headers: tmdbHeaders });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Max pages per single call to avoid timeout
const MAX_PAGES_PER_CALL = 5;

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

    // ── BATCH IMPORT action ── (processes only MAX_PAGES_PER_CALL pages)
    const endPage = startPage + MAX_PAGES_PER_CALL - 1;
    console.log(`[import] CineVeo ${cineveoType} pages ${startPage}-${endPage}`);

    const allItems: CineveoItem[] = [];
    const seenIds = new Set<string>();
    let lastPageWithData = startPage - 1;

    for (let p = startPage; p <= endPage; p++) {
      const items = await fetchCineveoPage(cineveoType, p);
      if (items.length === 0) break;
      lastPageWithData = p;
      for (const item of items) {
        if (!seenIds.has(item.tmdb_id)) {
          seenIds.add(item.tmdb_id);
          allItems.push(item);
        }
      }
    }

    console.log(`[import] Fetched ${allItems.length} items from pages ${startPage}-${lastPageWithData}`);

    let imported = 0;
    const errors: string[] = [];
    const BATCH_SIZE = 50;

    for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
      const batch = allItems.slice(i, i + BATCH_SIZE);
      const rows = [];

      for (const item of batch) {
        const tmdbId = parseInt(item.tmdb_id);
        let detail: any = null;
        if (enrichWithTmdb) {
          detail = await fetchTMDBDetails(tmdbId, cineveoType);
        }

        if (detail) {
          rows.push({
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
          });
        } else {
          rows.push({
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
          });
        }
      }

      const { error } = await adminClient.from("content").upsert(rows, {
        onConflict: "tmdb_id,content_type",
        ignoreDuplicates: true,
      });

      if (error) {
        errors.push(error.message);
        console.log(`[import] Batch error: ${error.message}`);
      } else {
        imported += rows.length;
      }
    }

    // Determine if there are more pages
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
