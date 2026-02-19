import { useEffect, useState } from "react";
import { Flame, Film, Tv } from "lucide-react";
import Navbar from "@/components/Navbar";
import HeroSlider from "@/components/HeroSlider";
import ContentRow from "@/components/ContentRow";
import ContinueWatchingRow from "@/components/ContinueWatchingRow";
import Footer from "@/components/Footer";
import {
  TMDBMovie,
  getTrending,
  getPopularMovies,
  getPopularSeries,
  getNowPlayingMovies,
  getAiringTodaySeries,
} from "@/services/tmdb";

const Index = () => {
  const [trending, setTrending] = useState<TMDBMovie[]>([]);
  const [nowPlaying, setNowPlaying] = useState<TMDBMovie[]>([]);
  const [popularMovies, setPopularMovies] = useState<TMDBMovie[]>([]);
  const [popularSeries, setPopularSeries] = useState<TMDBMovie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getTrending(),
      getNowPlayingMovies(),
      getAiringTodaySeries(),
      getPopularMovies(),
      getPopularSeries(),
    ]).then(([t, np, at, pm, ps]) => {
      setTrending(t.results);
      const launches = [...np.results.slice(0, 10), ...at.results.slice(0, 10)];
      setNowPlaying(launches);
      setPopularMovies(pm.results);
      setPopularSeries(ps.results);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSlider movies={trending} />

      <div className="-mt-12 sm:-mt-16 relative z-10 pb-12 sm:pb-20 space-y-1 sm:space-y-2">
        <ContinueWatchingRow />
        <ContentRow title="🔥 Lançamentos" movies={nowPlaying} icon={<Flame className="w-4 h-4" />} />
        <ContentRow title="🎬 Filmes" movies={popularMovies} icon={<Film className="w-4 h-4" />} />
        <ContentRow title="📺 Séries" movies={popularSeries} icon={<Tv className="w-4 h-4" />} />
      </div>

      <Footer />
    </div>
  );
};

export default Index;
