import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Radio, Search, Loader2, RefreshCw, ChevronLeft, ChevronRight,
  Tv2, Signal, Eye, Filter, Zap, Clock, Wifi
} from "lucide-react";
import { toast } from "sonner";

interface TVChannel {
  id: string;
  name: string;
  image_url: string | null;
  stream_url: string;
  category: string;
  categories: number[];
  active: boolean;
  sort_order: number;
  updated_at: string;
}

interface TVCategory {
  id: number;
  name: string;
  sort_order: number;
}

const PER_PAGE = 30;
const SYNC_INTERVAL = 2 * 60 * 1000; // 2 minutes
const VIEWER_INTERVAL = 10000; // 10s

const LogsPage = () => {
  const [channels, setChannels] = useState<TVChannel[]>([]);
  const [categories, setCategories] = useState<TVCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastSyncChannels, setLastSyncChannels] = useState<number | null>(null);
  const [apiTotal, setApiTotal] = useState<number | null>(null);
  const [syncCountdown, setSyncCountdown] = useState(SYNC_INTERVAL / 1000);
  const [watchingMap, setWatchingMap] = useState<Record<string, number>>({});
  const [totalWatching, setTotalWatching] = useState(0);

  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const viewerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch viewers
  const fetchViewers = useCallback(async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("site_visitors")
      .select("pathname, visitor_id")
      .gte("visited_at", fiveMinAgo)
      .like("pathname", "/tv/%");
    if (!data) return;
    const map: Record<string, Set<string>> = {};
    const allVisitors = new Set<string>();
    for (const row of data) {
      const channelId = row.pathname?.replace("/tv/", "").split("?")[0];
      if (!channelId) continue;
      if (!map[channelId]) map[channelId] = new Set();
      map[channelId].add(row.visitor_id);
      allVisitors.add(row.visitor_id);
    }
    const counts: Record<string, number> = {};
    for (const [k, v] of Object.entries(map)) counts[k] = v.size;
    setWatchingMap(counts);
    setTotalWatching(allVisitors.size);
  }, []);

  const fetchChannels = useCallback(async () => {
    setLoading(true);

    // Fetch categories
    const { data: cats } = await supabase
      .from("tv_categories")
      .select("*")
      .order("sort_order");
    if (cats) setCategories(cats as TVCategory[]);

    // Build query
    let query = supabase
      .from("tv_channels")
      .select("*", { count: "exact" })
      .order("sort_order");

    if (activeCategory !== "all") {
      query = query.eq("category", activeCategory);
    }

    if (search.trim()) {
      query = query.ilike("name", `%${search.trim()}%`);
    }

    const from = (page - 1) * PER_PAGE;
    query = query.range(from, from + PER_PAGE - 1);

    const { data, count } = await query;
    setChannels((data as TVChannel[]) || []);
    setTotalCount(count || 0);

    // Get last sync info
    const { data: syncData } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "tv_last_sync")
      .maybeSingle();
    if (syncData?.value) {
      const val = syncData.value as any;
      if (val.ts) {
        setLastSync(new Date(val.ts).toLocaleString("pt-BR"));
        setLastSyncChannels(val.channels || null);
        setApiTotal(val.total_api || null);
      }
    }

    setLoading(false);
  }, [page, activeCategory, search]);

  useEffect(() => {
    fetchChannels();
    fetchViewers();
  }, [fetchChannels, fetchViewers]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [activeCategory, search]);

  // Viewer polling + realtime
  useEffect(() => {
    viewerIntervalRef.current = setInterval(fetchViewers, VIEWER_INTERVAL);
    const channel = supabase
      .channel("tvlyne-viewers")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "site_visitors" }, (payload: any) => {
        if (payload.new?.pathname?.startsWith("/tv/")) fetchViewers();
      })
      .subscribe();
    return () => {
      if (viewerIntervalRef.current) clearInterval(viewerIntervalRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchViewers]);

  // Run sync
  const runSync = useCallback(async (silent = false) => {
    if (syncing) return;
    setSyncing(true);
    try {
      if (!silent) toast.info("📡 Sincronizando canais da API CineVeo...");
      const { data, error } = await supabase.functions.invoke("sync-tv-api");
      if (error) throw error;
      if (!silent) {
        toast.success(`✅ ${data?.channels_upserted || 0} canais sincronizados (${data?.categories_synced || 0} categorias)`);
      }
      await fetchChannels();
      setSyncCountdown(SYNC_INTERVAL / 1000);
    } catch (err: any) {
      if (!silent) toast.error(`Erro: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }, [syncing, fetchChannels]);

  // Auto-sync every 2 minutes
  useEffect(() => {
    syncIntervalRef.current = setInterval(() => {
      runSync(true);
    }, SYNC_INTERVAL);

    setSyncCountdown(SYNC_INTERVAL / 1000);
    countdownRef.current = setInterval(() => {
      setSyncCountdown(prev => (prev <= 1 ? SYNC_INTERVAL / 1000 : prev - 1));
    }, 1000);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [runSync]);

  // Realtime channel changes
  useEffect(() => {
    const channel = supabase
      .channel("tvlyne-channels")
      .on("postgres_changes", { event: "*", schema: "public", table: "tv_channels" }, () => {
        fetchChannels();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchChannels]);

  const totalPages = Math.ceil(totalCount / PER_PAGE);
  const catNames = categories.map(c => c.name);

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/20 to-primary/20 flex items-center justify-center">
              <Tv2 className="w-5 h-5 text-primary" />
            </div>
            TV <span className="text-gradient">LYNE</span>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {apiTotal || totalCount} canais da API • {lastSync ? `Última sync: ${lastSync}` : "Nunca sincronizado"}
          </p>
        </div>
        <button
          onClick={() => runSync(false)}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-primary/20"
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {syncing ? "Sincronizando..." : "Sincronizar API"}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="glass rounded-xl p-4 text-center border border-white/5">
          <p className="text-2xl font-bold text-primary tabular-nums">{apiTotal || totalCount}</p>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Total API</p>
        </div>
        <div className="glass rounded-xl p-4 text-center border border-white/5">
          <p className="text-2xl font-bold text-primary tabular-nums">{categories.length}</p>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Categorias</p>
        </div>
        <div className="glass rounded-xl p-4 text-center border border-white/5">
          <div className="flex items-center justify-center gap-1.5">
            <Eye className="w-4 h-4 text-green-400" />
            <p className="text-2xl font-bold text-green-400 tabular-nums">{totalWatching}</p>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Assistindo</p>
        </div>
        <div className="glass rounded-xl p-4 text-center border border-white/5">
          <div className="flex items-center justify-center gap-1.5">
            <Signal className="w-4 h-4 text-red-400" />
            <p className="text-2xl font-bold text-red-400">AO VIVO</p>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Status</p>
        </div>
        <div className="glass rounded-xl p-4 text-center border border-white/5">
          <div className="flex items-center justify-center gap-1.5">
            <Wifi className={`w-4 h-4 ${syncing ? "text-yellow-400" : "text-primary"}`} />
            <p className="text-sm font-bold tabular-nums">{syncing ? "Sync..." : formatCountdown(syncCountdown)}</p>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Próx. Sync</p>
        </div>
      </div>

      {/* Search + Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar canal..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>
        <button
          onClick={fetchChannels}
          className="flex items-center gap-2 px-4 h-10 rounded-xl bg-white/5 border border-white/10 text-sm text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        <button
          onClick={() => setActiveCategory("all")}
          className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
            activeCategory === "all"
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
              : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
          }`}
        >
          <Filter className="w-3 h-3 inline mr-1" />
          Todos
        </button>
        {catNames.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
              activeCategory === cat
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Channels Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : channels.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center border border-white/5">
          <Tv2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Nenhum canal encontrado</p>
          <p className="text-muted-foreground/60 text-xs mt-1">Clique em "Sincronizar API" para importar os canais</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {channels.map((ch) => (
            <div
              key={ch.id}
              className="group glass rounded-xl overflow-hidden border border-white/5 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 hover:scale-[1.02]"
            >
              {/* Image */}
              <div className="relative aspect-video bg-gradient-to-br from-white/[0.02] to-transparent flex items-center justify-center p-3">
                {/* Live badge */}
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/90 backdrop-blur-sm">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                  </span>
                  <span className="text-[7px] font-bold text-white uppercase tracking-wider">LIVE</span>
                </div>

                {/* Viewer count badge */}
                {(watchingMap[ch.id] || 0) > 0 && (
                  <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/90 backdrop-blur-sm">
                    <Eye className="w-2.5 h-2.5 text-white" />
                    <span className="text-[7px] font-bold text-white">{watchingMap[ch.id]}</span>
                  </div>
                )}

                {ch.image_url ? (
                  <img
                    src={ch.image_url}
                    alt={ch.name}
                    className="max-h-14 object-contain transition-transform duration-300 group-hover:scale-110"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <Radio className="w-8 h-8 text-muted-foreground/30" />
                )}
              </div>

              {/* Info */}
              <div className="px-2.5 pb-2.5 pt-1">
                <h3 className="text-[11px] font-semibold line-clamp-1 text-foreground group-hover:text-primary transition-colors">
                  {ch.name}
                </h3>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[9px] text-muted-foreground/70 line-clamp-1">{ch.category}</span>
                  <a
                    href={`/tv/${ch.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Eye className="w-3 h-3 text-primary" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 disabled:opacity-30 transition-all"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Anterior
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (page <= 4) {
                pageNum = i + 1;
              } else if (page >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                    page === pageNum
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                      : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 disabled:opacity-30 transition-all"
          >
            Próximo
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Page info */}
      {totalPages > 1 && (
        <p className="text-center text-[10px] text-muted-foreground/60">
          Página {page} de {totalPages} • Mostrando {(page - 1) * PER_PAGE + 1}-{Math.min(page * PER_PAGE, totalCount)} de {totalCount}
        </p>
      )}
    </div>
  );
};

export default LogsPage;
