import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Flame, Film, Tv, Tv2, ChevronLeft, ChevronRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import HeroSlider from "@/components/HeroSlider";
import ContentRow from "@/components/ContentRow";
import ContinueWatchingRow from "@/components/ContinueWatchingRow";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import {
  TMDBMovie,
  getTrending,
  getPopularMovies,
  getPopularSeries,
  getNowPlayingMovies,
  getAiringTodaySeries,
} from "@/services/tmdb";

interface TVChannel {
  id: string;
  name: string;
  image_url: string | null;
  category: string;
}

const TVRow = ({ channels }: { channels: TVChannel[] }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === "left" ? -300 : 300, behavior: "smooth" });
  };

  if (!channels.length) return null;

  return (
    <section className="mb-8 sm:mb-10 lg:mb-14">
      <div className="flex items-center justify-between px-3 sm:px-6 lg:px-12 mb-3 sm:mb-4 lg:mb-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
            <Tv2 className="w-4 h-4" />
          </div>
          <h2 className="font-display text-base sm:text-xl lg:text-2xl font-bold flex items-center gap-2">
            📡 TV LYNE
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/tv" className="text-xs text-primary hover:underline mr-2">Ver todos</Link>
          <div className="hidden sm:flex items-center gap-1">
            <button onClick={() => scroll("left")} className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => scroll("right")} className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      <div ref={scrollRef} className="flex gap-2.5 sm:gap-4 overflow-x-auto scrollbar-hide px-3 sm:px-6 lg:px-12 pb-2">
        {channels.map((ch) => (
          <button
            key={ch.id}
            onClick={() => navigate(`/tv/${ch.id}`)}
            className="flex-shrink-0 w-[140px] sm:w-[170px] group relative glass glass-hover rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.03]"
          >
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/90 backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
              </span>
              <span className="text-[8px] font-bold text-white uppercase tracking-wider">LIVE</span>
            </div>
            <div className="aspect-video flex items-center justify-center p-3 sm:p-4 bg-gradient-to-br from-white/[0.03] to-transparent">
              {ch.image_url ? (
                <img src={ch.image_url} alt={ch.name} className="w-full h-full object-contain max-h-12 sm:max-h-14 transition-transform duration-300 group-hover:scale-110" loading="lazy" />
              ) : (
                <Tv2 className="w-8 h-8 text-muted-foreground/30" />
              )}
            </div>
            <div className="px-2 pb-2 pt-0.5">
              <p className="text-[10px] sm:text-xs font-semibold line-clamp-1 text-foreground group-hover:text-primary transition-colors">{ch.name}</p>
              <p className="text-[9px] text-muted-foreground">{ch.category}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};

const Index = () => {
  const [trending, setTrending] = useState<TMDBMovie[]>([]);
  const [nowPlaying, setNowPlaying] = useState<TMDBMovie[]>([]);
  const [popularMovies, setPopularMovies] = useState<TMDBMovie[]>([]);
  const [popularSeries, setPopularSeries] = useState<TMDBMovie[]>([]);
  const [tvChannels, setTvChannels] = useState<TVChannel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getTrending(),
      getNowPlayingMovies(),
      getAiringTodaySeries(),
      getPopularMovies(),
      getPopularSeries(),
      supabase.from("tv_channels").select("id, name, image_url, category").eq("active", true).order("sort_order").limit(20),
    ]).then(([t, np, at, pm, ps, tvRes]) => {
      setTrending(t.results);
      const launches = [...np.results.slice(0, 10), ...at.results.slice(0, 10)];
      setNowPlaying(launches);
      setPopularMovies(pm.results);
      setPopularSeries(ps.results);
      setTvChannels((tvRes.data as TVChannel[]) || []);
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
        <TVRow channels={tvChannels} />
      </div>

      <Footer />
    </div>
  );
};

export default Index;
