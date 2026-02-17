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

// ── Fetch CineVeo catalog page via JSON API ──────────────────────────
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
  console.log(`[cineveo] Fetching page ${page}: ${url}`);

  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json, text/html, */*" },
  });
  if (!res.ok) {
    console.log(`[cineveo] Page ${page} returned ${res.status}`);
    return [];
  }

  const text = await res.text();
  try {
    const data = JSON.parse(text);
    if (data.success && Array.isArray(data.results)) {
      return data.results;
    }
  } catch {
    console.log(`[cineveo] Failed to parse JSON for page ${page}`);
  }
  return [];
}

// ── Get total pages from CineVeo HTML (first page only) ──────────────
async function getTotalPages(type: "movie" | "tv"): Promise<number> {
  const url = `https://cineveo.site/category.php?type=${type}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,*/*" },
  });
  if (!res.ok) return 1;
  const html = await res.text();

  const pageMatches = [
    ...html.matchAll(/class="pagination-btn[^"]*">(\d+)<\/button>/g),
  ];
  let maxPage = 1;
  for (const m of pageMatches) {
    const p = parseInt(m[1]);
    if (p > maxPage) maxPage = p;
  }
  return maxPage;
}

// ── Fetch TMDB details for enrichment ────────────────────────────────
async function fetchTMDBDetails(
  tmdbId: number,
  type: "movie" | "tv",
): Promise<any | null> {
  try {
    const url = `${TMDB_BASE}/${type}/${tmdbId}?language=pt-BR&append_to_response=external_ids`;
    const res = await fetch(url, { headers: tmdbHeaders });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify admin role
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin");
    if (!roles?.length) throw new Error("Not admin");

    const body = await req.json();
    const action: string = body.action || "import";
    const contentType: string = body.content_type || "movie";
    const maxPages: number = body.max_pages || 10;
    const startPage: number = body.start_page || 1;
    const enrichWithTmdb: boolean = body.enrich !== false;

    // Map content_type to cineveo type
    const cineveoType: "movie" | "tv" =
      contentType === "movie" ? "movie" : "tv";

    // Action: just get total pages count
    if (action === "count") {
      const totalAvailable = await getTotalPages(cineveoType);
      return new Response(
        JSON.stringify({ success: true, total_pages: totalAvailable, estimated_items: totalAvailable * 30 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get total pages
    const totalAvailable = await getTotalPages(cineveoType);
    const endPage = Math.min(startPage + maxPages - 1, totalAvailable);
    console.log(
      `[import] CineVeo ${cineveoType} pages ${startPage}-${endPage} (total: ${totalAvailable})`,
    );

    // Fetch all pages via JSON API
    const allItems: CineveoItem[] = [];
    const seenIds = new Set<string>();

    for (let p = startPage; p <= endPage; p++) {
      const items = await fetchCineveoPage(cineveoType, p);
      for (const item of items) {
        if (!seenIds.has(item.tmdb_id)) {
          seenIds.add(item.tmdb_id);
          allItems.push(item);
        }
      }
      // Small delay to avoid hammering
      if (p < endPage) await new Promise((r) => setTimeout(r, 100));
    }

    console.log(`[import] Total unique items: ${allItems.length}`);

    let imported = 0;
    const errors: string[] = [];

    // Process in batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
      const batch = allItems.slice(i, i + BATCH_SIZE);

      const rows = [];
      for (const item of batch) {
        const tmdbId = parseInt(item.tmdb_id);

        // Optionally enrich with full TMDB data
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
            original_title:
              detail.original_title || detail.original_name || null,
            overview: detail.overview || "",
            poster_path: detail.poster_path || item.poster_path || null,
            backdrop_path: detail.backdrop_path || null,
            release_date:
              detail.release_date || detail.first_air_date || item.release_date || null,
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
          // Use CineVeo data directly
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
        errors.push(`Batch ${i}: ${error.message}`);
        console.log(`[import] Batch error: ${error.message}`);
      } else {
        imported += rows.length;
      }

      // Rate limit TMDB
      if (enrichWithTmdb && i + BATCH_SIZE < allItems.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        imported,
        total: allItems.length,
        pages_scraped: endPage - startPage + 1,
        total_pages: totalAvailable,
        errors: errors.slice(0, 10),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Import error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
