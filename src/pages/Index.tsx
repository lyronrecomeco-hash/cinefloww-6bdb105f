import { useEffect, useState } from "react";
import { Flame, Film, Tv, Heart } from "lucide-react";
import Navbar from "@/components/Navbar";
import HeroSlider from "@/components/HeroSlider";
import ContentRow from "@/components/ContentRow";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
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
  const [releases2026, setReleases2026] = useState<TMDBMovie[]>([]);
  const [popularMovies, setPopularMovies] = useState<TMDBMovie[]>([]);
  const [popularSeries, setPopularSeries] = useState<TMDBMovie[]>([]);
  const [doramas, setDoramas] = useState<TMDBMovie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDoramas = async () => {
      const { data } = await supabase
        .from("content")
        .select("tmdb_id, title, poster_path, backdrop_path, vote_average, release_date, content_type")
        .eq("content_type", "dorama")
        .eq("status", "published")
        .order("release_date", { ascending: false, nullsFirst: false })
        .limit(20);
      if (data) {
        setDoramas(data.map((d: any) => ({
          id: d.tmdb_id,
          name: d.title,
          poster_path: d.poster_path,
          backdrop_path: d.backdrop_path,
          overview: "",
          vote_average: d.vote_average || 0,
          first_air_date: d.release_date,
          genre_ids: [],
          media_type: "tv",
        })));
      }
    };

    const loadReleases2026 = async () => {
      const { data } = await supabase
        .from("content")
        .select("tmdb_id, title, poster_path, backdrop_path, vote_average, release_date, content_type")
        .eq("status", "published")
        .gte("release_date", "2026-01-01")
        .lte("release_date", "2026-12-31")
        .order("release_date", { ascending: false, nullsFirst: false })
        .limit(30);
      if (data) {
        setReleases2026(data.map((d: any) => ({
          id: d.tmdb_id,
          name: d.title,
          poster_path: d.poster_path,
          backdrop_path: d.backdrop_path,
          overview: "",
          vote_average: d.vote_average || 0,
          first_air_date: d.release_date,
          release_date: d.release_date,
          genre_ids: [],
          media_type: d.content_type === "movie" ? "movie" : "tv",
        })));
      }
    };

    Promise.all([
      getTrending(),
      getNowPlayingMovies(),
      getAiringTodaySeries(),
      getPopularMovies(),
      getPopularSeries(),
      loadDoramas(),
      loadReleases2026(),
    ]).then(([t, np, at, pm, ps]) => {
      setTrending(t.results);
      const launches = [...np.results.slice(0, 10), ...at.results.slice(0, 10)];
      setNowPlaying(sortByYear(launches));
      setPopularMovies(sortByYear(pm.results));
      setPopularSeries(sortByYear(ps.results));
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
        {releases2026.length > 0 && <ContentRow title="🆕 Lançamentos 2026" movies={releases2026} icon={<Flame className="w-4 h-4" />} />}
        <ContentRow title="🔥 Em Alta" movies={nowPlaying} icon={<Flame className="w-4 h-4" />} />
        <ContentRow title="🎬 Filmes" movies={popularMovies} icon={<Film className="w-4 h-4" />} />
        <ContentRow title="📺 Séries" movies={popularSeries} icon={<Tv className="w-4 h-4" />} />
        {doramas.length > 0 && <ContentRow title="🌸 Doramas" movies={doramas} icon={<Heart className="w-4 h-4" />} />}
      </div>

      <Footer />
    </div>
  );
};

export default Index;
