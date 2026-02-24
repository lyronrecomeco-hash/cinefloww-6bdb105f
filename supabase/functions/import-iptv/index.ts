import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TMDB_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI1MDFiOWNkYjllNDQ0NjkxMDJiODk5YjQ0YjU2MWQ5ZCIsIm5iZiI6MTc3MTIzMDg1My43NjYsInN1YiI6IjY5OTJkNjg1NzZjODAxNTdmMjFhZjMxMSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.c47JvphccOz_oyaUuQWCHQ1mXAsSH01OB14vKE2uenw";
const TMDB_BASE = "https://api.themoviedb.org/3";
const tmdbHeaders = {
  Authorization: `Bearer ${TMDB_TOKEN}`,
  "Content-Type": "application/json",
};

interface ParsedEntry {
  title: string;
  url: string;
  logo: string;
  group: string;
  tmdbId: number | null;
  season: number | null;
  episode: number | null;
  contentType: string;
}

// Stream-parse M3U: read line-by-line, only keep entries in the requested range
async function streamParseM3U(
  response: Response,
  skipCount: number,
  maxCount: number,
): Promise<{ entries: ParsedEntry[]; totalScanned: number }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let infoLine = "";
  let entryIndex = 0;
  const entries: ParsedEntry[] = [];
  let done = false;

  while (!done && entries.length < maxCount) {
    const { value, done: streamDone } = await reader.read();
    done = streamDone;
    if (value) buffer += decoder.decode(value, { stream: true });

    // Process complete lines
    let nlIdx: number;
    while ((nlIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.substring(0, nlIdx).trim();
      buffer = buffer.substring(nlIdx + 1);

      if (line.startsWith("#EXTINF:")) {
        infoLine = line;
        continue;
      }

      if (line.startsWith("#") || !line) continue;

      // This is a URL line following an #EXTINF
      if (infoLine) {
        if (entryIndex >= skipCount && entries.length < maxCount) {
          const entry = parseEntry(infoLine, line);
          if (entry) entries.push(entry);
        }
        entryIndex++;
        infoLine = "";

        // If we have enough, cancel the stream
        if (entries.length >= maxCount) {
          reader.cancel();
          break;
        }
      }
    }
  }

  return { entries, totalScanned: entryIndex };
}

function parseEntry(infoLine: string, url: string): ParsedEntry | null {
  const logoMatch = infoLine.match(/tvg-logo="([^"]*)"/);
  const groupMatch = infoLine.match(/group-title="([^"]*)"/);
  const nameMatch = infoLine.match(/,\s*(.+)$/);
  const idMatch = infoLine.match(/tvg-id="([^"]*)"/);

  const title = nameMatch?.[1]?.trim() || "";
  if (!title || !url) return null;

  const logo = logoMatch?.[1] || "";
  const group = groupMatch?.[1] || "";
  const tvgId = idMatch?.[1] || "";

  // Extract TMDB ID — primary: filename like /1020386.mp4
  let tmdbId: number | null = null;
  const fileMatch = url.match(/\/(\d+)\.(?:mp4|m3u8|mkv|ts)(?:\?|$)/);
  if (fileMatch) tmdbId = parseInt(fileMatch[1]);

  // Fallback: tvg-id or URL path
  if (!tmdbId) {
    const tvgMatch = tvgId.match(/^(\d+)$/) || tvgId.match(/tmdb[_-]?(\d+)/i);
    if (tvgMatch) tmdbId = parseInt(tvgMatch[1]);
  }
  if (!tmdbId) {
    const pathMatch = url.match(/\/(?:movie|tv|embed)\/.*?\/(\d+)/);
    if (pathMatch) tmdbId = parseInt(pathMatch[1]);
  }

  // Detect season/episode
  let season: number | null = null;
  let episode: number | null = null;
  const seMatch = title.match(/S(\d+)\s*E(\d+)/i) || url.match(/\/(\d+)\/(\d+)\/?$/);
  if (seMatch) {
    season = parseInt(seMatch[1]);
    episode = parseInt(seMatch[2]);
  }

  // Detect content type
  const groupLower = group.toLowerCase();
  let contentType = "movie";
  if (groupLower.includes("serie") || groupLower.includes("séri") || groupLower.includes("novela") || season !== null) {
    contentType = "tv";
  }

  return { title, url, logo, group, tmdbId, season, episode, contentType };
}

function detectVideoType(url: string): string {
  if (url.includes(".m3u8") || url.includes("/hls/")) return "m3u8";
  if (url.includes(".mp4")) return "mp4";
  return "m3u8";
}

