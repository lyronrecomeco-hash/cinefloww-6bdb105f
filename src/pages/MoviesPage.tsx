import { useEffect, useState, useCallback } from "react";
import Navbar from "@/components/Navbar";
import MovieCard from "@/components/MovieCard";
import { TMDBMovie, getPopularMovies } from "@/services/tmdb";
import { Film, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

const MoviesPage = () => {
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (p: number) => {
    if (p === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const data = await getPopularMovies(p);
      if (p === 1) {
        setMovies(data.results);
      } else {
        setMovies(prev => [...prev, ...data.results]);
      }
      setTotalPages(Math.min(data.total_pages, 500)); // TMDB caps at 500
      setPage(p);
    } catch { /* ignore */ }

    setLoading(false);
    setLoadingMore(false);
  }, []);

  useEffect(() => { fetchPage(1); }, [fetchPage]);

  const loadMore = () => {
    if (page < totalPages && !loadingMore) {
      fetchPage(page + 1);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 lg:pt-28 px-4 sm:px-6 lg:px-12 pb-20">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Film className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-2xl lg:text-3xl font-bold">Filmes</h1>
              <p className="text-xs text-muted-foreground">{movies.length} filmes carregados • Página {page}/{totalPages}</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 lg:gap-6">
              {movies.map((movie, idx) => (
                <MovieCard key={`${movie.id}-${idx}`} movie={movie} />
              ))}
            </div>

            {/* Load more */}
            {page < totalPages && (
              <div className="flex justify-center mt-10">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-primary/10 border border-primary/20 text-primary font-semibold text-sm hover:bg-primary/20 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</>
                  ) : (
                    <>Carregar mais filmes</>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MoviesPage;
