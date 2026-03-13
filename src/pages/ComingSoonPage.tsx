import { useEffect, useState, useCallback } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MovieCard from "@/components/MovieCard";
import { TMDBMovie, discoverMovies, discoverSeries, getUpcomingMovies, getOnTheAirSeries } from "@/services/tmdb";
import { Calendar, Film, Tv, ChevronLeft, ChevronRight } from "lucide-react";

type TabType = "movies" | "series";

const TARGET_ITEMS = 21;
const MAX_SCAN_PAGES = 4;

type RankedTMDBMovie = TMDBMovie & { popularity?: number; vote_count?: number };

const scoreInterest = (item: RankedTMDBMovie) => {
  const popularity = Number(item.popularity || 0);
  const votes = Number(item.vote_count || 0);
  const rating = Number(item.vote_average || 0);
  return popularity * 2 + Math.log10(votes + 1) * 20 + rating * 6;
};

const ComingSoonPage = () => {
  const [items, setItems] = useState<TMDBMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [tab, setTab] = useState<TabType>("movies");

  const fetchPage = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
      const futureLimit = new Date(Date.now() + 1000 * 60 * 60 * 24 * 540).toISOString().split("T")[0]; // ~18 meses

      let cursor = p;
      let total = 1;
      const collected: RankedTMDBMovie[] = [];

      const pushFiltered = (list: RankedTMDBMovie[], requireFutureDate: boolean) => {
        list.forEach((item) => {
          const date = item.release_date || item.first_air_date;
          const popularity = Number(item.popularity || 0);
          const votes = Number(item.vote_count || 0);
          const rating = Number(item.vote_average || 0);

          const hasInterestSignal = popularity >= 6 || votes >= 35 || rating >= 6;
          const isFuture = !!date && date >= tomorrow;
          if (!item.poster_path || !item.backdrop_path) return;
          if (requireFutureDate && !isFuture) return;
          if (!hasInterestSignal) return;

          collected.push(item);
        });
      };

      for (let scanned = 0; scanned < MAX_SCAN_PAGES && collected.length < TARGET_ITEMS * 2; scanned += 1) {
        if (tab === "movies") {
          const upcoming = await getUpcomingMovies(cursor);
          total = Math.min(upcoming.total_pages || 1, 500);
          pushFiltered(upcoming.results as RankedTMDBMovie[], true);

          if (collected.length < TARGET_ITEMS) {
            const discoverFallback = await discoverMovies(cursor, {
              "primary_release_date.gte": tomorrow,
              "primary_release_date.lte": futureLimit,
              sort_by: "popularity.desc",
            });
            pushFiltered(discoverFallback.results as RankedTMDBMovie[], true);
          }
        } else {
          const upcomingSeries = await discoverSeries(cursor, {
            "first_air_date.gte": tomorrow,
            "first_air_date.lte": futureLimit,
            sort_by: "popularity.desc",
          });
          total = Math.min(upcomingSeries.total_pages || 1, 500);
          pushFiltered(upcomingSeries.results as RankedTMDBMovie[], true);

          if (collected.length < TARGET_ITEMS) {
            const onTheAir = await getOnTheAirSeries(cursor);
            pushFiltered(onTheAir.results as RankedTMDBMovie[], false);
          }
        }

        cursor += 1;
        if (cursor > total) break;
      }

      if (collected.length < TARGET_ITEMS) {
        const fallback = tab === "movies"
          ? await discoverMovies(1, { sort_by: "popularity.desc" })
          : await discoverSeries(1, { sort_by: "popularity.desc" });

        pushFiltered(fallback.results as RankedTMDBMovie[], false);
      }

      const unique = Array.from(new Map(collected.map((m) => [m.id, m])).values());
      unique.sort((a, b) => scoreInterest(b) - scoreInterest(a));

      setItems(unique.slice(0, TARGET_ITEMS));
      setTotalPages(Math.max(total, 1));
      setPage(p);
    } catch {
      setItems([]);
      setTotalPages(1);
    }
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
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 sm:h-7 rounded-full bg-primary" />
            <div>
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold">| Em Breve</h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Próximos lançamentos</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab("movies")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              tab === "movies" ? "bg-primary text-primary-foreground" : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            }`}>
            <Film className="w-3.5 h-3.5" /> Filmes
          </button>
          <button onClick={() => setTab("series")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              tab === "series" ? "bg-primary text-primary-foreground" : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            }`}>
            <Tv className="w-3.5 h-3.5" /> Séries
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Nenhum lançamento futuro encontrado</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-3 sm:gap-4" style={{ contentVisibility: "auto" }}>
              {items.map((item, idx) => (
                <MovieCard key={`${item.id}-${idx}`} movie={item} comingSoon />
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

export default ComingSoonPage;
