import { useEffect, useState } from "react";
import { Flame, Film, Tv, Heart, Sparkles } from "lucide-react";
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
  const [nowPlaying, setNowPlaying] = useState<TMDBMovie[]>([]);
  const [popularMovies, setPopularMovies] = useState<TMDBMovie[]>([]);
  const [popularSeries, setPopularSeries] = useState<TMDBMovie[]>([]);
  const [doramas, setDoramas] = useState<TMDBMovie[]>([]);
  const [animes, setAnimes] = useState<TMDBMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionsReady, setSectionsReady] = useState(false);

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
        media_type: "tv" as const,
      }));

    let done = false;
    const finish = () => { if (!done) { done = true; setLoading(false); setSectionsReady(true); } };

    // Hard timeout: never stay loading >4s
    const safetyTimer = setTimeout(finish, 4000);

    // Load TMDB rows with individual race timeouts
    const race = <T,>(p: Promise<T>, fallback: T) =>
      Promise.race([p, new Promise<T>(r => setTimeout(() => r(fallback), 4000))]).catch(() => fallback);

    const empty = { results: [] as TMDBMovie[], total_pages: 0, total_results: 0 };

    Promise.all([
      race(getTrending(), empty),
      race(getNowPlayingMovies(), empty),
      race(getAiringTodaySeries(), empty),
      race(getPopularMovies(), empty),
      race(getPopularSeries(), empty),
    ]).then(([t, np, at, pm, ps]) => {
      setTrending(t.results);
      const launches = [...np.results.slice(0, 10), ...at.results.slice(0, 10)];
      setNowPlaying(sortByYear(launches));
      setPopularMovies(sortByYear(pm.results));
      setPopularSeries(sortByYear(ps.results));
      finish();
    }).catch(finish);

    // Load catalog rows separately (non-blocking)
    fetchCatalogRow("dorama", 20).then(items => setDoramas(mapToTMDB(items))).catch(() => {});
    fetchCatalogRow("anime", 20).then(items => setAnimes(mapToTMDB(items))).catch(() => {});

    return () => clearTimeout(safetyTimer);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background animate-page-enter">
      <Navbar />
      <HeroSlider movies={trending} />

      <div className="mt-4 sm:mt-6 lg:mt-8 relative z-10 pb-12 sm:pb-20 space-y-1 sm:space-y-2" style={{ contentVisibility: "auto", containIntrinsicSize: "0 500px" }}>
        {sectionsReady ? (
          <>
            <ContentRow title="🔥 Em Alta" movies={nowPlaying} icon={<Flame className="w-4 h-4" />} />
            <ContentRow title="🎬 Filmes Populares" movies={popularMovies} icon={<Film className="w-4 h-4" />} />
            <ContentRow title="📺 Séries Populares" movies={popularSeries} icon={<Tv className="w-4 h-4" />} />
            {doramas.length > 0 && <ContentRow title="🌸 Doramas" movies={doramas} icon={<Heart className="w-4 h-4" />} />}
            {animes.length > 0 && <ContentRow title="⚡ Animes" movies={animes} icon={<Sparkles className="w-4 h-4" />} />}
          </>
        ) : (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default Index;
