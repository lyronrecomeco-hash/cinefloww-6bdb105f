import { useEffect, useState, useCallback } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { TMDBMovie, getUpcomingMovies, getOnTheAirSeries, posterUrl, getDisplayTitle, getYear } from "@/services/tmdb";
import { Calendar, Film, Tv, ChevronLeft, ChevronRight } from "lucide-react";
import { toSlug } from "@/lib/slugify";
import { useNavigate } from "react-router-dom";

type TabType = "movies" | "series";

const ComingSoonPage = () => {
  const [items, setItems] = useState<TMDBMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [tab, setTab] = useState<TabType>("movies");
  const navigate = useNavigate();

  const fetchPage = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = tab === "movies" ? await getUpcomingMovies(p) : await getOnTheAirSeries(p);
      setItems(data.results);
      setTotalPages(Math.min(data.total_pages, 500));
      setPage(p);
    } catch { /* ignore */ }
    setLoading(false);
  }, [tab]);

  useEffect(() => { fetchPage(1); }, [fetchPage]);

  const goToPage = (p: number) => {
    if (p >= 1 && p <= totalPages && p !== page) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      fetchPage(p);
    }
  };

  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  const formatDate = (item: TMDBMovie) => {
    const dateStr = item.release_date || item.first_air_date;
    if (!dateStr) return "Data indefinida";
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  };

  const handleClick = (item: TMDBMovie) => {
    const title = getDisplayTitle(item);
    const isMovie = tab === "movies";
    navigate(isMovie ? `/filme/${toSlug(title, item.id)}` : `/serie/${toSlug(title, item.id)}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-20 sm:pt-24 lg:pt-28 px-3 sm:px-6 lg:px-12 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold">Em Breve</h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Próximos lançamentos</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab("movies")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              tab === "movies"
                ? "bg-primary text-primary-foreground"
                : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            Filmes
          </button>
          <button
            onClick={() => setTab("series")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              tab === "series"
                ? "bg-primary text-primary-foreground"
                : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            Séries
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {items.map((item, idx) => (
                <button
                  key={`${item.id}-${idx}`}
                  onClick={() => handleClick(item)}
                  className="group flex gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.07] hover:border-white/10 transition-all text-left"
                >
                  <img
                    src={posterUrl(item.poster_path, "w185")}
                    alt={getDisplayTitle(item)}
                    className="w-20 h-28 sm:w-24 sm:h-36 rounded-xl object-cover flex-shrink-0"
                    loading="lazy"
                  />
                  <div className="flex-1 min-w-0 py-1">
                    <h3 className="font-semibold text-sm sm:text-base line-clamp-2 group-hover:text-primary transition-colors">
                      {getDisplayTitle(item)}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Calendar className="w-3 h-3 text-primary flex-shrink-0" />
                      <span className="text-xs text-primary font-medium">{formatDate(item)}</span>
                    </div>
                    {item.vote_average > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-xs text-muted-foreground">★ {item.vote_average.toFixed(1)}</span>
                      </div>
                    )}
                    {item.overview && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{item.overview}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 mt-8 sm:mt-10 flex-wrap">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {getPageNumbers().map((p, i) =>
                p === "..." ? (
                  <span key={`dot-${i}`} className="w-8 h-9 flex items-center justify-center text-muted-foreground text-sm">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    className={`min-w-[36px] h-9 sm:min-w-[40px] sm:h-10 px-2 rounded-xl text-sm font-medium transition-colors ${
                      p === page
                        ? "bg-primary text-primary-foreground"
                        : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
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

export default ComingSoonPage;
