import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 100;
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_HEADERS = {
  accept: "application/json",
  Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI3MmIxZGUyMTkxZjgxOTA4NjkzOTFjZjVhNjczOGNjNCIsIm5iZiI6MTc0NTEwMTI5My42Miwic3ViIjoiNjgwNGIxOGQ5ZTcwNGI3NjFjYTViZjAzIiwic2NvcGVzIjpbImFwaV9yZWFkIl0sInZlcnNpb24iOjF9.IXilnCedG0kJi-pSFWqWlFjJkOQIPTcGrOPNJBk-3g8",
};

interface VisioncineItem {
  "{titulo}": string;
  "{capa}": string;
  "{background}": string;
  "{sinopse}": string;
  "{ano}": string;
  "{links}": { url: string; quality: string }[];
  "{link}"?: string;
}

function sanitizeDate(d: string | null | undefined): string | null {
  if (!d || d === "0000-00-00" || d.length < 4) return null;
  if (/^\d{4}$/.test(d)) return `${d}-01-01`;
  return d;
}

async function searchTMDB(title: string, year: string): Promise<{ tmdb_id: number; imdb_id: string | null; content_type: string; details: any } | null> {
  try {
    const q = encodeURIComponent(title);
    const yearParam = year && year.length === 4 ? `&year=${year}` : "";
    const res = await fetch(`${TMDB_BASE}/search/movie?query=${q}${yearParam}&language=pt-BR`, { headers: TMDB_HEADERS });
    const data = await res.json();
    
    if (data.results?.length > 0) {
      const movie = data.results[0];
      return {
        tmdb_id: movie.id,
        imdb_id: null,
        content_type: "movie",
        details: movie,
      };
    }
    
    // Try without year
    if (yearParam) {
      const res2 = await fetch(`${TMDB_BASE}/search/movie?query=${q}&language=pt-BR`, { headers: TMDB_HEADERS });
      const data2 = await res2.json();
      if (data2.results?.length > 0) {
        return {
          tmdb_id: data2.results[0].id,
          imdb_id: null,
          content_type: "movie",
          details: data2.results[0],
        };
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { items, offset = 0, batch_size = BATCH_SIZE, auto = false } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "No items provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const slice = items.slice(offset, offset + batch_size);
    if (slice.length === 0) {
      return new Response(JSON.stringify({ done: true, processed: 0, indexed: 0, skipped: 0, offset }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0, indexed = 0, skipped = 0, contentUpserted = 0;

    // Process concurrently in groups of 8
    const CONCURRENCY = 8;
    for (let i = 0; i < slice.length; i += CONCURRENCY) {
      const batch = slice.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map(async (item: VisioncineItem) => {
        const titulo = item["{titulo}"];
        const ano = item["{ano}"];
        const links = item["{links}"] || [];
        const sinopse = item["{sinopse}"];
        const capa = item["{capa}"];
        const background = item["{background}"];

        // Get first valid video URL
        const validLink = links.find(l => 
          l.url && (l.url.startsWith("http://") || l.url.startsWith("https://")) && 
          (l.url.includes(".mp4") || l.url.includes(".m3u8"))
        );

        if (!validLink || !titulo) {
          skipped++;
          return;
        }

        // Search TMDB for this title
        const tmdbResult = await searchTMDB(titulo, ano);
        if (!tmdbResult) {
          skipped++;
          return;
        }

        const { tmdb_id, content_type, details } = tmdbResult;

        // Upsert into content table
        const contentRow = {
          tmdb_id,
          content_type,
          title: details.title || titulo,
          original_title: details.original_title || null,
          overview: details.overview || sinopse || null,
          poster_path: details.poster_path || (capa ? capa.replace("https://image.tmdb.org/t/p/w500", "") : null),
          backdrop_path: details.backdrop_path || (background ? background.replace("https://image.tmdb.org/t/p/original", "") : null),
          release_date: sanitizeDate(details.release_date || (ano ? `${ano}-01-01` : null)),
          vote_average: details.vote_average || null,
          status: "published",
          audio_type: validLink.url.toLowerCase().includes("dual") ? ["dublado", "legendado"] : ["dublado"],
        };

        const { error: contentErr } = await supabase
          .from("content")
          .upsert(contentRow, { onConflict: "tmdb_id,content_type" });

        if (!contentErr) contentUpserted++;

        // Determine audio type from filename
        const urlLower = validLink.url.toLowerCase();
        let audioType = "dublado";
        if (urlLower.includes("legendado") || urlLower.includes("leg")) audioType = "legendado";
        if (urlLower.includes("dual")) audioType = "dublado";

        // Upsert into video_cache
        const { error: cacheErr } = await supabase
          .from("video_cache")
          .upsert({
            tmdb_id,
            content_type,
            video_url: validLink.url,
            video_type: validLink.url.includes(".m3u8") ? "m3u8" : "mp4",
            provider: "visioncine",
            audio_type: audioType,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
          }, { onConflict: "tmdb_id,content_type,audio_type,season,episode" });

        if (!cacheErr) {
          indexed++;
        }

        // Log
        await supabase.from("resolve_logs").insert({
          tmdb_id,
          content_type,
          title: details.title || titulo,
          success: !cacheErr,
          provider: "visioncine",
          video_url: validLink.url,
          video_type: validLink.url.includes(".m3u8") ? "m3u8" : "mp4",
          error_message: cacheErr?.message || null,
        });

        processed++;
      }));
    }

    const nextOffset = offset + batch_size;
    const hasMore = nextOffset < items.length;

    // Self-chain if more to process
    if (hasMore && auto) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      fetch(`${supabaseUrl}/functions/v1/import-visioncine`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ items, offset: nextOffset, batch_size, auto: true }),
      }).catch(() => {});
    }

    // Save progress to site_settings
    await supabase.from("site_settings").upsert({
      key: "visioncine_import_progress",
      value: {
        offset: nextOffset,
        total: items.length,
        processed,
        indexed,
        skipped,
        content_upserted: contentUpserted,
        done: !hasMore,
        updated_at: new Date().toISOString(),
      },
    }, { onConflict: "key" });

    return new Response(JSON.stringify({
      done: !hasMore,
      processed,
      indexed,
      skipped,
      content_upserted: contentUpserted,
      offset,
      next_offset: hasMore ? nextOffset : null,
      total: items.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[import-visioncine] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
