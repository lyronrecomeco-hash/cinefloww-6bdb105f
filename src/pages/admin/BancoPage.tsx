import { useState, useEffect, useCallback } from "react";
import { Database, Film, Tv, Loader2, RefreshCw, CheckCircle, Search, Zap, Link2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fetchCatalog, fetchCatalogManifest, computeVideoCoverage } from "@/lib/catalogFetcher";
import { toSlug } from "@/lib/slugify";
import { useNavigate } from "react-router-dom";

interface CatalogItem {
  id: string;
  tmdb_id: number;
  title: string;
  content_type: string;
  poster_path: string | null;
  release_date: string | null;
}

const ITEMS_PER_PAGE = 50;

const BancoPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [filterText, setFilterText] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const [filterType, setFilterType] = useState<"all" | "movie" | "series">("all");
  const [stats, setStats] = useState({
    movies: 0, series: 0, total: 0, updatedAt: "",
    videoCoverage: {
      movies: 0, series: 0, total: 0,
      moviesWithout: 0, seriesWithout: 0, totalWithout: 0,
      catalogMovies: 0, catalogSeries: 0, catalogTotal: 0,
      m3uMovies: 0, m3uSeries: 0, m3uTotal: 0,
      indexedAt: "",
    },
  });
  const [generating, setGenerating] = useState(false);
  const [indexingM3U, setIndexingM3U] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilter(filterText.trim()), 300);
    return () => clearTimeout(t);
  }, [filterText]);

  // Load manifest stats
  const loadStats = useCallback(async () => {
    try {
      const manifest = await fetchCatalogManifest();
      if (manifest) {
        const m = manifest.types?.movie?.total || 0;
        const s = manifest.types?.series?.total || 0;
        setStats(prev => ({
          ...prev,
          movies: m, series: s, total: m + s,
          updatedAt: manifest.updated_at || "",
        }));

        // Client-side cross-reference (fast, cached)
        const coverage = await computeVideoCoverage(manifest);
        if (coverage) {
          const vc = manifest.video_coverage || {};
          setStats(prev => ({
            ...prev,
            videoCoverage: {
              movies: coverage.moviesWithVideo,
              series: coverage.seriesWithVideo,
              total: coverage.totalWithVideo,
              moviesWithout: coverage.moviesWithout,
              seriesWithout: coverage.seriesWithout,
              totalWithout: coverage.totalWithout,
              catalogMovies: coverage.catalogMovies,
              catalogSeries: coverage.catalogSeries,
              catalogTotal: coverage.catalogMovies + coverage.catalogSeries,
              m3uMovies: vc.m3u_movies || 0,
              m3uSeries: vc.m3u_series || 0,
              m3uTotal: vc.m3u_total || 0,
              indexedAt: vc.indexed_at || "",
            },
          }));
        }
      }
    } catch {}
  }, []);

  // Load items from static JSON catalog
  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const offset = page * ITEMS_PER_PAGE;
      const loadByType = async (type: "movie" | "series") => {
        const windowSize = debouncedFilter ? Math.max(400, offset + ITEMS_PER_PAGE) : ITEMS_PER_PAGE;
        return fetchCatalog(type, { limit: windowSize, offset: debouncedFilter ? 0 : offset });
      };

      let loaded: CatalogItem[] = [];
      let total = 0;

      if (filterType === "movie" || filterType === "series") {
        const result = await loadByType(filterType);
        const filtered = debouncedFilter
          ? result.items.filter(i => i.title.toLowerCase().includes(debouncedFilter.toLowerCase()))
          : result.items;
        loaded = (debouncedFilter ? filtered.slice(offset, offset + ITEMS_PER_PAGE) : filtered) as CatalogItem[];
        total = debouncedFilter ? filtered.length : result.total;
      } else {
        const [movies, series] = await Promise.all([loadByType("movie"), loadByType("series")]);
        const merged = [...movies.items, ...series.items].sort((a, b) =>
          (b.release_date || "0000").localeCompare(a.release_date || "0000")
        );
        const filtered = debouncedFilter
          ? merged.filter(i => i.title.toLowerCase().includes(debouncedFilter.toLowerCase()))
          : merged;
        loaded = filtered.slice(offset, offset + ITEMS_PER_PAGE) as CatalogItem[];
        total = debouncedFilter ? filtered.length : (movies.total + series.total);
      }

      setItems(loaded);
      setTotalCount(total);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, filterType, debouncedFilter]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadItems(); }, [loadItems]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      toast({ title: "🚀 Gerando catálogo...", description: "Processando API CineVeo + índice M3U em background." });
      const { error } = await supabase.functions.invoke("generate-catalog", {
        body: { type: "movies", start_page: 1, accumulated: [] },
      });
      if (error) throw error;
      toast({ title: "✅ Catálogo iniciado", description: "Processamento em background. Atualize em 1-2 min." });
    } catch (err: any) {
      toast({ title: "❌ Erro", description: err?.message || "Falha ao gerar catálogo", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleIndexM3U = async () => {
    setIndexingM3U(true);
    try {
      toast({ title: "🔍 Sincronizando...", description: "Verificando cada título do catálogo contra a lista IPTV." });
      const { error } = await supabase.functions.invoke("generate-catalog", {
        body: { mode: "m3u-only" },
      });
      if (error) throw error;
      // Poll for completion
      const pollInterval = setInterval(async () => {
        await loadStats();
      }, 10000);
      setTimeout(async () => {
        clearInterval(pollInterval);
        await loadStats();
        setIndexingM3U(false);
        toast({ title: "✅ Sincronização concluída!", description: "Verificação cruzada do catálogo finalizada." });
      }, 60000);
    } catch (err: any) {
      toast({ title: "❌ Erro", description: err?.message || "Falha ao sincronizar", variant: "destructive" });
      setIndexingM3U(false);
    }
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
  const formatDate = (d: string) => {
    if (!d) return "—";
    try { return new Date(d).toLocaleString("pt-BR"); } catch { return d; }
  };

  const vc = stats.videoCoverage;
  const coveragePercent = vc.catalogTotal > 0 ? Math.round((vc.total / vc.catalogTotal) * 100) : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-2 sm:gap-3">
            <Database className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            Banco de Conteúdo
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Catálogo estático — verificação cruzada IPTV</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleIndexM3U}
            disabled={indexingM3U}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {indexingM3U ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Sincronizando...</>
            ) : (
              <><RefreshCw className="w-4 h-4" />Sincronizar</>
            )}
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Gerando...</>
            ) : (
              <><Zap className="w-4 h-4" />Regerar Catálogo</>
            )}
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="glass p-3 sm:p-4 rounded-xl text-center">
          <p className="text-lg sm:text-2xl font-bold text-primary">{stats.total.toLocaleString()}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Total Catálogo</p>
        </div>
        <div className="glass p-3 sm:p-4 rounded-xl text-center">
          <p className="text-lg sm:text-2xl font-bold text-emerald-400">{vc.total.toLocaleString()}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Com Vídeo</p>
        </div>
        <div className="glass p-3 sm:p-4 rounded-xl text-center">
          <p className="text-lg sm:text-2xl font-bold text-amber-400">{vc.totalWithout.toLocaleString()}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Sem Vídeo</p>
        </div>
        <div className="glass p-3 sm:p-4 rounded-xl text-center">
          <p className="text-lg sm:text-2xl font-bold text-blue-400">{coveragePercent}%</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Cobertura</p>
        </div>
      </div>

      {/* Detailed coverage breakdown */}
      {vc.total > 0 && (
        <div className="glass p-3 sm:p-4 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Link2 className="w-4 h-4 text-emerald-400" />
            <span>Verificação Cruzada — Catálogo vs IPTV</span>
          </div>
          {/* Progress bar */}
          <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${coveragePercent}%` }} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Film className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-muted-foreground">Filmes:</span>
              <span className="text-emerald-400 font-medium">{vc.movies}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-foreground">{vc.catalogMovies || stats.movies}</span>
              {vc.moviesWithout > 0 && <span className="text-amber-400">({vc.moviesWithout} sem)</span>}
            </div>
            <div className="flex items-center gap-2">
              <Tv className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-muted-foreground">Séries:</span>
              <span className="text-emerald-400 font-medium">{vc.series}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-foreground">{vc.catalogSeries || stats.series}</span>
              {vc.seriesWithout > 0 && <span className="text-amber-400">({vc.seriesWithout} sem)</span>}
            </div>
            <div className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Links IPTV:</span>
              <span className="text-foreground font-medium">{vc.m3uTotal.toLocaleString()}</span>
            </div>
          </div>
          {vc.indexedAt && (
            <p className="text-[10px] text-muted-foreground">
              Última verificação: {formatDate(vc.indexedAt)}
            </p>
          )}
        </div>
      )}

      {/* Last update */}
      {stats.updatedAt && (
        <div className="glass p-3 rounded-xl flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span className="text-xs text-muted-foreground">Última atualização do catálogo: <span className="text-foreground font-medium">{formatDate(stats.updatedAt)}</span></span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" value={filterText}
            onChange={(e) => { setFilterText(e.target.value); setPage(0); }}
            placeholder="Buscar por título..."
            className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
        </div>
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {(["all", "movie", "series"] as const).map(t => (
            <button key={t} onClick={() => { setFilterType(t); setPage(0); }}
              className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-medium border transition-colors ${
                filterType === t ? "bg-primary/20 border-primary/30 text-primary" : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
              }`}>
              {t === "all" ? "Todos" : t === "movie" ? "Filmes" : "Séries"}
            </button>
          ))}
        </div>
      </div>

      {/* Content list */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="glass p-8 sm:p-12 text-center">
          <Database className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-xs sm:text-sm">
            {stats.total === 0 ? "Catálogo vazio — clique em Regerar Catálogo" : "Nenhum conteúdo encontrado"}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {items.map((item) => (
              <div key={item.id} className="glass p-3 rounded-xl flex items-center gap-3"
                onClick={() => navigate(`/${item.content_type === "movie" ? "filme" : "serie"}/${toSlug(item.title, item.tmdb_id)}`)}>
                {item.poster_path ? (
                  <img src={item.poster_path.startsWith("http") ? item.poster_path : `https://image.tmdb.org/t/p/w92${item.poster_path}`}
                    alt={item.title} className="w-10 h-14 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-14 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                    <Film className="w-3 h-3" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{item.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
                      item.content_type === "movie" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                    }`}>{item.content_type === "movie" ? "Filme" : "Série"}</span>
                    {item.release_date && <span className="text-[9px] text-muted-foreground">{item.release_date.substring(0, 4)}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block glass overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Título</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Tipo</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">TMDB ID</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Ano</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer"
                      onClick={() => navigate(`/${item.content_type === "movie" ? "filme" : "serie"}/${toSlug(item.title, item.tmdb_id)}`)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {item.poster_path ? (
                            <img src={item.poster_path.startsWith("http") ? item.poster_path : `https://image.tmdb.org/t/p/w92${item.poster_path}`}
                              alt={item.title} className="w-8 h-12 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-12 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0"><Film className="w-3 h-3" /></div>
                          )}
                          <p className="text-sm font-medium truncate max-w-[200px] lg:max-w-none">{item.title}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-2 py-1 rounded-full border font-medium ${
                          item.content_type === "movie" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                        }`}>{item.content_type === "movie" ? "Filme" : "Série"}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{item.tmdb_id}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{item.release_date?.substring(0, 4) || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page <= 0}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs disabled:opacity-30 hover:bg-white/10">
                ← Anterior
              </button>
              <span className="text-xs text-muted-foreground">Página {page + 1} de {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs disabled:opacity-30 hover:bg-white/10">
                Próxima →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BancoPage;
