import { useEffect, useState } from "react";
import { Flame, Film, Tv, Heart, Sparkles } from "lucide-react";
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
  const [popularMovies, setPopularMovies] = useState<TMDBMovie[]>([]);
  const [popularSeries, setPopularSeries] = useState<TMDBMovie[]>([]);
  const [doramas, setDoramas] = useState<TMDBMovie[]>([]);
  const [animes, setAnimes] = useState<TMDBMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionsReady, setSectionsReady] = useState(false);

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

    const loadAnimes = async () => {
      const { data } = await supabase
        .from("content")
        .select("tmdb_id, title, poster_path, backdrop_path, vote_average, release_date, content_type")
        .eq("content_type", "anime")
        .eq("status", "published")
        .order("release_date", { ascending: false, nullsFirst: false })
        .limit(20);
      if (data) {
        setAnimes(data.map((d: any) => ({
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

    // Load hero first for fast perceived load
    getTrending().then((t) => {
      setTrending(t.results);
      setLoading(false);
    }).catch(() => setLoading(false));

    // Load sections in parallel – never block on individual failures
    Promise.allSettled([
      getNowPlayingMovies(),
      getAiringTodaySeries(),
      getPopularMovies(),
      getPopularSeries(),
      loadDoramas(),
      loadAnimes(),
    ]).then((results) => {
      const np = results[0].status === "fulfilled" ? results[0].value : { results: [] };
      const at = results[1].status === "fulfilled" ? results[1].value : { results: [] };
      const pm = results[2].status === "fulfilled" ? results[2].value : { results: [] };
      const ps = results[3].status === "fulfilled" ? results[3].value : { results: [] };
      const launches = [...np.results.slice(0, 10), ...at.results.slice(0, 10)];
      setNowPlaying(sortByYear(launches));
      setPopularMovies(sortByYear(pm.results));
      setPopularSeries(sortByYear(ps.results));
      setSectionsReady(true);
    });
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

      <div className="mt-4 sm:mt-6 lg:mt-8 relative z-10 pb-12 sm:pb-20 space-y-1 sm:space-y-2">
        {sectionsReady ? (
          <>
            <ContentRow title="🔥 Em Alta" movies={nowPlaying} icon={<Flame className="w-4 h-4" />} />
            <ContentRow title="🎬 Filmes" movies={popularMovies} icon={<Film className="w-4 h-4" />} />
            <ContentRow title="📺 Séries" movies={popularSeries} icon={<Tv className="w-4 h-4" />} />
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
