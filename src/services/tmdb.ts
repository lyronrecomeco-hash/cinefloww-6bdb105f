const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI1MDFiOWNkYjllNDQ0NjkxMDJiODk5YjQ0YjU2MWQ5ZCIsIm5iZiI6MTc3MTIzMDg1My43NjYsInN1YiI6IjY5OTJkNjg1NzZjODAxNTdmMjFhZjMxMSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.c47JvphccOz_oyaUuQWCHQ1mXAsSH01OB14vKE2uenw";
const BASE_URL = "https://api.themoviedb.org/3";
export const IMG_BASE = "https://image.tmdb.org/t/p";

const headers = {
  Authorization: `Bearer ${TMDB_TOKEN}`,
  "Content-Type": "application/json",
};

async function fetchTMDB<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.set("language", "pt-BR");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
  return res.json();
}

// Types
export interface TMDBMovie {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids: number[];
  media_type?: string;
}

export interface TMDBMovieDetail {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  runtime?: number;
  number_of_seasons?: number;
  number_of_episodes?: number;
  genres: { id: number; name: string }[];
  tagline?: string;
  status: string;
  imdb_id?: string | null;
  external_ids?: { imdb_id?: string | null };
  credits?: {
    cast: { id: number; name: string; character: string; profile_path: string | null }[];
    crew: { id: number; name: string; job: string }[];
  };
  seasons?: { id: number; name: string; season_number: number; episode_count: number; poster_path: string | null; air_date: string | null }[];
  similar?: { results: TMDBMovie[] };
  videos?: { results: { key: string; site: string; type: string }[] };
  images?: { backdrops: { file_path: string; width: number }[]; posters: { file_path: string }[] };
}

export interface TMDBSeason {
  id: number;
  name: string;
  season_number: number;
  episodes: TMDBEpisode[];
}

export interface TMDBEpisode {
  id: number;
  name: string;
  episode_number: number;
  season_number: number;
  overview: string;
  still_path: string | null;
  air_date: string | null;
  runtime: number | null;
  vote_average: number;
}

export interface TMDBList {
  results: TMDBMovie[];
  total_pages: number;
  total_results: number;
}

// Endpoints
export const getTrending = (page = 1) => fetchTMDB<TMDBList>("/trending/all/week", { page: String(page) });
export const getPopularMovies = (page = 1, genreId?: number) => {
  const params: Record<string, string> = { page: String(page) };
  if (genreId) params.with_genres = String(genreId);
  return fetchTMDB<TMDBList>(genreId ? "/discover/movie" : "/movie/popular", params);
};
export const getPopularSeries = (page = 1, genreId?: number) => {
  const params: Record<string, string> = { page: String(page) };
  if (genreId) params.with_genres = String(genreId);
  return fetchTMDB<TMDBList>(genreId ? "/discover/tv" : "/tv/popular", params);
};
export const getTopRatedMovies = (page = 1) => fetchTMDB<TMDBList>("/movie/top_rated", { page: String(page) });
export const getTopRatedSeries = (page = 1) => fetchTMDB<TMDBList>("/tv/top_rated", { page: String(page) });
export const getNowPlayingMovies = (page = 1) => fetchTMDB<TMDBList>("/movie/now_playing", { page: String(page) });
export const getAiringTodaySeries = (page = 1) => fetchTMDB<TMDBList>("/tv/airing_today", { page: String(page) });

export const getMovieDetails = (id: number) =>
  fetchTMDB<TMDBMovieDetail>(`/movie/${id}`, { append_to_response: "credits,similar,videos,images" });

export const getSeriesDetails = (id: number) =>
  fetchTMDB<TMDBMovieDetail>(`/tv/${id}`, { append_to_response: "credits,similar,videos,images,external_ids" });

export const getSeasonDetails = (seriesId: number, seasonNumber: number) =>
  fetchTMDB<TMDBSeason>(`/tv/${seriesId}/season/${seasonNumber}`);

export const searchMulti = (query: string) =>
  fetchTMDB<TMDBList>("/search/multi", { query });

export const posterUrl = (path: string | null, size = "w500") =>
  path ? `${IMG_BASE}/${size}${path}` : "/placeholder.svg";

export const backdropUrl = (path: string | null, size = "w1280") =>
  path ? `${IMG_BASE}/${size}${path}` : "/placeholder.svg";

export const getDisplayTitle = (item: TMDBMovie | TMDBMovieDetail) =>
  item.title || item.name || "Sem título";

export const getYear = (item: TMDBMovie | TMDBMovieDetail) => {
  const date = (item as any).release_date || (item as any).first_air_date;
  return date ? new Date(date).getFullYear() : "";
};

export const getMediaType = (item: TMDBMovie): "movie" | "tv" => {
  if (item.media_type) return item.media_type as "movie" | "tv";
  return item.title ? "movie" : "tv";
};
