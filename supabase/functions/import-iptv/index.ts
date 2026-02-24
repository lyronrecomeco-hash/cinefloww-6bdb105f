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

const BATCH_SIZE = 1000;
const MAX_RUNTIME_MS = 100_000; // 100s safety margin

interface ParsedEntry {
  title: string;
  url: string;
  group: string;
  tmdbId: number | null;
  season: number | null;
  episode: number | null;
  contentType: string;
}

function parseEntry(infoLine: string, url: string): ParsedEntry | null {
  const groupMatch = infoLine.match(/group-title="([^"]*)"/);
  const nameMatch = infoLine.match(/,\s*(.+)$/);

  const title = nameMatch?.[1]?.trim() || "";
  if (!title || !url) return null;

  const group = groupMatch?.[1] || "";

  let tmdbId: number | null = null;
  const fileMatch = url.match(/\/(\d+)\.(?:mp4|m3u8|mkv|ts)(?:\?|$)/);
  if (fileMatch) tmdbId = parseInt(fileMatch[1]);
  if (!tmdbId) {
    const pathMatch = url.match(/\/(?:movie|tv|embed)\/.*?\/(\d+)/);
    if (pathMatch) tmdbId = parseInt(pathMatch[1]);
  }

  let season: number | null = null;
  let episode: number | null = null;
  const seMatch = title.match(/S(\d+)\s*E(\d+)/i) || url.match(/\/(\d+)\/(\d+)\/?$/);
  if (seMatch) { season = parseInt(seMatch[1]); episode = parseInt(seMatch[2]); }

  const groupLower = group.toLowerCase();
  let contentType = "movie";
  if (groupLower.includes("serie") || groupLower.includes("séri") || groupLower.includes("novela") || season !== null) {
    contentType = "tv";
  }

  return { title, url, group, tmdbId, season, episode, contentType };
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

// Stream-parse M3U: skip first N entries, collect up to BATCH_SIZE
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

    let nlIdx: number;
    while ((nlIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.substring(0, nlIdx).trim();
      buffer = buffer.substring(nlIdx + 1);

      if (line.startsWith("#EXTINF:")) { infoLine = line; continue; }
      if (line.startsWith("#") || !line) continue;

      if (infoLine) {
        if (entryIndex >= skipCount && entries.length < maxCount) {
          const entry = parseEntry(infoLine, line);
          if (entry) entries.push(entry);
        }
        entryIndex++;
        infoLine = "";
        if (entries.length >= maxCount) { reader.cancel(); break; }
      }
    }
  }

  return { entries, totalScanned: entryIndex };
}

