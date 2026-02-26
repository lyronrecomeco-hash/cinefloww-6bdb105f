import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IPTV_URL = "https://cineveo.site/api/generate_iptv_list.php?user=lyneflix-vods";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface ParsedItem {
  tmdb_id: number;
  content_type: "movie" | "series";
  title: string;
  stream_url: string;
  season: number;
  episode: number;
  poster: string | null;
}

function parseLine(extinf: string, url: string): ParsedItem | null {
  const idMatch = extinf.match(/tvg-id="(movie|serie|tv|series)[:\s]*(\d+)"/i);
  if (!idMatch) return null;
  const tmdbId = Number(idMatch[2]);
  if (!tmdbId) return null;

  const rawType = idMatch[1].toLowerCase();
  const contentType = rawType === "movie" ? "movie" as const : "series" as const;

  const logoMatch = extinf.match(/tvg-logo="([^"]*)"/);
  const poster = logoMatch?.[1] || null;

  const titleMatch = extinf.match(/,(.+)$/);
  const title = titleMatch?.[1]?.trim() || `TMDB ${tmdbId}`;

  let season = 0, episode = 0;
  if (contentType === "series") {
    // URL pattern: /.../tmdbid/season/episode.mp4
    const seMatch = url.match(/\/(\d+)\/(\d+)\.mp4$/);
    if (seMatch) { season = Number(seMatch[1]); episode = Number(seMatch[2]); }
  }

  return { tmdb_id: tmdbId, content_type: contentType, title, stream_url: url, season, episode, poster };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const offset = Number(body.offset || 0);
    const limit = Number(body.limit || 50000); // Process in chunks

    console.log(`[iptv] Fetching list (offset=${offset}, limit=${limit})...`);
    const res = await fetch(IPTV_URL, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(90000) });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const text = await res.text();

    // Parse all lines
    const lines = text.split("\n");
    const allItems: ParsedItem[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith("#EXTINF:")) continue;
      const urlLine = (lines[i + 1] || "").trim();
      if (!urlLine || urlLine.startsWith("#")) continue;
      const item = parseLine(line, urlLine);
      if (item) allItems.push(item);
    }

    console.log(`[iptv] Total parsed: ${allItems.length}`);

    // Slice the chunk to process
    const chunk = allItems.slice(offset, offset + limit);
    if (chunk.length === 0) {
      return new Response(JSON.stringify({ done: true, total_parsed: allItems.length, offset }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduplicate content
    const contentMap = new Map<string, any>();
    const cacheRows: any[] = [];

    for (const item of chunk) {
      const key = `${item.tmdb_id}-${item.content_type}`;
      if (!contentMap.has(key)) {
        contentMap.set(key, {
          tmdb_id: item.tmdb_id,
          content_type: item.content_type,
          title: item.title.replace(/\s*\(\d{4}\)\s*$/, "").trim() || item.title,
          poster_path: item.poster,
          overview: "",
          vote_average: 0,
          status: "published",
          featured: false,
          audio_type: ["dublado"],
        });
      }

      if (item.stream_url) {
        cacheRows.push({
          tmdb_id: item.tmdb_id,
          content_type: item.content_type,
          audio_type: "dublado",
          video_url: item.stream_url,
          video_type: item.stream_url.includes(".m3u8") ? "m3u8" : "mp4",
          provider: "cineveo-iptv",
          season: item.season,
          episode: item.episode,
          expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }

    const contentRows = Array.from(contentMap.values());
    let contentOk = 0, cacheOk = 0;

    // Upsert content (ignoreDuplicates = don't overwrite existing)
    for (let i = 0; i < contentRows.length; i += 500) {
      const batch = contentRows.slice(i, i + 500);
      const { error } = await supabase.from("content").upsert(batch, { onConflict: "tmdb_id,content_type", ignoreDuplicates: true });
      if (!error) contentOk += batch.length;
      else console.error("[iptv] content err:", error.message);
    }

    // Upsert cache (ignoreDuplicates = don't overwrite higher-priority providers like cineveo-api)
    for (let i = 0; i < cacheRows.length; i += 500) {
      const batch = cacheRows.slice(i, i + 500);
      const { error } = await supabase.from("video_cache").upsert(batch, { onConflict: "tmdb_id,content_type,audio_type,season,episode", ignoreDuplicates: true });
      if (!error) cacheOk += batch.length;
      else console.error("[iptv] cache err:", error.message);
    }

    const hasMore = offset + limit < allItems.length;
    const result = {
      done: !hasMore,
      total_parsed: allItems.length,
      chunk_processed: chunk.length,
      unique_content: contentRows.length,
      cache_entries: cacheRows.length,
      content_ok: contentOk,
      cache_ok: cacheOk,
      next_offset: hasMore ? offset + limit : null,
    };

    // Auto-chain if more to process
    if (hasMore) {
      const selfUrl = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/import-iptv`;
      fetch(selfUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}` },
        body: JSON.stringify({ offset: offset + limit, limit }),
      }).catch(() => {});
    }

    console.log("[iptv] Result:", JSON.stringify(result));
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[iptv] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Import failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
