import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ContentRow from "@/components/ContentRow";
import MobileBottomNav from "@/components/MobileBottomNav";
import { Sparkles, Flame, Clock, Star } from "lucide-react";
import { TMDBMovie, discoverSeries } from "@/services/tmdb";
import { isKidsModeEnabled, filterKidsTitles } from "@/lib/kidsMode";

const AnimesPage = () => {
  const [tmdbPopular, setTmdbPopular] = useState<TMDBMovie[]>([]);
  const [tmdbTopRated, setTmdbTopRated] = useState<TMDBMovie[]>([]);
  const [tmdbAiring, setTmdbAiring] = useState<TMDBMovie[]>([]);

  const kidsMode = isKidsModeEnabled();
  const filterK = (items: TMDBMovie[]) => kidsMode ? filterKidsTitles(items) : items;

  useEffect(() => {
    const empty = { results: [] as TMDBMovie[], total_pages: 0, total_results: 0 };
    const race = <T,>(p: Promise<T>, fallback: T) =>
      Promise.race([p, new Promise<T>(r => setTimeout(() => r(fallback), 4000))]).catch(() => fallback);

    Promise.all([
      race(discoverSeries(1, { with_genres: "16", sort_by: "popularity.desc", with_original_language: "ja" }), empty),
      race(discoverSeries(1, { with_genres: "16", sort_by: "vote_average.desc", with_original_language: "ja", "vote_count.gte": "200" }), empty),
      race(discoverSeries(1, { with_genres: "16", sort_by: "first_air_date.desc", with_original_language: "ja", "first_air_date.lte": new Date().toISOString().split("T")[0] }), empty),
    ]).then(([popular, topRated, airing]) => {
      setTmdbPopular(popular.results.filter(m => m.poster_path));
      setTmdbTopRated(topRated.results.filter(m => m.poster_path));
      setTmdbAiring(airing.results.filter(m => m.poster_path));
    });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-20 sm:pt-24 lg:pt-28 pb-20">
        <div className="px-3 sm:px-6 lg:px-12 mb-6 sm:mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold">{kidsMode ? "Animes Kids" : "Animes"}</h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Os melhores animes japoneses</p>
            </div>
          </div>
        </div>

        <div className="space-y-1 sm:space-y-2">
          {tmdbPopular.length > 0 && <ContentRow title="Populares" movies={filterK(tmdbPopular)} icon={<Flame className="w-4 h-4" />} />}
          {tmdbAiring.length > 0 && <ContentRow title="Recém Lançados" movies={filterK(tmdbAiring)} icon={<Clock className="w-4 h-4" />} />}
          {tmdbTopRated.length > 0 && <ContentRow title="Mais Bem Avaliados" movies={filterK(tmdbTopRated)} icon={<Star className="w-4 h-4" />} />}
        </div>
      </div>
      <Footer />
      <MobileBottomNav />
    </div>
  );
};

export default AnimesPage;
