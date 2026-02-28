import { useEffect, useState, useCallback } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MovieCard from "@/components/MovieCard";
import { TMDBMovie, discoverMovies } from "@/services/tmdb";
import { Sparkles, ChevronLeft, ChevronRight } from "lucide-react";

const ReleasesPage = () => {
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchPage = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const data = await discoverMovies(p, {
        "primary_release_date.gte": "2026-01-01",
        "primary_release_date.lte": today,
        sort_by: "primary_release_date.desc",
      });
      setMovies(data.results.filter((m) => m.poster_path));
      setTotalPages(Math.min(data.total_pages, 500));
      setPage(p);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchPage(1); }, [fetchPage]);

  const goToPage = (p: number) => {
    if (p >= 1 && p <= totalPages && p !== page) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      fetchPage(p);
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
      <div className="pt-20 sm:pt-24 lg:pt-28 px-3 sm:px-6 lg:px-12 pb-20">
        <div className="flex items-center gap-3 mb-6 sm:mb-8">
          <div className="w-1 h-6 sm:h-7 rounded-full bg-primary" />
          <div>
            <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold">Lançamentos 2026</h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Já lançados este ano • Página {page} de {totalPages}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2.5 sm:gap-4 lg:gap-5" style={{ contentVisibility: "auto" }}>
              {movies.map((movie, idx) => (
                <MovieCard key={`${movie.id}-${idx}`} movie={movie} />
              ))}
            </div>

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
          </>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default ReleasesPage;
