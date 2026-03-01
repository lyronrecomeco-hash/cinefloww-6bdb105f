import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Radio, Search, Loader2, RefreshCw, ChevronLeft, ChevronRight,
  Tv2, Signal, Zap, Copy
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

const PER_PAGE = 50;

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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500/20 to-primary/20 flex items-center justify-center">
            <Tv2 className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold flex items-center gap-2">
              TV <span className="text-gradient">LYNE</span>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
            </h1>
            <p className="text-[10px] text-muted-foreground">
              {channels.length} canais • {lastFetch || "Carregando..."}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchChannels}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 disabled:opacity-50 transition-all"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          <button
            onClick={syncToDb}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            {syncing ? "Indexando..." : "Indexar"}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5">
          <span className="text-sm font-bold text-primary tabular-nums">{channels.length}</span>
          <span className="text-[9px] text-muted-foreground uppercase">canais</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5">
          <span className="text-sm font-bold text-emerald-400 tabular-nums">{categoryList.length}</span>
          <span className="text-[9px] text-muted-foreground uppercase">categorias</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5">
          <Signal className="w-3 h-3 text-red-400" />
          <span className="text-[9px] text-red-400 font-bold uppercase">LIVE</span>
        </div>
      </div>

      {/* Search + Categories */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar canal..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 pl-9 pr-4 rounded-lg bg-white/5 border border-white/10 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-all"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          <button
            onClick={() => setActiveCategory("all")}
            className={`flex-shrink-0 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
              activeCategory === "all"
                ? "bg-primary text-primary-foreground"
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
                className={`flex-shrink-0 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all whitespace-nowrap ${
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : paginated.length === 0 ? (
        <div className="text-center py-12">
          <Tv2 className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-muted-foreground text-xs">Nenhum canal encontrado</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/5 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[40px_1fr_120px_1fr_40px] gap-2 px-3 py-2 bg-white/[0.03] text-[9px] text-muted-foreground uppercase tracking-wider font-medium">
            <span>#</span>
            <span>Canal</span>
            <span>Categoria</span>
            <span>Stream URL</span>
            <span></span>
          </div>
          {/* Rows */}
          <div className="divide-y divide-white/[0.03]">
            {paginated.map((ch, i) => (
              <div
                key={ch.id}
                className="grid grid-cols-[40px_1fr_120px_1fr_40px] gap-2 px-3 py-2 items-center hover:bg-white/[0.02] transition-colors group"
              >
                <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                  {(page - 1) * PER_PAGE + i + 1}
                </span>
                <div className="flex items-center gap-2 min-w-0">
                  {ch.poster ? (
                    <img
                      src={ch.poster}
                      alt=""
                      className="w-6 h-6 object-contain flex-shrink-0 rounded"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <Radio className="w-4 h-4 text-muted-foreground/20 flex-shrink-0" />
                  )}
                  <span className="text-[11px] font-medium truncate text-foreground">{ch.title}</span>
                </div>
                <span className="text-[10px] text-muted-foreground/60 truncate">{ch.category}</span>
                <span className="text-[9px] text-muted-foreground/30 font-mono truncate">{ch.stream_url}</span>
                <button
                  onClick={() => copyUrl(ch.stream_url)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10"
                  title="Copiar URL"
                >
                  <Copy className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-[10px] text-muted-foreground/50">
            {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} de {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-md bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 disabled:opacity-30 transition-all"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <span className="text-[10px] text-muted-foreground px-2 tabular-nums">
              {page}/{totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-md bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 disabled:opacity-30 transition-all"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LogsPage;
