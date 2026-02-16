import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI1MDFiOWNkYjllNDQ0NjkxMDJiODk5YjQ0YjU2MWQ5ZCIsIm5iZiI6MTc3MTIzMDg1My43NjYsInN1YiI6IjY5OTJkNjg1NzZjODAxNTdmMjFhZjMxMSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.c47JvphccOz_oyaUuQWCHQ1mXAsSH01OB14vKE2uenw";
const TMDB_BASE = "https://api.themoviedb.org/3";
const tmdbHeaders = { Authorization: `Bearer ${TMDB_TOKEN}`, "Content-Type": "application/json" };

async function fetchTMDB(endpoint: string, params: Record<string, string> = {}) {
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set("language", "pt-BR");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: tmdbHeaders });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

async function fetchAllPagesWithParams(endpoint: string, params: Record<string, string> = {}, maxPages = 20) {
  const results: any[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await fetchTMDB(endpoint, { ...params, page: String(page) });
    if (!data.results?.length) break;
    results.push(...data.results);
    if (page >= data.total_pages) break;
  }
  return results;
}

async function getDetails(id: number, type: "movie" | "tv") {
  return fetchTMDB(`/${type}/${id}`, { append_to_response: "external_ids" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Verify admin role
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await adminClient.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin");
    if (!roles?.length) throw new Error("Not admin");

    const body = await req.json();
    const contentType = body.content_type || "movie";
    const maxPages = body.max_pages || 20;

    // Build endpoint list with params for maximum coverage
    type EP = { path: string; params?: Record<string, string> };
    let endpoints: EP[] = [];
    
    if (contentType === "movie") {
      endpoints = [
        { path: "/movie/popular" },
        { path: "/movie/top_rated" },
        { path: "/movie/now_playing" },
        { path: "/trending/movie/week" },
        { path: "/discover/movie", params: { sort_by: "popularity.desc" } },
        { path: "/discover/movie", params: { sort_by: "vote_count.desc" } },
        { path: "/discover/movie", params: { sort_by: "revenue.desc" } },
        { path: "/discover/movie", params: { "primary_release_date.gte": "2020-01-01", sort_by: "popularity.desc" } },
        { path: "/discover/movie", params: { "primary_release_date.gte": "2010-01-01", "primary_release_date.lte": "2019-12-31", sort_by: "popularity.desc" } },
        { path: "/discover/movie", params: { "primary_release_date.gte": "2000-01-01", "primary_release_date.lte": "2009-12-31", sort_by: "popularity.desc" } },
        { path: "/discover/movie", params: { "primary_release_date.lte": "1999-12-31", sort_by: "vote_count.desc" } },
      ];
    } else if (contentType === "series") {
      endpoints = [
        { path: "/tv/popular" },
        { path: "/tv/top_rated" },
        { path: "/tv/airing_today" },
        { path: "/trending/tv/week" },
        { path: "/discover/tv", params: { sort_by: "popularity.desc" } },
        { path: "/discover/tv", params: { sort_by: "vote_count.desc" } },
      ];
    } else if (contentType === "dorama") {
      endpoints = [
        { path: "/discover/tv", params: { with_origin_country: "KR|JP", sort_by: "popularity.desc" } },
      ];
    } else if (contentType === "anime") {
      endpoints = [
        { path: "/discover/tv", params: { with_genres: "16", with_origin_country: "JP", sort_by: "popularity.desc" } },
      ];
    }

    let allItems: any[] = [];
    const seenIds = new Set<number>();

    for (const ep of endpoints) {
      const items = await fetchAllPagesWithParams(ep.path, ep.params || {}, maxPages);
      for (const item of items) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          allItems.push(item);
        }
      }
    }

    console.log(`Found ${allItems.length} unique items for ${contentType}`);

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Batch insert without fetching individual details (avoids timeout)
    const BATCH_SIZE = 50;
    for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
      const batch = allItems.slice(i, i + BATCH_SIZE);
      const rows = batch.map(item => ({
        tmdb_id: item.id,
        imdb_id: null,
        content_type: contentType,
        title: item.title || item.name || "Sem título",
        original_title: item.original_title || item.original_name || null,
        overview: item.overview || "",
        poster_path: item.poster_path,
        backdrop_path: item.backdrop_path,
        release_date: item.release_date || item.first_air_date || null,
        vote_average: item.vote_average || 0,
        runtime: null,
        number_of_seasons: null,
        number_of_episodes: null,
        status: "published",
        featured: false,
        audio_type: ["legendado"],
        created_by: user.id,
      }));

      const { error, count } = await adminClient.from("content").upsert(rows, {
        onConflict: "tmdb_id,content_type",
        ignoreDuplicates: true,
      });

      if (error) {
        errors.push(`Batch ${i}: ${error.message}`);
      } else {
        imported += batch.length;
      }
    }

    return new Response(
      JSON.stringify({ success: true, imported, skipped, total: allItems.length, errors: errors.slice(0, 10) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Import error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
