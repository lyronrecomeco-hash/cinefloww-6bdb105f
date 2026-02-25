import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { fetchCatalog, CatalogItem } from "@/lib/catalogFetcher";
import { Heart, ChevronLeft, ChevronRight } from "lucide-react";
import { toSlug } from "@/lib/slugify";

const ITEMS_PER_PAGE = 42;
const IMG_BASE = "https://image.tmdb.org/t/p/w342";

const DoramasPage = () => {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const navigate = useNavigate();

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE) || 1;

  const fetchPage = useCallback(async (p: number) => {
    setLoading(true);
    const offset = (p - 1) * ITEMS_PER_PAGE;

    try {
      const result = await fetchCatalog("dorama", { limit: ITEMS_PER_PAGE, offset });
      setItems(result.items);
      setTotal(result.total);
    } catch {
      setItems([]);
      setTotal(0);
    }

    setPage(p);
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-20 sm:pt-24 lg:pt-28 px-3 sm:px-6 lg:px-12 pb-20">
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold">Doramas</h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                {total > 0 ? `${total} títulos • Página ${page} de ${totalPages}` : "Carregando..."}
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Heart className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Nenhum dorama disponível ainda</p>
            <p className="text-sm mt-1">Em breve teremos novidades!</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2.5 sm:gap-4 lg:gap-5">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate(`/serie/${toSlug(item.title, item.tmdb_id)}`)}
                  className="group relative overflow-hidden rounded-xl sm:rounded-2xl bg-card/50 border border-white/5 hover:border-primary/30 transition-all duration-300 hover:scale-[1.03]"
                >
                  <div className="aspect-[2/3] relative overflow-hidden">
                    {item.poster_path ? (
                      <img
                        src={`${IMG_BASE}${item.poster_path}`}
                        alt={item.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <Heart className="w-8 h-8 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    {item.vote_average && item.vote_average > 0 && (
                      <div className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded-lg">
                        <span className="text-[10px] font-bold text-yellow-400">★ {item.vote_average.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                  <div className="p-2 sm:p-2.5">
                    <p className="text-[11px] sm:text-xs font-medium text-foreground truncate">{item.title}</p>
                    {item.release_date && (
                      <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">
                        {new Date(item.release_date).getFullYear()}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 mt-8 sm:mt-10 flex-wrap">
                <button onClick={() => goToPage(page - 1)} disabled={page <= 1}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-30 disabled:pointer-events-none">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {getPageNumbers().map((p, i) =>
                  p === "..." ? (
                    <span key={`dot-${i}`} className="w-8 h-9 flex items-center justify-center text-muted-foreground text-sm">…</span>
                  ) : (
                    <button key={p} onClick={() => goToPage(p)}
                      className={`min-w-[36px] h-9 sm:min-w-[40px] sm:h-10 px-2 rounded-xl text-sm font-medium transition-colors ${
                        p === page ? "bg-primary text-primary-foreground" : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
                      }`}>
                      {p}
                    </button>
                  )
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
      <Footer />
    </div>
  );
};

export default DoramasPage;
