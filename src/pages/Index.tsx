import { useEffect, useState } from "react";
import { Flame, Film, Tv } from "lucide-react";
import Navbar from "@/components/Navbar";
import HeroSlider from "@/components/HeroSlider";
import ContentRow from "@/components/ContentRow";
import ContinueWatchingRow from "@/components/ContinueWatchingRow";
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

      <footer className="border-t border-white/5 py-6 sm:py-8 px-4 sm:px-6 lg:px-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="font-display font-bold text-lg">
            Cine<span className="text-gradient">flow</span>
          </span>
          <p className="text-muted-foreground text-[10px] sm:text-xs max-w-2xl leading-relaxed">
            AVISO LEGAL: Nós não armazenamos nenhum dos arquivos em nenhum servidor. Todos os conteúdos são fornecidos por terceiros sem qualquer tipo de filiação.
          </p>
          <p className="text-muted-foreground text-[10px] sm:text-xs">© 2025 Cineflow. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