async function saveProgress(adminClient: any, progress: any) {
  await adminClient.from("site_settings").upsert({
    key: "iptv_import_progress",
    value: { ...progress, updated_at: new Date().toISOString() },
  }, { onConflict: "key" });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const iptvUrl: string = body.url || "";
    const startIndex: number = body.start_index || 0;
    const userId: string = body.user_id || "";
    const isChained: boolean = body._chained || false;
    const accumulated = body._accumulated || { cache: 0, content: 0, entries: 0, errors: 0 };

    // Auth check only on first call (not chained)
    if (!isChained) {
      const authHeader = req.headers.get("Authorization");
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader || "" } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) throw new Error("Unauthorized");
      const { data: roles } = await adminClient
        .from("user_roles").select("role")
        .eq("user_id", user.id).eq("role", "admin");
      if (!roles?.length) throw new Error("Not admin");

      // Reset progress on first call
      await saveProgress(adminClient, {
        done: false, phase: "downloading", start_index: 0,
        entries: 0, valid: 0, cache_imported: 0, content_imported: 0, errors: 0,
      });
    }

    if (!iptvUrl) throw new Error("URL da lista IPTV é obrigatória");

    // Stream-fetch with skip
    console.log(`[import-iptv] Streaming from index ${startIndex}, batch ${BATCH_SIZE}`);
    const listRes = await fetch(iptvUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!listRes.ok) throw new Error(`Failed to fetch: ${listRes.status}`);

    const { entries, totalScanned } = await streamParseM3U(listRes, startIndex, BATCH_SIZE);
    console.log(`[import-iptv] Parsed ${entries.length} entries (scanned ${totalScanned})`);

    // Filter valid entries
    const validEntries = entries.filter(e => e.tmdbId && e.tmdbId > 100);
    console.log(`[import-iptv] ${validEntries.length} valid with TMDB IDs`);

    await saveProgress(adminClient, {
      done: false, phase: "importing_cache", start_index: startIndex,
      entries: accumulated.entries + entries.length,
      valid: validEntries.length,
      cache_imported: accumulated.cache,
      content_imported: accumulated.content,
      errors: accumulated.errors,
    });

    // ── Bulk delete old cineveo-iptv for these IDs, then insert ──
    const tmdbIds = [...new Set(validEntries.map(e => e.tmdbId!))];
    for (let i = 0; i < tmdbIds.length; i += 500) {
      await adminClient.from("video_cache").delete()
        .in("tmdb_id", tmdbIds.slice(i, i + 500))
        .eq("provider", "cineveo-iptv");
    }

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

    let cacheImported = 0;
    let errors = 0;
    for (let i = 0; i < cacheRows.length; i += 500) {
      const batch = cacheRows.slice(i, i + 500);
      const { error } = await adminClient.from("video_cache").insert(batch);
      if (error) { errors++; console.error(`cache err:`, error.message); }
      else cacheImported += batch.length;
    }

    // ── Enrich new content (only IDs not already in content table) ──
    const existingIds = new Set<number>();
    for (let i = 0; i < tmdbIds.length; i += 500) {
      const { data: existing } = await adminClient
        .from("content").select("tmdb_id")
        .in("tmdb_id", tmdbIds.slice(i, i + 500));
      existing?.forEach(e => existingIds.add(e.tmdb_id));
    }

    const newIds = tmdbIds.filter(id => !existingIds.has(id));
    let contentImported = 0;

    if (newIds.length > 0 && (Date.now() - startTime) < MAX_RUNTIME_MS - 20000) {
      await saveProgress(adminClient, {
        done: false, phase: "enriching_content", start_index: startIndex,
        entries: accumulated.entries + entries.length,
        valid: validEntries.length,
        cache_imported: accumulated.cache + cacheImported,
        content_imported: accumulated.content,
        errors: accumulated.errors + errors,
      });

      const tmdbDetails = new Map<number, any>();
      const queue = [...newIds.slice(0, 200)]; // Limit per batch
      async function worker() {
        while (queue.length > 0) {
          if (Date.now() - startTime > MAX_RUNTIME_MS - 10000) break;
          const id = queue.shift();
          if (!id) break;
          const type = validEntries.find(e => e.tmdbId === id)?.contentType === "tv" ? "tv" : "movie";
          try {
            const res = await fetch(
              `${TMDB_BASE}/${type}/${id}?language=pt-BR&append_to_response=external_ids`,
              { headers: tmdbHeaders },
            );
            if (res.ok) tmdbDetails.set(id, await res.json());
          } catch { /* skip */ }
        }
      }
      await Promise.all(Array.from({ length: Math.min(8, newIds.length) }, () => worker()));

      const contentRows = newIds
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
            created_by: userId || null,
          };
        });

      for (let i = 0; i < contentRows.length; i += 200) {
        const batch = contentRows.slice(i, i + 200);
        const { error } = await adminClient.from("content").upsert(batch, {
          onConflict: "tmdb_id,content_type",
        });
        if (error) { errors++; console.error(`content err:`, error.message); }
        else contentImported += batch.length;
      }
    }

    // ── Accumulate totals ──
    const newAccumulated = {
      cache: accumulated.cache + cacheImported,
      content: accumulated.content + contentImported,
      entries: accumulated.entries + entries.length,
      errors: accumulated.errors + errors,
    };

    const hasMore = entries.length >= BATCH_SIZE;
    const nextIndex = hasMore ? startIndex + BATCH_SIZE : null;

    // ── Auto-chain if more to process ──
    if (hasMore && nextIndex !== null) {
      await saveProgress(adminClient, {
        done: false, phase: "chaining",
        start_index: nextIndex,
        ...newAccumulated,
      });

      // Fire next batch in background
      fetch(`${supabaseUrl}/functions/v1/import-iptv`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          url: iptvUrl,
          start_index: nextIndex,
          user_id: userId,
          _chained: true,
          _accumulated: newAccumulated,
        }),
      }).catch(() => {});
    } else {
      // Done!
      await saveProgress(adminClient, {
        done: true, phase: "complete",
        start_index: nextIndex || startIndex,
        ...newAccumulated,
      });
    }

    console.log(`[import-iptv] Batch done: cache=${cacheImported}, content=${contentImported}, hasMore=${hasMore}`);

    return new Response(
      JSON.stringify({
        success: true,
        batch_cache: cacheImported,
        batch_content: contentImported,
        has_more: hasMore,
        next_index: nextIndex,
        accumulated: newAccumulated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[import-iptv] Error:", error);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && serviceKey) {
      const adminClient = createClient(supabaseUrl, serviceKey);
      await saveProgress(adminClient, {
        done: true, phase: "error", error: error.message,
        cache_imported: 0, content_imported: 0, entries: 0, errors: 1,
      });
    }
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
