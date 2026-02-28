import { useEffect, useState } from "react";
import { Flame, Film, Tv, Heart, Sparkles, Clock } from "lucide-react";
import Navbar from "@/components/Navbar";
import HeroSlider from "@/components/HeroSlider";
import ContentRow from "@/components/ContentRow";
import Footer from "@/components/Footer";
import { fetchCatalogRow } from "@/lib/catalogFetcher";
import {
  TMDBMovie,
  getTrending,
  getPopularMovies,
  getPopularSeries,
  getNowPlayingMovies,
  getAiringTodaySeries,
  discoverMovies,
  getYear,
} from "@/services/tmdb";

const sortByYear = (items: TMDBMovie[]) =>
  [...items].sort((a, b) => {
    const ya = getYear(a) || 0;
    const yb = getYear(b) || 0;
    return Number(yb) - Number(ya);
  });

const Index = () => {
  const [trending, setTrending] = useState<TMDBMovie[]>([]);
  const [heroSlider, setHeroSlider] = useState<TMDBMovie[]>([]);
  const [nowPlaying, setNowPlaying] = useState<TMDBMovie[]>([]);
  const [popularMovies, setPopularMovies] = useState<TMDBMovie[]>([]);
  const [popularSeries, setPopularSeries] = useState<TMDBMovie[]>([]);
  const [doramas, setDoramas] = useState<TMDBMovie[]>([]);
  const [animes, setAnimes] = useState<TMDBMovie[]>([]);
  const [recentlyAdded, setRecentlyAdded] = useState<TMDBMovie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const mapToTMDB = (items: any[]): TMDBMovie[] =>
      items.map((d) => ({
        id: d.tmdb_id,
        name: d.title,
        poster_path: d.poster_path,
        backdrop_path: d.backdrop_path,
        overview: "",
        vote_average: d.vote_average || 0,
        first_air_date: d.release_date,
        genre_ids: [],
        media_type: (d.content_type === "movie" ? "movie" : "tv") as "movie" | "tv",
      }));

    let done = false;
    const finish = () => { if (!done) { done = true; setLoading(false); } };
    const safetyTimer = setTimeout(finish, 4000);

    const race = <T,>(p: Promise<T>, fallback: T) =>
      Promise.race([p, new Promise<T>(r => setTimeout(() => r(fallback), 4000))]).catch(() => fallback);

    const empty = { results: [] as TMDBMovie[], total_pages: 0, total_results: 0 };

    Promise.all([
      race(getTrending(), empty),
      race(getNowPlayingMovies(), empty),
      race(getAiringTodaySeries(), empty),
      race(getPopularMovies(), empty),
      race(getPopularSeries(), empty),
      race(discoverMovies(1, {
        "primary_release_date.gte": "2026-01-01",
        "primary_release_date.lte": "2026-12-31",
        sort_by: "popularity.desc",
      }), empty),
    ]).then(([t, np, at, pm, ps, releases2026]) => {
      setTrending(t.results);
      const heroItems = releases2026.results.filter((m) => m.backdrop_path);
      setHeroSlider(heroItems.length >= 3 ? heroItems : t.results);
      const launches = [...np.results.slice(0, 10), ...at.results.slice(0, 10)];
      setNowPlaying(sortByYear(launches));
      setPopularMovies(sortByYear(pm.results));
      setPopularSeries(sortByYear(ps.results));
      finish();
    }).catch(finish);

    // Load catalog rows separately (non-blocking)
    fetchCatalogRow("dorama", 20).then(items => setDoramas(mapToTMDB(items))).catch(() => {});
    fetchCatalogRow("anime", 20).then(items => setAnimes(mapToTMDB(items))).catch(() => {});

    // Recently added — fetch latest from all catalog types
    Promise.all([
      fetchCatalogRow("movie", 10).catch(() => []),
      fetchCatalogRow("series", 10).catch(() => []),
    ]).then(([movies, series]) => {
      const all = [...movies, ...series]
        .sort((a, b) => (b.release_date || "").localeCompare(a.release_date || ""))
        .slice(0, 20);
      setRecentlyAdded(mapToTMDB(all));
    }).catch(() => {});

    return () => clearTimeout(safetyTimer);
  }, []);

  return (
    <div className="min-h-screen bg-background animate-page-enter">
      <Navbar />
      {loading ? (
        <div className="w-full aspect-[16/7] bg-muted animate-pulse" />
      ) : (
        <HeroSlider movies={heroSlider} />
      )}

      <div className="mt-4 sm:mt-6 lg:mt-8 relative z-10 pb-12 sm:pb-20 space-y-1 sm:space-y-2" style={{ contentVisibility: "auto", containIntrinsicSize: "0 500px" }}>
        <ContentRow title="Em Alta" movies={nowPlaying} icon={<Flame className="w-4 h-4" />} loading={loading} />
        {recentlyAdded.length > 0 && <ContentRow title="Últimos Adicionados" movies={recentlyAdded} icon={<Clock className="w-4 h-4" />} />}
        <ContentRow title="Filmes Populares" movies={popularMovies} icon={<Film className="w-4 h-4" />} loading={loading} />
        <ContentRow title="Séries Populares" movies={popularSeries} icon={<Tv className="w-4 h-4" />} loading={loading} />
        {doramas.length > 0 && <ContentRow title="Doramas" movies={doramas} icon={<Heart className="w-4 h-4" />} />}
        {animes.length > 0 && <ContentRow title="Animes" movies={animes} icon={<Sparkles className="w-4 h-4" />} />}
      </div>

      <Footer />
    </div>
  );
};

export default Index;
