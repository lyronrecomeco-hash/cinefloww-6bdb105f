import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ── CineVeo Catalog API credentials (hardcoded) ─────────────────────
const CINEVEO_API_BASE = "https://cinetvembed.cineveo.site/api";
const CINEVEO_USER = "lyneflix-vods";
const CINEVEO_PASS = "uVljs2d";

// ── Fetch with timeout helper ────────────────────────────────────────
function fetchWithTimeout(url: string, opts: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 8000, ...fetchOpts } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...fetchOpts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ── CineVeo Catalog API: fetch stream_url for a given tmdb_id (com paginação real) ───────
function normalizeAudioLabel(input?: string): "dublado" | "legendado" | "cam" {
  const v = (input || "").toLowerCase();
  if (v.includes("dub") || v.includes("pt") || v.includes("port")) return "dublado";
  if (v.includes("cam")) return "cam";
  return "legendado";
}

function pickStreamUrl(record: any): string | null {
  return record?.stream_url || record?.streamUrl || record?.url || record?.video_url || record?.link || record?.embed_url || null;
}

function isLikelyBrokenCineveoUrl(url?: string, provider?: string): boolean {
  if (!url) return true;
  if ((provider || "").toLowerCase() !== "cineveo-api") return false;
  return /cdn\.cineveo\.site\/.*%2520/i.test(url);
}

function pickEpisodeStream(
  episodes: any[],
  season?: number,
  episode?: number,
): { url: string; audio: "dublado" | "legendado" | "cam" } | null {
  if (!Array.isArray(episodes) || episodes.length === 0) return null;

  const normalized = episodes
    .map((ep) => ({
      season: Number(ep?.season ?? ep?.temporada ?? ep?.s ?? 1) || 1,
      episode: Number(ep?.episode ?? ep?.ep ?? ep?.e ?? 1) || 1,
      audio: normalizeAudioLabel(ep?.language || ep?.audio || ep?.lang),
      url: pickStreamUrl(ep),
    }))
    .filter((ep) => !!ep.url);

  if (!normalized.length) return null;

  let candidates = normalized;
  if (season && episode) {
    const exact = normalized.filter((ep) => ep.season === season && ep.episode === episode);
    if (exact.length) candidates = exact;
  }

  const audioRank = (a: "dublado" | "legendado" | "cam") => {
    if (a === "dublado") return 3;
    if (a === "legendado") return 2;
    return 1;
  };

  const best = candidates.sort((a, b) => audioRank(b.audio) - audioRank(a.audio))[0];
  if (!best?.url) return null;
  return { url: best.url, audio: best.audio };
}

async function tryCineveoCatalog(
  tmdbId: number,
  contentType: string,
  season?: number,
  episode?: number,
): Promise<{ url: string; type: "mp4" | "m3u8" } | null> {
  const isMovie = contentType === "movie";
  const apiType = isMovie ? "movies" : "series";

  let page = 1;
  let totalPagesFromApi: number | null = null;
  let emptyStreak = 0;
  const MAX_PAGES = 2500;
  const MAX_EMPTY_STREAK = 3;

  while (page <= MAX_PAGES) {
    const catalogUrl = `${CINEVEO_API_BASE}/catalog.php?username=${CINEVEO_USER}&password=${CINEVEO_PASS}&type=${apiType}&page=${page}`;

    try {
      const res = await fetchWithTimeout(catalogUrl, {
        timeout: 12000,
        headers: { "User-Agent": UA, Accept: "application/json" },
      });

      if (!res.ok) {
        console.log(`[cineveo-api] page=${page} returned ${res.status}`);
        page += 1;
        continue;
      }

      const payload = await res.json();
      const items = Array.isArray(payload)
        ? payload
        : payload?.data || payload?.results || payload?.items || [];

      const parsedTotal = Number(payload?.pagination?.total_pages || 0);
      if (parsedTotal > 0) totalPagesFromApi = parsedTotal;

      if (!Array.isArray(items) || items.length === 0) {
        emptyStreak += 1;
        if (totalPagesFromApi && page >= totalPagesFromApi) break;
        if (!totalPagesFromApi && emptyStreak >= MAX_EMPTY_STREAK) break;
        page += 1;
        continue;
      }

      emptyStreak = 0;

      const tmdbStr = String(tmdbId);
      const match = items.find((item: any) =>
        String(item?.tmdb_id) === tmdbStr ||
        String(item?.tmdbId) === tmdbStr ||
        String(item?.id) === tmdbStr,
      );

      if (!match) {
        if (totalPagesFromApi && page >= totalPagesFromApi) break;
        page += 1;
        continue;
      }

      console.log(`[cineveo-api] Found tmdb_id=${tmdbId} on page=${page}/${totalPagesFromApi || "?"}`);

      let streamUrl: string | null = null;

      if (isMovie) {
        streamUrl = pickStreamUrl(match);
      } else {
        const epCandidate = pickEpisodeStream(match?.episodes || [], season, episode);
        streamUrl = epCandidate?.url || pickStreamUrl(match);
      }

      if (!streamUrl) {
        console.log(`[cineveo-api] Match found but without stream URL`);
        return null;
      }

      const type: "mp4" | "m3u8" = streamUrl.includes(".m3u8") ? "m3u8" : "mp4";
      return { url: streamUrl, type };
    } catch (err) {
      console.log(`[cineveo-api] page=${page} error: ${err}`);
      page += 1;
      continue;
    }
  }

  console.log(`[cineveo-api] tmdb_id=${tmdbId} not found after scanning up to page=${Math.min(page, MAX_PAGES)}`);
  return null;
}

