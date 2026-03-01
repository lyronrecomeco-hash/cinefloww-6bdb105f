import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Radio, Search, Loader2, RefreshCw, ChevronLeft, ChevronRight,
  Tv2, Signal, Zap, Copy, Play
} from "lucide-react";
import { toast } from "sonner";

interface ApiChannel {
  id: number;
  title: string;
  type: string;
  poster: string;
  category: string;
  stream_url: string;
}

const PER_PAGE = 24;

const LogsPage = () => {
  const [channels, setChannels] = useState<ApiChannel[]>([]);
  const [categoryList, setCategoryList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [page, setPage] = useState(1);
  const [lastFetch, setLastFetch] = useState<string | null>(null);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-tv-channels");
      if (error) throw error;
      if (data?.channels) {
        setChannels(data.channels);
        setCategoryList(data.categories || []);
        setLastFetch(new Date().toLocaleString("pt-BR"));
      }
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);
  useEffect(() => { setPage(1); }, [activeCategory, search]);

  const syncToDb = async () => {
    setSyncing(true);
    try {
      toast.info("📡 Sincronizando canais para o banco...");
      const { data, error } = await supabase.functions.invoke("sync-tv-api");
      if (error) throw error;
      toast.success(`✅ ${data?.channels_upserted || 0} canais indexados!`);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  const filtered = channels.filter((ch) => {
    const matchCat = activeCategory === "all" || ch.category === activeCategory;
    const matchSearch = !search || ch.title.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/20 to-primary/20 flex items-center justify-center">
            <Tv2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold flex items-center gap-2">
              TV <span className="text-gradient">LYNE</span>
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
            </h1>
            <p className="text-xs text-muted-foreground">
              {channels.length} canais da API • {lastFetch || "Carregando..."}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchChannels}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 disabled:opacity-50 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          <button
            onClick={syncToDb}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 shadow-lg shadow-primary/20 transition-all"
          >
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {syncing ? "Indexando..." : "Indexar no Banco"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass rounded-xl p-4 text-center border border-white/5">
          <p className="text-2xl font-bold text-primary tabular-nums">{channels.length}</p>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Total Canais</p>
        </div>
        <div className="glass rounded-xl p-4 text-center border border-white/5">
          <p className="text-2xl font-bold text-emerald-400 tabular-nums">{categoryList.length}</p>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Categorias</p>
        </div>
        <div className="glass rounded-xl p-4 text-center border border-white/5">
          <div className="flex items-center justify-center gap-1.5">
            <Signal className="w-4 h-4 text-red-400" />
            <p className="text-2xl font-bold text-red-400">LIVE</p>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">API Status</p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar canal..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
        />
      </div>

      {/* Categories */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        <button
          onClick={() => setActiveCategory("all")}
          className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
            activeCategory === "all"
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
              : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
          }`}
        >
          Todos ({channels.length})
        </button>
        {categoryList.map((cat) => {
          const count = channels.filter(c => c.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                activeCategory === cat
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
              }`}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : paginated.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center border border-white/5">
          <Tv2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Nenhum canal encontrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {paginated.map((ch) => (
            <div
              key={ch.id}
              className="group glass rounded-xl overflow-hidden border border-white/5 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10"
            >
              {/* Poster */}
              <div className="relative aspect-video bg-gradient-to-br from-white/[0.04] to-transparent flex items-center justify-center p-4">
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-600/90">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                  </span>
                  <span className="text-[8px] font-bold text-white uppercase tracking-widest">LIVE</span>
                </div>
                {ch.poster ? (
                  <img
                    src={ch.poster}
                    alt={ch.title}
                    className="max-h-14 object-contain group-hover:scale-105 transition-transform"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <Radio className="w-8 h-8 text-muted-foreground/20" />
                )}
              </div>

              {/* Info */}
              <div className="px-3 pt-2 pb-1.5">
                <h3 className="text-[11px] font-semibold line-clamp-2 text-foreground group-hover:text-primary transition-colors leading-tight min-h-[28px]">
                  {ch.title}
                </h3>
                <p className="text-[9px] text-muted-foreground/50 mt-0.5 uppercase tracking-wider">{ch.category}</p>
              </div>

              {/* Actions */}
              <div className="px-3 pb-3 pt-1 flex items-center gap-2">
                <a
                  href={`/tv/${ch.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-bold uppercase transition-all"
                >
                  <Play className="w-3 h-3" />
                  Assistir
                </a>
                <button
                  onClick={() => copyUrl(ch.stream_url)}
                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
                  title="Copiar URL"
                >
                  <Copy className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 disabled:opacity-30 transition-all"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Anterior
          </button>
          <span className="text-xs text-muted-foreground tabular-nums">
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 disabled:opacity-30 transition-all"
          >
            Próxima <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {totalPages > 1 && (
        <p className="text-center text-[10px] text-muted-foreground/50">
          {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} de {filtered.length} canais
        </p>
      )}
    </div>
  );
};

export default LogsPage;
