import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CINEVEO_API = "https://cinetvembed.cineveo.site/api/catalog.php";
const CINEVEO_USER = "lyneflix-vods";
const CINEVEO_PASS = "uVljs2d";
const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI1MDFiOWNkYjllNDQ0NjkxMDJiODk5YjQ0YjU2MWQ5ZCIsIm5iZiI6MTc3MTIzMDg1My43NjYsInN1YiI6IjY5OTJkNjg1NzZjODAxNTdmMjFhZjMxMSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.c47JvphccOz_oyaUuQWCHQ1mXAsSH01OB14vKE2uenw";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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
    const types = body.types || ["movies", "series"];

    // Save progress
    const saveProgress = async (phase: string, data: Record<string, unknown> = {}) => {
      await supabase.from("site_settings").upsert({
        key: "cineveo_import_progress",
        value: { phase, updated_at: new Date().toISOString(), ...data },
      }, { onConflict: "key" });
    };

    await saveProgress("fetching_catalog", { types });

    let allItems: any[] = [];

    // Fetch both movie and series catalogs
    for (const apiType of types) {
      const url = `${CINEVEO_API}?username=${CINEVEO_USER}&password=${CINEVEO_PASS}&type=${apiType}`;
      console.log(`[cineveo-import] Fetching ${apiType}...`);

      try {
        const res = await fetch(url, {
          headers: { "User-Agent": UA, Accept: "application/json" },
          signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) {
          console.log(`[cineveo-import] ${apiType} returned ${res.status}`);
          continue;
        }

        const data = await res.json();
        const items = Array.isArray(data) ? data : data?.results || data?.data || data?.items || [];
        console.log(`[cineveo-import] ${apiType}: ${items.length} items`);

        for (const item of items) {
          const tmdbId = item.tmdb_id || item.tmdbId || item.id;
          if (!tmdbId) continue;

          allItems.push({
            tmdb_id: Number(tmdbId),
            content_type: apiType === "movies" ? "movie" : "series",
            stream_url: item.stream_url || item.streamUrl || item.url || item.video_url || item.link || item.embed_url || null,
            title: item.title || item.name || `TMDB ${tmdbId}`,
            poster_path: item.poster_path || item.poster || null,
            backdrop_path: item.backdrop_path || item.backdrop || null,
            overview: item.overview || item.description || "",
            vote_average: item.vote_average || item.rating || 0,
            release_date: item.release_date || item.first_air_date || item.year || null,
            imdb_id: item.imdb_id || null,
            episodes: item.episodes || item.seasons || null,
          });
        }
      } catch (err) {
        console.error(`[cineveo-import] Error fetching ${apiType}:`, err);
      }
    }

    console.log(`[cineveo-import] Total items: ${allItems.length}`);
    await saveProgress("processing", { total: allItems.length, imported_content: 0, imported_cache: 0 });

    if (allItems.length === 0) {
      await saveProgress("done", { total: 0, imported_content: 0, imported_cache: 0, done: true });
      return new Response(JSON.stringify({ message: "No items found in CineVeo API", total: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get existing content tmdb_ids
    const existingIds = new Set<number>();
    let offset = 0;
    while (true) {
      const { data } = await supabase.from("content").select("tmdb_id").range(offset, offset + 999);
      if (!data || data.length === 0) break;
      data.forEach((r: any) => existingIds.add(r.tmdb_id));
      offset += 1000;
      if (data.length < 1000) break;
    }

    // Items needing TMDB enrichment (not in content table yet)
    const newItems = allItems.filter(i => !existingIds.has(i.tmdb_id));
    console.log(`[cineveo-import] ${newItems.length} new items to enrich with TMDB`);

    // Enrich new items with TMDB data (5 concurrent workers)
    const tmdbDetails = new Map<number, any>();
    const queue = [...newItems];
    const CONC = 5;

    async function enrichWorker() {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        const type = item.content_type === "movie" ? "movie" : "tv";
        try {
          const r = await fetch(`https://api.themoviedb.org/3/${type}/${item.tmdb_id}?language=pt-BR&append_to_response=external_ids`, {
            headers: { Authorization: `Bearer ${TMDB_TOKEN}`, "Content-Type": "application/json" },
            signal: AbortSignal.timeout(8000),
          });
          if (r.ok) tmdbDetails.set(item.tmdb_id, await r.json());
        } catch { /* skip */ }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONC, newItems.length) }, () => enrichWorker()));
    console.log(`[cineveo-import] Enriched ${tmdbDetails.size} items from TMDB`);

    // Insert new content rows
    let importedContent = 0;
    const contentRows = newItems.map(item => {
      const tmdb = tmdbDetails.get(item.tmdb_id);
      return {
        tmdb_id: item.tmdb_id,
        content_type: item.content_type,
        title: tmdb?.title || tmdb?.name || item.title,
        original_title: tmdb?.original_title || tmdb?.original_name || null,
        overview: tmdb?.overview || item.overview || "",
        poster_path: tmdb?.poster_path || item.poster_path,
        backdrop_path: tmdb?.backdrop_path || item.backdrop_path,
        release_date: tmdb?.release_date || tmdb?.first_air_date || item.release_date || null,
        vote_average: tmdb?.vote_average || item.vote_average || 0,
        imdb_id: tmdb?.imdb_id || tmdb?.external_ids?.imdb_id || item.imdb_id || null,
        runtime: tmdb?.runtime || null,
        number_of_seasons: tmdb?.number_of_seasons || null,
        number_of_episodes: tmdb?.number_of_episodes || null,
        status: "published",
        featured: false,
        audio_type: ["dublado"],
      };
    });

    for (let i = 0; i < contentRows.length; i += 200) {
      const batch = contentRows.slice(i, i + 200);
      const { error } = await supabase.from("content").upsert(batch, { onConflict: "tmdb_id,content_type" });
      if (error) console.error(`[cineveo-import] Content upsert error:`, error.message);
      else importedContent += batch.length;

      if (importedContent % 500 === 0) {
        await saveProgress("importing_content", { total: allItems.length, imported_content: importedContent, imported_cache: 0 });
      }
    }

    console.log(`[cineveo-import] Imported ${importedContent} content rows`);

    // Import video cache for items with stream_url
    let importedCache = 0;
    const cacheRows = allItems
      .filter(i => i.stream_url)
      .map(i => ({
        tmdb_id: i.tmdb_id,
        content_type: i.content_type,
        audio_type: "dublado",
        video_url: i.stream_url,
        video_type: i.stream_url.includes(".m3u8") ? "m3u8" : "mp4",
        provider: "cineveo-api",
        season: 0,
        episode: 0,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }));

    for (let i = 0; i < cacheRows.length; i += 200) {
      const batch = cacheRows.slice(i, i + 200);
      const { error } = await supabase.from("video_cache").upsert(batch, { onConflict: "tmdb_id,content_type,audio_type,season,episode" });
      if (error) console.error(`[cineveo-import] Cache upsert error:`, error.message);
      else importedCache += batch.length;
    }

    console.log(`[cineveo-import] Imported ${importedCache} video cache rows`);

    await saveProgress("done", {
      total: allItems.length,
      imported_content: importedContent,
      imported_cache: importedCache,
      done: true,
    });

    return new Response(JSON.stringify({
      total: allItems.length,
      imported_content: importedContent,
      imported_cache: importedCache,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[cineveo-import] Error:", error);
    await supabase.from("site_settings").upsert({
      key: "cineveo_import_progress",
      value: { phase: "error", error: error instanceof Error ? error.message : String(error), done: true },
    }, { onConflict: "key" });

    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Import failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