// ── Mega.nz link handling ────────────────────────────────────────────
// Mega.nz uses client-side encryption — we convert file links to embed links
// so the Mega player handles decryption and playback natively in an iframe.
function convertMegaToEmbed(megaUrl: string): string | null {
  // mega.nz/file/ID#KEY → mega.nz/embed/ID#KEY
  const fileMatch = megaUrl.match(/mega\.nz\/file\/([^#]+)(#.+)?/);
  if (fileMatch) {
    return `https://mega.nz/embed/${fileMatch[1]}${fileMatch[2] || ""}`;
  }
  // Legacy: mega.nz/#!ID!KEY → mega.nz/embed#!ID!KEY
  const legacyMatch = megaUrl.match(/mega\.nz\/#!([^!]+)!(.+)/);
  if (legacyMatch) {
    return `https://mega.nz/embed#!${legacyMatch[1]}!${legacyMatch[2]}`;
  }
  // Already embed
  if (megaUrl.includes("mega.nz/embed")) return megaUrl;
  return null;
}

async function tryMegaExtract(megaUrl: string): Promise<{ url: string; type: "mp4" | "m3u8" | "mega-embed" } | null> {
  if (!megaUrl) return null;
  
  const isMega = megaUrl.includes("mega.nz") || megaUrl.includes("mega.co.nz");
  if (!isMega) return null;

  console.log(`[mega] Processing Mega.nz link`);

  // If it's a direct media URL already decrypted
  if (megaUrl.includes(".mp4") || megaUrl.includes(".m3u8")) {
    console.log(`[mega] Direct media URL detected`);
    return { url: megaUrl, type: megaUrl.includes(".m3u8") ? "m3u8" : "mp4" };
  }

  // Convert to embed URL for native Mega player
  const embedUrl = convertMegaToEmbed(megaUrl);
  if (embedUrl) {
    console.log(`[mega] Converted to embed: ${embedUrl}`);
    return { url: embedUrl, type: "mega-embed" as any };
  }

  console.log(`[mega] Could not convert Mega URL`);
  return null;
}

// ── Iframe proxy fallback ───────────────────────────────────────────
function fallbackToIframeProxy(embedUrl: string, tag: string): { url: string; type: "iframe-proxy" } {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const proxyUrl = `${supabaseUrl}/functions/v1/proxy-player?url=${encodeURIComponent(embedUrl)}`;
  console.log(`[${tag}] Using iframe-proxy fallback`);
  return { url: proxyUrl, type: "iframe-proxy" as any };
}

// ── Timeout wrapper ─────────────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => {
        console.log(`[${label}] Timeout after ${ms}ms, skipping`);
        resolve(null);
      }, ms);
    }),
  ]);
}

