/**
 * app-catalog: Public API for the Android app to consume the same catalog as the website.
 * No HMAC, no bot detection — lightweight and fast.
 *
 * Endpoints (via `action` field):
 *   "home"       → Returns all home sections (trending, popular, recently added, doramas, animes)
 *   "movies"     → Paginated movies from TMDB (same as site /filmes)
 *   "series"     → Paginated series from TMDB (same as site /series)
 *   "doramas"    → Paginated doramas from CineVeo API
 *   "animes"     → Paginated animes from TMDB discover
 *   "detail"     → Full detail for a title (TMDB + CineVeo episodes)
 *   "season"     → Season episodes (TMDB metadata + CineVeo stream URLs)
 *   "search"     → Search by title
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI1MDFiOWNkYjllNDQ0NjkxMDJiODk5YjQ0YjU2MWQ5ZCIsIm5iZiI6MTc3MTIzMDg1My43NjYsInN1YiI6IjY5OTJkNjg1NzZjODAxNTdmMjFhZjMxMSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.c47JvphccOz_oyaUuQWCHQ1mXAsSH01OB14vKE2uenw";
const TMDB_BASE = "https://api.themoviedb.org/3";
const tmdbHeaders = { Authorization: `Bearer ${TMDB_TOKEN}`, "Content-Type": "application/json" };

const CINEVEO_API = "https://cinetvembed.cineveo.site/api/catalog.php";
const CINEVEO_USER = "lyneflix-vods";
const CINEVEO_PASS = "uVljs2d";
const CINEVEO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ========== TMDB helpers ==========
async function tmdbFetch(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set("language", "pt-BR");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: tmdbHeaders, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  return res.json();
}

async function getTrending() {
  const data = await tmdbFetch("/trending/all/day");
  return data?.results?.filter((m: any) => m.poster_path) || [];
}

async function getPopularMovies(page = 1, genreId?: number) {
  const params: Record<string, string> = { page: String(page) };
  if (genreId) params.with_genres = String(genreId);
  const endpoint = genreId ? "/discover/movie" : "/movie/popular";
  const data = await tmdbFetch(endpoint, params);
  return { results: data?.results?.filter((m: any) => m.poster_path) || [], total_pages: data?.total_pages || 1 };
}

async function getPopularSeries(page = 1, genreId?: number) {
  const params: Record<string, string> = { page: String(page) };
  if (genreId) params.with_genres = String(genreId);
  const endpoint = genreId ? "/discover/tv" : "/tv/popular";
  const data = await tmdbFetch(endpoint, params);
  return { results: data?.results?.filter((m: any) => m.poster_path) || [], total_pages: data?.total_pages || 1 };
}

async function getNowPlaying() {
  const [movies, series] = await Promise.all([
    tmdbFetch("/movie/now_playing"),
    tmdbFetch("/tv/airing_today"),
  ]);
  const combined = [
    ...(movies?.results?.slice(0, 10) || []).map((m: any) => ({ ...m, media_type: "movie" })),
    ...(series?.results?.slice(0, 10) || []).map((s: any) => ({ ...s, media_type: "tv" })),
  ].filter((m: any) => m.poster_path);
  combined.sort((a: any, b: any) => {
    const ya = (a.release_date || a.first_air_date || "").substring(0, 4);
    const yb = (b.release_date || b.first_air_date || "").substring(0, 4);
    return yb.localeCompare(ya);
  });
  return combined;
}

async function getAnimesTMDB(page = 1) {
  const data = await tmdbFetch("/discover/tv", {
    page: String(page),
    with_genres: "16",
    sort_by: "popularity.desc",
    with_original_language: "ja",
  });
  return { results: data?.results?.filter((m: any) => m.poster_path) || [], total_pages: data?.total_pages || 1 };
}

async function getReleases2026() {
  const today = new Date().toISOString().split("T")[0];
  const data = await tmdbFetch("/discover/movie", {
    "primary_release_date.gte": "2026-01-01",
    "primary_release_date.lte": today,
    sort_by: "popularity.desc",
  });
  return data?.results?.filter((m: any) => m.backdrop_path && m.poster_path) || [];
}

async function searchTMDB(query: string) {
  const data = await tmdbFetch("/search/multi", { query });
  return data?.results?.filter((m: any) => m.poster_path && (m.media_type === "movie" || m.media_type === "tv")) || [];
}

async function getMovieDetail(tmdbId: number) {
  return tmdbFetch(`/movie/${tmdbId}`, { append_to_response: "credits,similar,videos" });
}

async function getSeriesDetail(tmdbId: number) {
  return tmdbFetch(`/tv/${tmdbId}`, { append_to_response: "credits,similar,videos,external_ids" });
}

async function getSeasonDetail(tmdbId: number, season: number) {
  return tmdbFetch(`/tv/${tmdbId}/season/${season}`);
}

// ========== Storage catalog helpers ==========
async function fetchCatalogPage(type: string, page: number): Promise<any> {
  const url = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/catalog/${type}/${page}.json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { items: [], total: 0 };
    return res.json();
  } catch {
    return { items: [], total: 0 };
  }
}

async function fetchCatalogRow(type: string, limit = 20): Promise<any[]> {
  const data = await fetchCatalogPage(type, 1);
  const items = (data.items || []).filter((i: any) =>
    i.poster_path && !i.poster_path.includes("no-poster") && !i.poster_path.includes("placeholder")
  );
  return items.slice(0, limit);
}

// ========== CineVeo helpers ==========
async function fetchCineVeoPage(type: string, page: number): Promise<{ items: any[]; totalPages: number }> {
  try {
    const url = `${CINEVEO_API}?username=${CINEVEO_USER}&password=${CINEVEO_PASS}&type=${type}&page=${page}`;
    const res = await fetch(url, {
      headers: { "User-Agent": CINEVEO_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { items: [], totalPages: 0 };
    const payload = await res.json();
    const items = Array.isArray(payload?.data) ? payload.data : [];
    const totalPages = payload?.pagination?.total_pages || 1;
    return { items, totalPages };
  } catch {
    return { items: [], totalPages: 0 };
  }
}

// Fetch doramas from CineVeo (type=dorama)
async function getCineVeoDoramas(page = 1): Promise<{ items: any[]; total_pages: number }> {
  const { items, totalPages } = await fetchCineVeoPage("dorama", page);
  const mapped = items
    .filter((i: any) => i.poster && !i.poster.includes("no-poster"))
    .map((i: any) => ({
      id: i.tmdb_id || i.id,
      tmdb_id: Number(i.tmdb_id) || 0,
      title: i.title || "",
      poster_path: i.poster?.startsWith("/") ? i.poster : (i.poster?.includes("image.tmdb.org") ? i.poster.split("image.tmdb.org/t/p/")[1]?.replace(/^w\d+/, "") : i.poster),
      backdrop_path: i.backdrop || null,
      vote_average: Number(i.rating) || 0,
      release_date: i.year ? `${i.year}-01-01` : "",
      media_type: "tv",
      content_type: "dorama",
    }));
  return { items: mapped, total_pages: totalPages };
}

// Search CineVeo for a specific series by tmdb_id
async function getCineVeoSeriesDetail(tmdbId: number): Promise<any | null> {
  try {
    for (let page = 1; page <= 80; page++) {
      const { items, totalPages } = await fetchCineVeoPage("series", page);
      for (const item of items) {
        if (Number(item.tmdb_id) === tmdbId) return item;
      }
      if (page >= totalPages) break;
    }
    // Also search in movies (some series are classified as movies in CineVeo)
    for (let page = 1; page <= 80; page++) {
      const { items, totalPages } = await fetchCineVeoPage("movies", page);
      for (const item of items) {
        if (Number(item.tmdb_id) === tmdbId) return item;
      }
      if (page >= totalPages) break;
    }
  } catch (e) {
    console.error(`[app-catalog] CineVeo search error: ${e}`);
  }
  return null;
}

// ========== Normalize + strip items for Android compatibility ==========
// Only send fields the Android parser needs — prevents Gson crashes from
// unexpected arrays (genre_ids, origin_country) or null primitives.
function normalizeItem(item: any, fallbackMediaType?: string): any {
  const title = item.title || item.name || "";
  const releaseDate = item.release_date || item.first_air_date || "";
  const mediaType = item.media_type || fallbackMediaType || "";
  let id = item.id;
  if (typeof id === "string" && item.tmdb_id) id = Number(item.tmdb_id) || 0;
  if (typeof id === "string") id = parseInt(id, 10) || 0;

  return {
    id: typeof id === "number" ? id : 0,
    tmdb_id: Number(item.tmdb_id || item.id) || 0,
    title,
    poster_path: item.poster_path || null,
    backdrop_path: item.backdrop_path || null,
    vote_average: Number(item.vote_average) || 0,
    release_date: releaseDate,
    media_type: mediaType,
    overview: item.overview || "",
    content_type: item.content_type || null,
  };
}

function normalizeItems(items: any[], fallbackMediaType?: string): any[] {
  return items.map(i => normalizeItem(i, fallbackMediaType));
}

// ========== Rate limiting ==========
const rateMap = new Map<string, { count: number; resetAt: number }>();
function checkRate(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  entry.count++;
  return entry.count <= 120;
}

// ========== Supabase client for settings ==========
function getSupabaseAdmin() {
  const { createClient } = await_import;
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

let await_import: any;

// ========== Main handler ==========
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Lazy import
  if (!await_import) {
    await_import = await import("https://esm.sh/@supabase/supabase-js@2");
  }

  const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRate(clientIP)) {
    return json({ error: "Rate limited" }, 429);
  }

  // ── GET requests for app status checks (lightweight, no body parsing) ──
  const url = new URL(req.url);
  const queryAction = url.searchParams.get("action");

  if (queryAction === "maintenance" || queryAction === "update" || queryAction === "status") {
    const sb = getSupabaseAdmin();

    if (queryAction === "maintenance") {
      const { data } = await sb.from("site_settings").select("value").eq("key", "app_maintenance").maybeSingle();
      const c = (data?.value as any) || {};
      return json({
        enabled: c.enabled || false,
        message: c.message || "Estamos em manutenção. Voltamos em breve!",
        estimated_minutes: c.estimated_minutes || 30,
        block_access: c.block_access || false,
        updated_at: c.updated_at || null,
      });
    }

    if (queryAction === "update") {
      const { data } = await sb.from("site_settings").select("value").eq("key", "app_update").maybeSingle();
      const c = (data?.value as any) || {};
      return json({
        current_version: c.current_version || "1.0.0",
        new_version: c.new_version || c.current_version || "1.0.0",
        min_version: c.min_version || "1.0.0",
        release_notes: c.release_notes || "",
        force_update: c.force_update || false,
        apk_url: c.apk_url || "",
        published_at: c.published_at || null,
      });
    }

    if (queryAction === "status") {
      const [maintRes, updateRes] = await Promise.all([
        sb.from("site_settings").select("value").eq("key", "app_maintenance").maybeSingle(),
        sb.from("site_settings").select("value").eq("key", "app_update").maybeSingle(),
      ]);
      const m = (maintRes.data?.value as any) || {};
      const u = (updateRes.data?.value as any) || {};
      return json({
        maintenance: {
          enabled: m.enabled || false,
          message: m.message || "Estamos em manutenção. Voltamos em breve!",
          estimated_minutes: m.estimated_minutes || 30,
          block_access: m.block_access || false,
        },
        update: {
          current_version: u.current_version || "1.0.0",
          new_version: u.new_version || u.current_version || "1.0.0",
          min_version: u.min_version || "1.0.0",
          release_notes: u.release_notes || "",
          force_update: u.force_update || false,
          apk_url: u.apk_url || "",
        },
      });
    }
  }

  try {
    const body = await req.json();
    const { action, data = {} } = body;

    switch (action) {
      // ====== HOME (matches website Index.tsx exactly) ======
      case "home": {
        const [trending, nowPlaying, popularMovies, popularSeries, releases, animes, recentMovies, recentSeries] = await Promise.all([
          getTrending().catch(() => []),
          getNowPlaying().catch(() => []),
          getPopularMovies().then(d => d.results).catch(() => []),
          getPopularSeries().then(d => d.results).catch(() => []),
          getReleases2026().catch(() => []),
          getAnimesTMDB().then(d => d.results).catch(() => []),
          fetchCatalogRow("movie", 10).catch(() => []),
          fetchCatalogRow("series", 10).catch(() => []),
        ]);

        // Doramas from CineVeo (separate to not block main fetches)
        let doramas: any[] = [];
        try {
          const cv = await getCineVeoDoramas(1);
          doramas = cv.items.slice(0, 20);
        } catch { /* ignore */ }

        // Recently added from Storage catalog
        const recentlyAdded = [...recentMovies, ...recentSeries]
          .filter((i: any) => i.poster_path && i.backdrop_path && i.release_date !== "0001-01-01")
          .sort((a: any, b: any) => (b.release_date || "").localeCompare(a.release_date || ""))
          .slice(0, 20);

        // Hero slider: 2026 releases or trending
        const heroSlider = releases.length >= 3 ? releases : trending;

        return json({
          hero_slider: normalizeItems(heroSlider.slice(0, 8), "movie"),
          sections: [
            { id: "em_alta", title: "Em Alta", items: normalizeItems(nowPlaying.slice(0, 20)) },
            { id: "ultimos_adicionados", title: "Últimos Adicionados", items: normalizeItems(recentlyAdded) },
            { id: "filmes_populares", title: "Filmes Populares", items: normalizeItems(popularMovies.slice(0, 20), "movie") },
            { id: "series_populares", title: "Séries Populares", items: normalizeItems(popularSeries.slice(0, 20), "tv") },
            { id: "doramas", title: "Doramas", items: normalizeItems(doramas, "tv") },
            { id: "animes", title: "Animes", items: normalizeItems(animes.slice(0, 20), "tv") },
          ],
        });
      }

      // ====== MOVIES (paginated via TMDB, same as site /filmes) ======
      // Returns 21 items per page so Android 3-column grid has complete rows
      case "movies": {
        const page = data.page || 1;
        const genreId = data.genre_id || undefined;
        const year = data.year || undefined;

        let result;
        if (year) {
          const params: Record<string, string> = { sort_by: "popularity.desc", page: String(page) };
          if (genreId) params.with_genres = String(genreId);
          params["primary_release_date.gte"] = `${year}-01-01`;
          params["primary_release_date.lte"] = `${year}-12-31`;
          const d = await tmdbFetch("/discover/movie", params);
          result = { results: d?.results?.filter((m: any) => m.poster_path) || [], total_pages: d?.total_pages || 1 };
        } else {
          result = await getPopularMovies(page, genreId);
        }

        // Fetch 1 extra item from next page to make 21 (divisible by 3)
        let items = result.results;
        if (items.length === 20 && page < result.total_pages) {
          try {
            let nextResult;
            if (year) {
              const params: Record<string, string> = { sort_by: "popularity.desc", page: String(page + 1) };
              if (genreId) params.with_genres = String(genreId);
              params["primary_release_date.gte"] = `${year}-01-01`;
              params["primary_release_date.lte"] = `${year}-12-31`;
              const d = await tmdbFetch("/discover/movie", params);
              nextResult = d?.results?.filter((m: any) => m.poster_path) || [];
            } else {
              nextResult = (await getPopularMovies(page + 1, genreId)).results;
            }
            if (nextResult.length > 0) items = [...items, nextResult[0]];
          } catch { /* keep 20 if extra fetch fails */ }
        }

        // Trim to nearest multiple of 3 for complete grid rows
        const normalized = normalizeItems(items, "movie");
        const trimmed = normalized.slice(0, Math.floor(normalized.length / 3) * 3);
        return json({ items: trimmed, page, total_pages: Math.min(result.total_pages, 500) });
      }

      // ====== SERIES (paginated via TMDB, same as site /series) ======
      // Returns 21 items per page so Android 3-column grid has complete rows
      case "series": {
        const page = data.page || 1;
        const genreId = data.genre_id || undefined;
        const year = data.year || undefined;

        let result;
        if (year) {
          const params: Record<string, string> = { sort_by: "popularity.desc", page: String(page) };
          if (genreId) params.with_genres = String(genreId);
          params["first_air_date.gte"] = `${year}-01-01`;
          params["first_air_date.lte"] = `${year}-12-31`;
          const d = await tmdbFetch("/discover/tv", params);
          result = { results: d?.results?.filter((m: any) => m.poster_path) || [], total_pages: d?.total_pages || 1 };
        } else {
          result = await getPopularSeries(page, genreId);
        }

        // Fetch 1 extra item from next page to make 21 (divisible by 3)
        let items = result.results;
        if (items.length === 20 && page < result.total_pages) {
          try {
            let nextResult;
            if (year) {
              const params: Record<string, string> = { sort_by: "popularity.desc", page: String(page + 1) };
              if (genreId) params.with_genres = String(genreId);
              params["first_air_date.gte"] = `${year}-01-01`;
              params["first_air_date.lte"] = `${year}-12-31`;
              const d = await tmdbFetch("/discover/tv", params);
              nextResult = d?.results?.filter((m: any) => m.poster_path) || [];
            } else {
              nextResult = (await getPopularSeries(page + 1, genreId)).results;
            }
            if (nextResult.length > 0) items = [...items, nextResult[0]];
          } catch { /* keep 20 if extra fetch fails */ }
        }

        // Trim to nearest multiple of 3 for complete grid rows
        const normalizedS = normalizeItems(items, "tv");
        const trimmedS = normalizedS.slice(0, Math.floor(normalizedS.length / 3) * 3);
        return json({ items: trimmedS, page, total_pages: Math.min(result.total_pages, 500) });
      }

      // ====== DORAMAS (from CineVeo API directly) ======
      case "doramas": {
        const page = data.page || 1;
        const result = await getCineVeoDoramas(page);
        return json({ items: normalizeItems(result.items, "tv"), page, total_pages: result.total_pages });
      }

      // ====== ANIMES (TMDB discover, same as site) ======
      // Returns 21 items per page so Android 3-column grid has complete rows
      case "animes": {
        const page = data.page || 1;
        const result = await getAnimesTMDB(page);

        // Fetch 1 extra item from next page to make 21 (divisible by 3)
        let items = result.results;
        if (items.length === 20 && page < result.total_pages) {
          try {
            const nextResult = await getAnimesTMDB(page + 1);
            if (nextResult.results.length > 0) items = [...items, nextResult.results[0]];
          } catch { /* keep 20 if extra fetch fails */ }
        }

        // Trim to nearest multiple of 3 for complete grid rows
        const normalizedA = normalizeItems(items, "tv");
        const trimmedA = normalizedA.slice(0, Math.floor(normalizedA.length / 3) * 3);
        return json({ items: trimmedA, page, total_pages: Math.min(result.total_pages, 500) });
      }

      // ====== DETAIL (TMDB + CineVeo for series episodes) ======
      case "detail": {
        const tmdbId = data.tmdb_id;
        const type = data.type || "movie";
        if (!tmdbId) return json({ error: "tmdb_id required" }, 400);

        const isSeries = type === "series" || type === "tv";
        const tmdbDetail = isSeries
          ? await getSeriesDetail(tmdbId)
          : await getMovieDetail(tmdbId);

        if (!tmdbDetail) return json({ error: "Not found on TMDB" }, 404);

        let cineveoData: any = null;
        let episodes: any[] = [];
        let seasonsCount = tmdbDetail.number_of_seasons || 0;

        if (isSeries) {
          cineveoData = await getCineVeoSeriesDetail(tmdbId);
          if (cineveoData) {
            seasonsCount = cineveoData.seasons_count || seasonsCount;
            if (Array.isArray(cineveoData.episodes)) {
              episodes = cineveoData.episodes;
            }
          }
        }

        return json({
          tmdb_id: tmdbId,
          title: tmdbDetail.title || tmdbDetail.name || "",
          original_title: tmdbDetail.original_title || tmdbDetail.original_name || "",
          overview: tmdbDetail.overview || "",
          poster_path: tmdbDetail.poster_path,
          backdrop_path: tmdbDetail.backdrop_path,
          vote_average: tmdbDetail.vote_average || 0,
          release_date: tmdbDetail.release_date || tmdbDetail.first_air_date || "",
          runtime: tmdbDetail.runtime || tmdbDetail.episode_run_time?.[0] || 0,
          genres: tmdbDetail.genres?.map((g: any) => g.name).join(", ") || "",
          imdb_id: tmdbDetail.imdb_id || tmdbDetail.external_ids?.imdb_id || null,
          tagline: tmdbDetail.tagline || "",
          type: isSeries ? "series" : "movie",
          number_of_seasons: seasonsCount,
          number_of_episodes: tmdbDetail.number_of_episodes || 0,
          cineveo_episodes: episodes,
          cast: (tmdbDetail.credits?.cast || []).slice(0, 15).map((c: any) => ({
            name: c.name, character: c.character, profile_path: c.profile_path,
          })),
          similar: (tmdbDetail.similar?.results || []).slice(0, 10).map((s: any) => ({
            id: s.id, title: s.title || s.name, poster_path: s.poster_path,
            vote_average: s.vote_average, media_type: s.title ? "movie" : "tv",
          })),
          trailers: (tmdbDetail.videos?.results || [])
            .filter((v: any) => v.site === "YouTube").slice(0, 3)
            .map((v: any) => ({ key: v.key, name: v.name, type: v.type })),
        });
      }

      // ====== SEASON DETAIL (TMDB episodes + CineVeo stream URLs) ======
      case "season": {
        const tmdbId = data.tmdb_id;
        const season = data.season;
        if (!tmdbId || !season) return json({ error: "tmdb_id and season required" }, 400);

        const [tmdbSeason, cineveoSeries] = await Promise.all([
          getSeasonDetail(tmdbId, season),
          getCineVeoSeriesDetail(tmdbId),
        ]);

        const tmdbEpisodes = tmdbSeason?.episodes || [];
        const cineveoEpisodes = Array.isArray(cineveoSeries?.episodes) ? cineveoSeries.episodes : [];

        // Build CineVeo episodes map for this season
        const cvMap = new Map<number, string>();
        for (const ep of cineveoEpisodes) {
          if (Number(ep.season) === season) {
            cvMap.set(Number(ep.episode), ep.stream_url || "");
          }
        }

        const merged = tmdbEpisodes.map((ep: any) => ({
          episode_number: ep.episode_number,
          name: ep.name || `Episódio ${ep.episode_number}`,
          overview: ep.overview || "",
          still_path: ep.still_path,
          vote_average: ep.vote_average || 0,
          runtime: ep.runtime || 0,
          air_date: ep.air_date,
          stream_url: cvMap.get(ep.episode_number) || "",
        }));

        return json({
          tmdb_id: tmdbId,
          season_number: season,
          episodes: merged,
          total_episodes: merged.length,
        });
      }

      // ====== SEARCH ======
      case "search": {
        const query = data.query;
        if (!query || query.length < 2) return json({ error: "query min 2 chars" }, 400);
        const results = await searchTMDB(query);
        return json({ results: normalizeItems(results.slice(0, 30)) });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (error: any) {
    console.error("[app-catalog] Error:", error);
    return json({ error: error.message || "Internal error" }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=120" },
  });
}
