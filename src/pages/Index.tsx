import { useEffect, useState } from "react";
import { Flame, Film, Tv } from "lucide-react";
import Navbar from "@/components/Navbar";
import HeroSlider from "@/components/HeroSlider";
import ContentRow from "@/components/ContentRow";
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
      // Merge now playing movies + airing today series for "Lançamentos"
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

      <div className="-mt-16 relative z-10 pb-20">
        <ContentRow title="Lançamentos" movies={nowPlaying} icon={<Flame className="w-4 h-4" />} />
        <ContentRow title="Filmes" movies={popularMovies} icon={<Film className="w-4 h-4" />} />
        <ContentRow title="Séries" movies={popularSeries} icon={<Tv className="w-4 h-4" />} />
      </div>

      <footer className="border-t border-white/5 py-8 px-4 sm:px-6 lg:px-12">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-display font-bold text-lg">
            Cine<span className="text-gradient">flow</span>
          </span>
          <p className="text-muted-foreground text-xs">© 2025 Cineflow. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
