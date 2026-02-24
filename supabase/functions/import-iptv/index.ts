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

  let tmdbId: number | null = null;
  const fileMatch = url.match(/\/(\d+)\.(?:mp4|m3u8|mkv|ts)(?:\?|$)/);
  if (fileMatch) tmdbId = parseInt(fileMatch[1]);

  if (!tmdbId) {
    const tvgMatch = tvgId.match(/^(\d+)$/) || tvgId.match(/tmdb[_-]?(\d+)/i);
    if (tvgMatch) tmdbId = parseInt(tvgMatch[1]);
  }
  if (!tmdbId) {
    const pathMatch = url.match(/\/(?:movie|tv|embed)\/.*?\/(\d+)/);
    if (pathMatch) tmdbId = parseInt(pathMatch[1]);
  }

  let season: number | null = null;
  let episode: number | null = null;
  const seMatch = title.match(/S(\d+)\s*E(\d+)/i) || url.match(/\/(\d+)\/(\d+)\/?$/);
  if (seMatch) {
    season = parseInt(seMatch[1]);
    episode = parseInt(seMatch[2]);
  }

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

// Parse ALL entries from the M3U text
function parseAllM3U(text: string): ParsedEntry[] {
  const lines = text.split("\n");
  const entries: ParsedEntry[] = [];
  let infoLine = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("#EXTINF:")) {
      infoLine = line;
      continue;
    }
    if (line.startsWith("#") || !line) continue;
    if (infoLine) {
      const entry = parseEntry(infoLine, line);
      if (entry) entries.push(entry);
      infoLine = "";
    }
  }
  return entries;
}

async function saveProgress(adminClient: any, progress: any) {
  await adminClient.from("site_settings").upsert({
    key: "iptv_import_progress",
    value: progress,
  }, { onConflict: "key" });
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
    const iptvUrl: string = body.url || "";
    if (!iptvUrl) throw new Error("URL da lista IPTV é obrigatória");

    // Reset progress
    await saveProgress(adminClient, {
      done: false, phase: "downloading", entries: 0,
      cache_imported: 0, content_imported: 0, errors: 0,
      updated_at: new Date().toISOString(),
    });

    // Download entire list
    console.log("[import-iptv] Downloading full list...");
    const listRes = await fetch(iptvUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!listRes.ok) throw new Error(`Failed to fetch: ${listRes.status}`);
    const text = await listRes.text();
    console.log(`[import-iptv] Downloaded ${(text.length / 1024 / 1024).toFixed(1)}MB`);

    // Parse all entries
    const allEntries = parseAllM3U(text);
    console.log(`[import-iptv] Parsed ${allEntries.length} total entries`);

    // Filter entries with valid TMDB IDs
    const validEntries = allEntries.filter(e => e.tmdbId && e.tmdbId > 100);
    console.log(`[import-iptv] ${validEntries.length} entries with TMDB IDs`);

    await saveProgress(adminClient, {
      done: false, phase: "importing_cache",
      entries: allEntries.length, valid: validEntries.length,
      cache_imported: 0, content_imported: 0, errors: 0,
      updated_at: new Date().toISOString(),
    });

    // ── Step 1: Bulk upsert video_cache ──
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

    // Delete old cineveo-iptv entries in bulk
    const tmdbIds = [...new Set(validEntries.map(e => e.tmdbId!))];
    for (let i = 0; i < tmdbIds.length; i += 500) {
      await adminClient.from("video_cache").delete()
        .in("tmdb_id", tmdbIds.slice(i, i + 500))
        .eq("provider", "cineveo-iptv");
    }

    // Insert cache in large batches
    let cacheImported = 0;
    let errors = 0;
    const CACHE_BATCH = 500;
    for (let i = 0; i < cacheRows.length; i += CACHE_BATCH) {
      const batch = cacheRows.slice(i, i + CACHE_BATCH);
      const { error } = await adminClient.from("video_cache").insert(batch);
      if (error) { errors++; console.error(`cache batch error:`, error.message); }
      else cacheImported += batch.length;

      // Update progress every 2000 items
      if (i % 2000 === 0) {
        await saveProgress(adminClient, {
          done: false, phase: "importing_cache",
          entries: allEntries.length, valid: validEntries.length,
          cache_imported: cacheImported, content_imported: 0, errors,
          updated_at: new Date().toISOString(),
        });
      }
    }

    console.log(`[import-iptv] Cache imported: ${cacheImported}`);

    // ── Step 2: Enrich content table with TMDB data ──
    await saveProgress(adminClient, {
      done: false, phase: "enriching_content",
      entries: allEntries.length, valid: validEntries.length,
      cache_imported: cacheImported, content_imported: 0, errors,
      updated_at: new Date().toISOString(),
    });

    // Check which tmdb_ids are already in content
    const existingIds = new Set<number>();
    for (let i = 0; i < tmdbIds.length; i += 500) {
      const batch = tmdbIds.slice(i, i + 500);
      const { data: existing } = await adminClient
        .from("content")
        .select("tmdb_id")
        .in("tmdb_id", batch);
      existing?.forEach(e => existingIds.add(e.tmdb_id));
    }

    const newIds = tmdbIds.filter(id => !existingIds.has(id));
    console.log(`[import-iptv] ${newIds.length} new IDs to enrich (${existingIds.size} already exist)`);

    // Fetch TMDB details for new IDs with concurrency
    const tmdbDetails = new Map<number, any>();
    const queue = newIds.map(id => ({
      id,
      type: validEntries.find(e => e.tmdbId === id)?.contentType === "tv" ? "tv" : "movie",
    }));

    const q = [...queue];
    const CONCURRENCY = 10;
    let contentImported = 0;

    async function tmdbWorker() {
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
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, q.length) }, () => tmdbWorker()));

    // Build and upsert content rows
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
          created_by: user.id,
        };
      });

    for (let i = 0; i < contentRows.length; i += 200) {
      const batch = contentRows.slice(i, i + 200);
      const { error } = await adminClient.from("content").upsert(batch, {
        onConflict: "tmdb_id,content_type",
      });
      if (error) { errors++; console.error(`content batch error:`, error.message); }
      else contentImported += batch.length;
    }

    console.log(`[import-iptv] Content imported: ${contentImported}`);

    // Final progress
    await saveProgress(adminClient, {
      done: true, phase: "complete",
      entries: allEntries.length, valid: validEntries.length,
      cache_imported: cacheImported, content_imported: contentImported, errors,
      updated_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        entries: allEntries.length,
        valid: validEntries.length,
        cache_imported: cacheImported,
        content_imported: contentImported,
        already_existed: existingIds.size,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[import-iptv] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
