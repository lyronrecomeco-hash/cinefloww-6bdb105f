import { useEffect, useState } from "react";
import { Flame, Film, Tv, Heart, Sparkles, Baby } from "lucide-react";
import Navbar from "@/components/Navbar";
import HeroSlider from "@/components/HeroSlider";
import ContentRow from "@/components/ContentRow";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import {
  TMDBMovie,
  TMDBList,
  getTrending,
  getPopularMovies,
  getPopularSeries,
  getNowPlayingMovies,
  getAiringTodaySeries,
  discoverMovies,
  discoverSeries,
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
  const [isKidsMode] = useState(() => {
    try {
      const raw = localStorage.getItem("lyneflix_active_profile");
      if (raw) return !!JSON.parse(raw).is_kids;
    } catch {}
    return false;
  });

  // Kids-specific state
  const [kidsAnimatedMovies, setKidsAnimatedMovies] = useState<TMDBMovie[]>([]);
  const [kidsAnimatedSeries, setKidsAnimatedSeries] = useState<TMDBMovie[]>([]);
  const [kidsFamilyMovies, setKidsFamilyMovies] = useState<TMDBMovie[]>([]);
  const [kidsPopular, setKidsPopular] = useState<TMDBMovie[]>([]);

  useEffect(() => {
    if (isKidsMode) {
      // Kids mode: load kids-specific content from TMDB
      // Genre 16 = Animation, 10751 = Family
      Promise.allSettled([
        discoverMovies(1, { with_genres: "16", sort_by: "popularity.desc", "vote_average.gte": "5" }),
        discoverSeries(1, { with_genres: "16", sort_by: "popularity.desc", "vote_average.gte": "5" }),
        discoverMovies(1, { with_genres: "10751", sort_by: "popularity.desc", "vote_average.gte": "6" }),
        discoverMovies(2, { with_genres: "16", sort_by: "popularity.desc", "vote_average.gte": "5" }),
        discoverSeries(2, { with_genres: "16", sort_by: "popularity.desc", "vote_average.gte": "5" }),
        getTrending(),
      ]).then((results) => {
        const animMovies = results[0].status === "fulfilled" ? results[0].value.results : [];
        const animSeries = results[1].status === "fulfilled" ? results[1].value.results : [];
        const famMovies = results[2].status === "fulfilled" ? results[2].value.results : [];
        const animMovies2 = results[3].status === "fulfilled" ? results[3].value.results : [];
        const animSeries2 = results[4].status === "fulfilled" ? results[4].value.results : [];
        const trendingAll = results[5].status === "fulfilled" ? results[5].value.results : [];

        // Filter trending for kids-friendly (animation/family genres)
        const kidsGenres = new Set([16, 10751, 10762]);
        const kidsTrending = trendingAll.filter(m => m.genre_ids?.some(g => kidsGenres.has(g)));

        setKidsAnimatedMovies(sortByYear([...animMovies, ...animMovies2]));
        setKidsAnimatedSeries(sortByYear([...animSeries, ...animSeries2]));
        setKidsFamilyMovies(sortByYear(famMovies));
        setKidsPopular(kidsTrending.length > 0 ? kidsTrending : sortByYear(animMovies.slice(0, 10)));
        setTrending(kidsTrending.length >= 3 ? kidsTrending : animMovies.slice(0, 6));
        setSectionsReady(true);
        setLoading(false);
      });
      return;
    }

    // Normal mode
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
          id: d.tmdb_id, name: d.title, poster_path: d.poster_path,
          backdrop_path: d.backdrop_path, overview: "", vote_average: d.vote_average || 0,
          first_air_date: d.release_date, genre_ids: [], media_type: "tv",
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
          id: d.tmdb_id, name: d.title, poster_path: d.poster_path,
          backdrop_path: d.backdrop_path, overview: "", vote_average: d.vote_average || 0,
          first_air_date: d.release_date, genre_ids: [], media_type: "tv",
        })));
      }
    };

    // Load hero first (fast TMDB call), then sections
    getTrending().then((t) => {
      if (t?.results) setTrending(t.results);
      setLoading(false);
    }).catch(() => setLoading(false));

    // Load sections in parallel — independent of hero
    Promise.allSettled([
      getNowPlayingMovies(), getAiringTodaySeries(),
      getPopularMovies(), getPopularSeries(),
      loadDoramas(), loadAnimes(),
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
    }).catch(() => setSectionsReady(true));
  }, [isKidsMode]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isKidsMode) {
    return (
      <div className="min-h-screen bg-background animate-page-enter">
        <Navbar />
        <HeroSlider movies={trending} />

        <div className="mt-4 sm:mt-6 lg:mt-8 relative z-10 pb-12 sm:pb-20 space-y-1 sm:space-y-2">
          {/* Kids mode banner */}
          <div className="flex items-center gap-2 px-4 sm:px-6 lg:px-12 mb-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/15 border border-green-500/30">
              <Baby className="w-4 h-4 text-green-400" />
              <span className="text-xs font-semibold text-green-400">Modo Criança Ativo</span>
            </div>
          </div>

          {sectionsReady ? (
            <>
              {kidsPopular.length > 0 && (
                <ContentRow title="🌟 Populares para Crianças" movies={kidsPopular} icon={<Sparkles className="w-4 h-4" />} />
              )}
              {kidsAnimatedMovies.length > 0 && (
                <ContentRow title="🎬 Filmes Animados" movies={kidsAnimatedMovies} icon={<Film className="w-4 h-4" />} />
              )}
              {kidsAnimatedSeries.length > 0 && (
                <ContentRow title="📺 Séries Animadas" movies={kidsAnimatedSeries} icon={<Tv className="w-4 h-4" />} />
              )}
              {kidsFamilyMovies.length > 0 && (
                <ContentRow title="👨‍👩‍👧‍👦 Filmes em Família" movies={kidsFamilyMovies} icon={<Heart className="w-4 h-4" />} />
              )}
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