// ── Main handler ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tmdb_id, imdb_id, content_type, audio_type, season, episode, force_provider, title: reqTitle, mega_url } = await req.json();

    if (!tmdb_id) {
      return new Response(JSON.stringify({ error: "tmdb_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cType = content_type || "movie";
    const aType = audio_type || "legendado";
    const isMovie = cType === "movie";
    const s = season || 1;
    const e = episode || 1;
    const keySeason = season || 0;
    const keyEpisode = episode || 0;
    const cacheTypes = cType === "tv" ? ["tv", "series"] : [cType];

    // 0. Cache com prioridade: manual > cineveo-api > cineveo-iptv > cineveo > demais.
    // Se não houver no áudio solicitado, tenta fallback para qualquer áudio disponível.
    if (!force_provider) {
      const providerRank = (provider?: string) => {
        const p = (provider || "").toLowerCase();
        if (p === "manual") return 130;
        if (p === "cineveo-api") return 120;
        if (p === "cineveo-iptv") return 110;
        if (p === "cineveo") return 100;
        return 70;
      };

      const pickBest = (rows: any[]) => (rows || [])
        .filter((row: any) => row?.video_url && row?.video_type !== "mega-embed" && !isLikelyBrokenCineveoUrl(row?.video_url, row?.provider))
        .sort((a: any, b: any) => providerRank(b.provider) - providerRank(a.provider))[0] || null;

      const baseQuery = supabase
        .from("video_cache")
        .select("video_url, video_type, provider, created_at")
        .eq("tmdb_id", tmdb_id)
        .in("content_type", cacheTypes)
        .eq("season", keySeason)
        .eq("episode", keyEpisode)
        .gt("expires_at", new Date().toISOString());

      const { data: cachedRows } = await baseQuery.eq("audio_type", aType).order("created_at", { ascending: false }).limit(20);
      let bestCached = pickBest(cachedRows || []);

      if (!bestCached) {
        const { data: anyAudioRows } = await baseQuery.order("created_at", { ascending: false }).limit(20);
        bestCached = pickBest(anyAudioRows || []);
      }

      if (bestCached?.video_url) {
        console.log(`[extract] Cache hit for tmdb_id=${tmdb_id} provider=${bestCached.provider}`);
        return new Response(JSON.stringify({
          url: bestCached.video_url,
          type: bestCached.video_type,
          provider: bestCached.provider,
          cached: true,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }



    // 2. Try CineVeo Catalog API (sole provider)
    let videoUrl: string | null = null;
    let videoType: "mp4" | "m3u8" = "mp4";
    let provider = "cineveo-api";

    console.log(`[extract] Trying CineVeo Catalog API for tmdb_id=${tmdb_id}`);
    const result = await withTimeout(
      tryCineveoCatalog(tmdb_id, cType, season, episode),
      20000,
      "cineveo-api"
    );

    if (result) {
      videoUrl = result.url;
      videoType = result.type;
      provider = "cineveo-api";
    }

    // 3. Sem fallback por embed/proxy externo: somente CineVeo API
    if (!videoUrl) {
      return new Response(JSON.stringify({
        url: null,
        provider: "cineveo-api",
        message: "Nenhum vídeo encontrado via catálogo CineVeo",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 4. Save to cache & return
    if (videoUrl) {
      console.log(`[extract] Success via ${provider}`);
      await supabase.from("video_cache").upsert({
        tmdb_id, content_type: cType, audio_type: aType,
        season: season || 0, episode: episode || 0,
        video_url: videoUrl, video_type: videoType, provider,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "tmdb_id,content_type,audio_type,season,episode" });

      const logTitle = reqTitle || `TMDB ${tmdb_id}`;
      await supabase.from("resolve_logs").insert({
        tmdb_id, title: logTitle, content_type: cType,
        season: season || 0, episode: episode || 0,
        provider, video_url: videoUrl, video_type: videoType, success: true,
      });

      return new Response(JSON.stringify({
        url: videoUrl, type: videoType, provider, cached: false,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Log failure
    const logTitle = reqTitle || `TMDB ${tmdb_id}`;
    await supabase.from("resolve_logs").insert({
      tmdb_id, title: logTitle, content_type: cType,
      season: season || 0, episode: episode || 0,
      provider: "cineveo-api", success: false,
      error_message: "CineVeo API não retornou vídeo",
    });

    return new Response(JSON.stringify({
      url: null, provider: "none", message: "Nenhum vídeo encontrado via CineVeo API",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[extract] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Extraction failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