function detectAudio(title: string, group: string): string {
  const combined = (title + " " + group).toLowerCase();
  if (combined.includes("leg") || combined.includes("legendado")) return "legendado";
  return "dublado";
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
    const action: string = body.action || "preview";
    const iptvUrl: string = body.url || "";
    const startIndex: number = body.start_index || 0;
    const batchSize: number = Math.min(body.batch_size || 150, 300);

    if (!iptvUrl) throw new Error("URL da lista IPTV é obrigatória");

    // Fetch with streaming
    console.log(`[import-iptv] Fetching (stream) from index ${startIndex}, batch ${batchSize}`);
    const listRes = await fetch(iptvUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!listRes.ok) throw new Error(`Failed to fetch: ${listRes.status}`);

    const { entries, totalScanned } = await streamParseM3U(listRes, startIndex, batchSize);
    console.log(`[import-iptv] Parsed ${entries.length} entries (scanned ${totalScanned})`);

    // ── Preview ──
    if (action === "preview") {
      const groups = new Map<string, number>();
      for (const e of entries) groups.set(e.group, (groups.get(e.group) || 0) + 1);

      return new Response(
        JSON.stringify({
          success: true,
          entries_in_batch: entries.length,
          total_scanned: totalScanned,
          groups: Object.fromEntries(groups),
          sample: entries.slice(0, 30).map(e => ({
            title: e.title,
            url: e.url.substring(0, 100),
            group: e.group,
            tmdbId: e.tmdbId,
            contentType: e.contentType,
            season: e.season,
            episode: e.episode,
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Import ──
    if (action === "import") {
      // Entries with valid TMDB IDs
      const validEntries = entries.filter(e => e.tmdbId && e.tmdbId > 100);
      
      // Search TMDB for entries without IDs (limit to avoid timeout)
      const noIdEntries = entries.filter(e => !e.tmdbId || e.tmdbId <= 100);
      const searchLimit = Math.min(noIdEntries.length, 30);
      
      for (let i = 0; i < searchLimit; i++) {
        const entry = noIdEntries[i];
        let searchTitle = entry.title
          .replace(/S\d+\s*E\d+/gi, "")
          .replace(/\(\d{4}\)/g, "")
          .replace(/\[.*?\]/g, "")
          .replace(/\s*-\s*\d+\s*Temporada.*/i, "")
          .trim();
        if (!searchTitle || searchTitle.length < 2) continue;

        try {
          const res = await fetch(
            `${TMDB_BASE}/search/multi?query=${encodeURIComponent(searchTitle)}&language=pt-BR&page=1`,
            { headers: tmdbHeaders },
          );
          if (res.ok) {
            const data = await res.json();
            if (data.results?.length > 0) {
              const best = data.results[0];
              entry.tmdbId = best.id;
              entry.contentType = best.media_type === "tv" ? "tv" : "movie";
              validEntries.push(entry);
            }
          }
        } catch { /* skip */ }
      }

      console.log(`[import-iptv] ${validEntries.length} valid entries with TMDB IDs`);

      // Upsert video_cache (delete old + insert)
      let cacheImported = 0;
      let contentImported = 0;
      const errors: string[] = [];

      const cacheRows = validEntries.map(e => ({
        tmdb_id: e.tmdbId!,
        content_type: e.contentType,
        audio_type: detectAudio(e.title, e.group),
        video_url: e.url,
        video_type: detectVideoType(e.url),
        provider: "cineveo-iptv",
        season: e.season,
        episode: e.episode,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }));

      // Delete old entries for these IDs
      const tmdbIds = [...new Set(validEntries.map(e => e.tmdbId!))];
      for (let i = 0; i < tmdbIds.length; i += 100) {
        await adminClient.from("video_cache").delete()
          .in("tmdb_id", tmdbIds.slice(i, i + 100))
          .eq("provider", "cineveo-iptv");
      }

      // Insert cache
      for (let i = 0; i < cacheRows.length; i += 100) {
        const batch = cacheRows.slice(i, i + 100);
        const { error } = await adminClient.from("video_cache").insert(batch);
        if (error) errors.push(`cache: ${error.message}`);
        else cacheImported += batch.length;
      }

      // Enrich content table with TMDB data
      const uniqueIds = tmdbIds.slice(0, 100); // Limit TMDB lookups
      const tmdbDetails = new Map<number, any>();
      const tmdbQueue = uniqueIds.map(id => ({
        id,
        type: validEntries.find(e => e.tmdbId === id)?.contentType === "tv" ? "tv" : "movie",
      }));

      const q = [...tmdbQueue];
      async function worker() {
        while (q.length > 0) {
          const item = q.shift();
          if (!item) break;
          try {
            const res = await fetch(
              `${TMDB_BASE}/${item.type}/${item.id}?language=pt-BR&append_to_response=external_ids`,
              { headers: tmdbHeaders },
            );
            if (res.ok) tmdbDetails.set(item.id, await res.json());
          } catch { /* skip */ }
        }
      }
      await Promise.all(Array.from({ length: Math.min(8, q.length) }, () => worker()));

      const contentRows = uniqueIds
        .filter(id => tmdbDetails.has(id))
        .map(id => {
          const d = tmdbDetails.get(id)!;
          const entry = validEntries.find(e => e.tmdbId === id)!;
          return {
            tmdb_id: id,
            imdb_id: d.imdb_id || d.external_ids?.imdb_id || null,
            content_type: entry.contentType,
            title: d.title || d.name || entry.title,
            original_title: d.original_title || d.original_name || null,
            overview: d.overview || "",
            poster_path: d.poster_path || null,
            backdrop_path: d.backdrop_path || null,
            release_date: d.release_date || d.first_air_date || null,
            vote_average: d.vote_average || 0,
            runtime: d.runtime || null,
            number_of_seasons: d.number_of_seasons || null,
            number_of_episodes: d.number_of_episodes || null,
            status: "published",
            featured: false,
            audio_type: ["dublado"],
            created_by: user.id,
          };
        });

      for (let i = 0; i < contentRows.length; i += 100) {
        const batch = contentRows.slice(i, i + 100);
        const { error } = await adminClient.from("content").upsert(batch, {
          onConflict: "tmdb_id,content_type",
        });
        if (error) errors.push(`content: ${error.message}`);
        else contentImported += batch.length;
      }

      const hasMore = entries.length >= batchSize;
      const nextIndex = hasMore ? startIndex + batchSize : null;

      return new Response(
        JSON.stringify({
          success: true,
          cache_imported: cacheImported,
          content_imported: contentImported,
          batch_processed: entries.length,
          valid_with_tmdb: validEntries.length,
          has_more: hasMore,
          next_index: nextIndex,
          errors: errors.slice(0, 10),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error: any) {
    console.error("[import-iptv] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
