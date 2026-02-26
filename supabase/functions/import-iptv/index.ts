import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IPTV_URL = "https://cineveo.site/api/generate_iptv_list.php?user=lyneflix-vods";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface ParsedItem {
  title: string;
  tmdb_id: number;
  content_type: "movie" | "series";
  stream_url: string;
  season: number;
  episode: number;
  group: string;
  poster: string | null;
}

function parseM3U(text: string): ParsedItem[] {
  const lines = text.split("\n");
  const items: ParsedItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("#EXTINF:")) continue;

    const urlLine = (lines[i + 1] || "").trim();
    if (!urlLine || urlLine.startsWith("#")) continue;

    // Extract group-title
    const groupMatch = line.match(/group-title="([^"]*)"/);
    const group = groupMatch?.[1] || "";

    // Extract tvg-logo
    const logoMatch = line.match(/tvg-logo="([^"]*)"/);
    const poster = logoMatch?.[1] || null;

    // Extract tmdb id from tvg-id or title
    const idMatch = line.match(/tvg-id="(\d+)"/);
    
    // Extract title (after the last comma)
    const titleMatch = line.match(/,(.+)$/);
    const rawTitle = titleMatch?.[1]?.trim() || "";

    let tmdbId = idMatch ? Number(idMatch[1]) : 0;
    
    // Try to extract TMDB ID from URL patterns like /movie/12345 or /tv/12345
    if (!tmdbId) {
      const urlTmdbMatch = urlLine.match(/\/(movie|tv|serie)\/(\d+)/i);
      if (urlTmdbMatch) tmdbId = Number(urlTmdbMatch[2]);
    }

    // Try from title pattern "Title (TMDB:12345)"
    if (!tmdbId) {
      const titleTmdbMatch = rawTitle.match(/\(TMDB[:\s]*(\d+)\)/i);
      if (titleTmdbMatch) tmdbId = Number(titleTmdbMatch[1]);
    }

    if (!tmdbId || !urlLine) continue;

    // Determine content type from group
    const isSeries = /s[eé]rie|novela|anime|dorama|temporada/i.test(group) || 
                     /S\d+E\d+/i.test(rawTitle);
    const contentType = isSeries ? "series" : "movie";

    // Extract season/episode from title like "S01E05" or "T1 E5"
    let season = 0, episode = 0;
    const seMatch = rawTitle.match(/S(\d+)\s*E(\d+)/i) || rawTitle.match(/T(\d+)\s*E(\d+)/i);
    if (seMatch) {
      season = Number(seMatch[1]);
      episode = Number(seMatch[2]);
    }

    // Clean title
    const cleanTitle = rawTitle
      .replace(/S\d+\s*E\d+/gi, "")
      .replace(/T\d+\s*E\d+/gi, "")
      .replace(/\(TMDB[:\s]*\d+\)/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    items.push({
      title: cleanTitle || rawTitle,
      tmdb_id: tmdbId,
      content_type: contentType,
      stream_url: urlLine,
      season,
      episode,
      group,
      poster,
    });
  }

  return items;
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
    // 1. Fetch the IPTV list
    console.log("[iptv-import] Fetching IPTV list...");
    const res = await fetch(IPTV_URL, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) throw new Error(`IPTV fetch failed: ${res.status}`);
    const text = await res.text();
    console.log(`[iptv-import] Downloaded ${text.length} bytes`);

    // 2. Parse M3U
    const items = parseM3U(text);
    console.log(`[iptv-import] Parsed ${items.length} items`);

    if (items.length === 0) {
      return new Response(JSON.stringify({ error: "No items parsed from IPTV list" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Deduplicate by tmdb_id for content, keep all unique stream entries for cache
    const contentMap = new Map<string, any>();
    const cacheRows: any[] = [];

    for (const item of items) {
      const key = `${item.tmdb_id}-${item.content_type}`;
      if (!contentMap.has(key)) {
        contentMap.set(key, {
          tmdb_id: item.tmdb_id,
          content_type: item.content_type,
          title: item.title,
          poster_path: item.poster,
          overview: "",
          vote_average: 0,
          status: "published",
          featured: false,
          audio_type: ["dublado"],
        });
      }

      // Video cache entry
      if (item.stream_url) {
        const isM3u8 = item.stream_url.includes(".m3u8");
        cacheRows.push({
          tmdb_id: item.tmdb_id,
          content_type: item.content_type,
          audio_type: "dublado",
          video_url: item.stream_url,
          video_type: isM3u8 ? "m3u8" : "mp4",
          provider: "cineveo-iptv",
          season: item.season,
          episode: item.episode,
          expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }

    const contentRows = Array.from(contentMap.values());
    console.log(`[iptv-import] ${contentRows.length} unique content, ${cacheRows.length} cache entries`);

    // 4. Upsert content (won't overwrite existing)
    let contentOk = 0, contentErr = 0;
    for (let i = 0; i < contentRows.length; i += 200) {
      const batch = contentRows.slice(i, i + 200);
      const { error } = await supabase.from("content").upsert(batch, {
        onConflict: "tmdb_id,content_type",
        ignoreDuplicates: true, // Don't overwrite existing records
      });
      if (error) { contentErr += batch.length; console.error("[iptv-import] content error:", error.message); }
      else contentOk += batch.length;
    }

    // 5. Upsert video cache (only insert if not exists - lower priority than cineveo-api)
    let cacheOk = 0, cacheErr = 0;
    for (let i = 0; i < cacheRows.length; i += 200) {
      const batch = cacheRows.slice(i, i + 200);
      const { error } = await supabase.from("video_cache").upsert(batch, {
        onConflict: "tmdb_id,content_type,audio_type,season,episode",
        ignoreDuplicates: true, // Don't overwrite higher-priority providers
      });
      if (error) { cacheErr += batch.length; console.error("[iptv-import] cache error:", error.message); }
      else cacheOk += batch.length;
    }

    const result = {
      parsed: items.length,
      unique_content: contentRows.length,
      cache_entries: cacheRows.length,
      content_upserted: contentOk,
      content_errors: contentErr,
      cache_upserted: cacheOk,
      cache_errors: cacheErr,
    };

    console.log("[iptv-import] Done:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[iptv-import] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Import failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

