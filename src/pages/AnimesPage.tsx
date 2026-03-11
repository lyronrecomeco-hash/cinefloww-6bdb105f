import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ContentRow from "@/components/ContentRow";
import MovieCard from "@/components/MovieCard";
import MobileBottomNav from "@/components/MobileBottomNav";
import { Sparkles, ChevronLeft, ChevronRight, Flame, Clock, Star } from "lucide-react";
import { TMDBMovie, discoverSeries } from "@/services/tmdb";
import { fetchCatalog, CatalogItem } from "@/lib/catalogFetcher";
import { toSlug } from "@/lib/slugify";
import { supabase } from "@/integrations/supabase/client";

const IMG_BASE = "https://image.tmdb.org/t/p/w342";

const CINEVEO_API = "https://cineveo.lat/api/catalog.php?username=lyneflix-vods&password=uVljs2d&type=animes";

const AnimesPage = () => {
  const [cineveoAnimes, setCineveoAnimes] = useState<TMDBMovie[]>([]);
  const [tmdbPopular, setTmdbPopular] = useState<TMDBMovie[]>([]);
  const [tmdbTopRated, setTmdbTopRated] = useState<TMDBMovie[]>([]);
  const [tmdbAiring, setTmdbAiring] = useState<TMDBMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const navigate = useNavigate();

  // Fetch CineVeo animes for the grid
  const fetchCineveoPage = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`${CINEVEO_API}&page=${p}`);
      const json = await res.json();
      if (json.success && json.data) {
        const items: TMDBMovie[] = json.data
          .filter((d: any) => d.poster)
          .map((d: any) => ({
            id: d.tmdb_id,
            name: d.title,
            poster_path: d.poster,
            backdrop_path: d.backdrop || null,
            overview: d.synopsis || "",
            vote_average: 0,
            first_air_date: d.year ? `${d.year}-01-01` : undefined,
            genre_ids: [],
            media_type: "tv" as const,
          }));
        setCineveoAnimes(items);
        setTotalPages(json.pagination?.total_pages || 1);
        setPage(p);
      }
    } catch {
      setCineveoAnimes([]);
    }
    setLoading(false);
  }, []);

  // Fetch TMDB anime rows
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

    fetchCineveoPage(1);
  }, [fetchCineveoPage]);

  const goToPage = (p: number) => {
    if (p >= 1 && p <= totalPages && p !== page) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      fetchCineveoPage(p);
    }
  };

  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
    else {
      pages.push(1);
      if (page > 3) pages.push("...");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-20 sm:pt-24 lg:pt-28 pb-20">
        {/* Header */}
        <div className="px-3 sm:px-6 lg:px-12 mb-6 sm:mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold">Animes</h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Catálogo completo de animes
              </p>
            </div>
          </div>
        </div>

        {/* Content rows */}
        <div className="space-y-1 sm:space-y-2">
          {tmdbPopular.length > 0 && <ContentRow title="Populares" movies={tmdbPopular} icon={<Flame className="w-4 h-4" />} />}
          {tmdbAiring.length > 0 && <ContentRow title="Recém Lançados" movies={tmdbAiring} icon={<Clock className="w-4 h-4" />} />}
          {tmdbTopRated.length > 0 && <ContentRow title="Mais Bem Avaliados" movies={tmdbTopRated} icon={<Star className="w-4 h-4" />} />}
        </div>

        {/* Full grid from CineVeo API */}
        <div className="px-3 sm:px-6 lg:px-12 mt-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full bg-primary" />
            <h2 className="font-display text-base sm:text-lg font-bold">Catálogo Completo</h2>
            <span className="text-[10px] text-muted-foreground ml-2">Página {page} de {totalPages}</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2.5 sm:gap-4 lg:gap-5" style={{ contentVisibility: "auto" }}>
                {cineveoAnimes.map((anime, idx) => (
                  <MovieCard key={`${anime.id}-${idx}`} movie={anime} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-1.5 sm:gap-2 mt-8 sm:mt-10 flex-wrap">
                  <button onClick={() => goToPage(page - 1)} disabled={page <= 1}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-30 disabled:pointer-events-none">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {getPageNumbers().map((p, i) =>
                    p === "..." ? <span key={`dot-${i}`} className="w-8 h-9 flex items-center justify-center text-muted-foreground text-sm">…</span> :
                    <button key={p} onClick={() => goToPage(p)}
                      className={`min-w-[36px] h-9 sm:min-w-[40px] sm:h-10 px-2 rounded-xl text-sm font-medium transition-colors ${
                        p === page ? "bg-primary text-primary-foreground" : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
                      }`}>{p}</button>
                  )}
                  <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-30 disabled:pointer-events-none">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <Footer />
      <MobileBottomNav />
    </div>
  );
};

export default AnimesPage;
