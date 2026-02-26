import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Database, Film, Tv, Loader2, Play, RefreshCw, CheckCircle, XCircle, Search, ExternalLink, Link2, X, Upload, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { initVpsClient, isVpsOnline, getVpsUrl, refreshVpsHealth } from "@/lib/vpsClient";
import { toSlug } from "@/lib/slugify";

interface ContentItem {
  id: string;
  tmdb_id: number;
  imdb_id: string | null;
  title: string;
  content_type: string;
  poster_path: string | null;
  release_date: string | null;
}

interface VideoStatus {
  tmdb_id: number;
  has_video: boolean;
  video_url?: string;
  provider?: string;
  video_type?: string;
}

const ITEMS_PER_PAGE = 50;

const BancoPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [videoStatuses, setVideoStatuses] = useState<Map<number, VideoStatus>>(new Map());
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [filterText, setFilterText] = useState("");
  const [debouncedFilterText, setDebouncedFilterText] = useState("");
  const [filterType, setFilterType] = useState<"all" | "movie" | "series">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "with" | "without">("all");
  const [resolving, setResolving] = useState(false);
  const [resolveProgress, setResolveProgress] = useState({ current: 0, total: 0 });
  const cancelRef = useRef(false);
  const { toast } = useToast();
  const [stats, setStats] = useState({ total: 0, withVideo: 0, withoutVideo: 0, byProvider: {} as Record<string, number> });
  // playerItem removed — now navigates to native player
  const [providerMenu, setProviderMenu] = useState<string | null>(null);
  const [resolvingItems, setResolvingItems] = useState<Set<string>>(new Set());

  // CineVeo import state
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    phase: string;
    currentType?: string;
    currentPage?: number;
    totalPages?: number;
    contentTotal: number;
    cacheTotal: number;
    pagesProcessed: number;
    done: boolean;
  } | null>(null);

  // Debounce da busca para evitar consultas a cada tecla
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilterText(filterText.trim()), 250);
    return () => clearTimeout(timer);
  }, [filterText]);

  // Load stats from DB — with timeout to prevent infinite loading
  const loadStats = useCallback(async () => {
    try {
      const timeout = new Promise<null>((r) => setTimeout(() => r(null), 6000));
      const result = await Promise.race([
        Promise.all([
          supabase.from("content").select("*", { count: "exact", head: true }),
          supabase.rpc("get_video_stats_by_provider" as any),
        ]),
        timeout,
      ]);

      if (!result) {
        console.warn("[BancoPage] loadStats timeout — Cloud DB slow");
        return;
      }

      const [totalResult, providerResult] = result as any[];
      const total = totalResult.count || 0;
      const providerData = providerResult.data;
      const byProvider: Record<string, number> = {};
      let withVideo = 0;

      if (providerData && Array.isArray(providerData)) {
        for (const row of providerData as any[]) {
          byProvider[row.provider] = Number(row.cnt);
          withVideo += Number(row.cnt);
        }
      }

      setStats({
        total,
        withVideo,
        withoutVideo: Math.max(0, total - withVideo),
        byProvider,
      });
      setTotalCount(total);
    } catch (err) {
      console.warn("[BancoPage] loadStats error:", err);
    }
  }, []);

  // Load paginated content list — with timeout
  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const from = page * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      const needsExactCount = filterType !== "all" || !!debouncedFilterText;
      const selectColumns = "id, tmdb_id, imdb_id, title, content_type, poster_path, release_date";

      let contentQuery = needsExactCount
        ? supabase.from("content").select(selectColumns, { count: "exact" })
        : supabase.from("content").select(selectColumns);

      contentQuery = contentQuery
        .eq("status", "published")
        .order("release_date", { ascending: false, nullsFirst: false })
        .range(from, to);

      if (filterType !== "all") contentQuery = contentQuery.eq("content_type", filterType);
      if (debouncedFilterText) contentQuery = contentQuery.ilike("title", `%${debouncedFilterText}%`);

      const timeout = new Promise<null>((r) => setTimeout(() => r(null), 8000));
      const result = await Promise.race([contentQuery, timeout]);

      if (!result) {
        console.warn("[BancoPage] loadItems timeout — Cloud DB slow");
        setLoading(false);
        return;
      }

      const { data, count } = result as any;
      if (data) {
        setItems(data);
        setTotalCount((prev) => (needsExactCount ? (count || 0) : prev));

        const tmdbIds = data.map((i: any) => i.tmdb_id);
        const cTypes = [...new Set(data.map((i: any) => (i.content_type === "movie" ? "movie" : "series")))];

        if (tmdbIds.length > 0) {
          const cacheTimeout = new Promise<null>((r) => setTimeout(() => r(null), 6000));
          const cacheResult = await Promise.race([
            supabase
              .from("video_cache")
              .select("tmdb_id, video_url, provider, video_type, created_at")
              .in("tmdb_id", tmdbIds)
              .in("content_type", cTypes as string[])
              .gt("expires_at", new Date().toISOString())
              .order("created_at", { ascending: false }),
            cacheTimeout,
          ]);

          if (cacheResult) {
            const { data: cached } = cacheResult as any;
            const providerRank = (provider?: string) => {
              const p = (provider || "").toLowerCase();
              if (p === "manual") return 130;
              if (p === "cineveo-api") return 120;
              if (p === "cineveo-iptv") return 110;
              if (p === "cineveo") return 100;
              return 70;
            };

            const bestByTmdb = new Map<number, any>();
            for (const row of cached || []) {
              const current = bestByTmdb.get(row.tmdb_id);
              if (!current || providerRank(row.provider) > providerRank(current.provider)) {
                bestByTmdb.set(row.tmdb_id, row);
              }
            }

            const statusMap = new Map<number, VideoStatus>();
            for (const item of data) {
              const cachedItem = bestByTmdb.get(item.tmdb_id);
              statusMap.set(item.tmdb_id, {
                tmdb_id: item.tmdb_id,
                has_video: !!cachedItem,
                video_url: cachedItem?.video_url,
                provider: cachedItem?.provider,
                video_type: cachedItem?.video_type,
              });
            }
            setVideoStatuses(statusMap);
          }
        }
      }
    } catch (err) {
      console.warn("[BancoPage] loadItems error:", err);
    } finally {
      setLoading(false);
    }
  }, [page, filterType, debouncedFilterText]);

  // Load on mount / updates (separated to avoid query loop)
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Check for ongoing import on mount
  useEffect(() => {
    const checkOngoingImport = async () => {
      const [vps, cloud] = await Promise.all([
        supabase.from("site_settings").select("value").eq("key", "cineveo_vps_progress").maybeSingle(),
        supabase.from("site_settings").select("value").eq("key", "cineveo_import_progress").maybeSingle(),
      ]);
      const p = (vps.data?.value || cloud.data?.value) as any;
      if (p && p.phase === "syncing" && !p.done) {
        // Import is ongoing from a previous session
        setImporting(true);
        setImportProgress({
          phase: p.phase,
          currentType: p.current_type,
          currentPage: p.current_page,
          totalPages: p.total_pages_for_type,
          contentTotal: p.imported_content_total || p.content_total || 0,
          cacheTotal: p.imported_cache_total || p.cache_total || 0,
          pagesProcessed: p.processed_pages || p.pages_processed || 0,
          done: false,
        });
      }
    };
    checkOngoingImport();
  }, []);

  // Debounced stat refresh to prevent flickering during mass operations
  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedLoadStats = useCallback(() => {
    if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
    realtimeTimer.current = setTimeout(() => {
      loadStats();
    }, 2000); // 2s debounce — batches rapid changes
  }, [loadStats]);

  // Realtime for stats updates (debounced)
  useEffect(() => {
    const channel = supabase
      .channel('banco-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_cache' }, debouncedLoadStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content' }, debouncedLoadStats)
      .subscribe();
    return () => {
      if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
      supabase.removeChannel(channel);
    };
  }, [debouncedLoadStats]);

  // Poll import progress
  useEffect(() => {
    if (!importing) return;
    const interval = setInterval(async () => {
      const [vps, cloud] = await Promise.all([
        supabase.from("site_settings").select("value").eq("key", "cineveo_vps_progress").maybeSingle(),
        supabase.from("site_settings").select("value").eq("key", "cineveo_import_progress").maybeSingle(),
      ]);
      const p = (vps.data?.value || cloud.data?.value) as any;
      if (!p) return;

      setImportProgress({
        phase: p.phase || "syncing",
        currentType: p.current_type,
        currentPage: p.current_page,
        totalPages: p.total_pages_for_type,
        contentTotal: p.imported_content_total || p.content_total || 0,
        cacheTotal: p.imported_cache_total || p.cache_total || 0,
        pagesProcessed: p.processed_pages || p.pages_processed || 0,
        done: !!p.done,
      });

      // Also refresh stats (silently — don't trigger loading spinner)
      loadStats();

      if (p.done) {
        clearInterval(interval);
        setImporting(false);
        if (p.phase === "error") {
          toast({ title: "❌ Erro na importação", description: p.error || "Falha", variant: "destructive" });
        } else {
          toast({ title: "✅ Importação concluída!", description: `${p.imported_cache_total || p.cache_total || 0} links, ${p.imported_content_total || p.content_total || 0} conteúdos` });
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [importing, loadStats, toast]);

  // === START IMPORT ===
  const startImport = async () => {
    setImporting(true);
    setImportProgress({ phase: "resetting", contentTotal: 0, cacheTotal: 0, pagesProcessed: 0, done: false });

    // Reset: clear video_cache (except manual), resolve_failures, progress
    toast({ title: "🔄 Resetando...", description: "Limpando dados antigos..." });
    await Promise.all([
      supabase.from("video_cache").delete().neq("provider", "manual"),
      supabase.from("resolve_failures").delete().gte("attempted_at", "2000-01-01"),
      supabase.from("site_settings").delete().in("key", ["cineveo_import_progress", "cineveo_vps_progress"]),
    ]);

    // Refresh stats after reset
    await loadStats();
    await loadItems();

    // Check VPS
    await initVpsClient();
    const vpsUrl = getVpsUrl();
    const vpsAvailable = !!vpsUrl && (await refreshVpsHealth()) && isVpsOnline();

    if (vpsAvailable) {
      toast({ title: "⚡ VPS Online", description: "Importação via VPS..." });
      try {
        await fetch(`${vpsUrl}/api/trigger-cineveo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reset: true }),
          signal: AbortSignal.timeout(10_000),
        }).catch(() => {});
      } catch { /* VPS will process */ }
    } else {
      toast({ title: "☁️ Cloud Mode", description: "VPS offline, usando Cloud..." });
      supabase.functions.invoke("import-cineveo-catalog", {
        body: { reset: true, brute: true, pages_per_run: 15 },
      }).catch(() => {});
    }

    setImportProgress({ phase: "syncing", contentTotal: 0, cacheTotal: 0, pagesProcessed: 0, done: false });
  };

  const resolveLink = async (item: ContentItem, forceProvider?: string) => {
    try {
      const { data } = await supabase.functions.invoke("extract-video", {
        body: {
          tmdb_id: item.tmdb_id,
          imdb_id: item.imdb_id,
          content_type: item.content_type,
          audio_type: "legendado",
          force_provider: forceProvider || undefined,
          title: item.title,
        },
      });
      const newStatus: VideoStatus = {
        tmdb_id: item.tmdb_id,
        has_video: !!data?.url,
        video_url: data?.url,
        provider: data?.provider,
        video_type: data?.type,
      };
      setVideoStatuses(prev => new Map(prev).set(item.tmdb_id, newStatus));
      if (data?.url) {
        toast({ title: "✅ Link extraído!", description: `${item.title} — via ${data.provider}` });
      } else {
        toast({ title: "❌ Não encontrado", description: data?.message || item.title, variant: "destructive" });
      }
      return newStatus;
    } catch {
      toast({ title: "Erro", description: `Falha ao extrair ${item.title}`, variant: "destructive" });
      return { tmdb_id: item.tmdb_id, has_video: false };
    }
  };

  const handleProviderSelect = async (item: ContentItem, provider: string) => {
    setProviderMenu(null);
    setResolvingItems(prev => new Set(prev).add(item.id));
    try {
      await resolveLink(item, provider);
    } finally {
      setResolvingItems(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  };

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  // Resolve ALL links
  const resolveAllLinks = async () => {
    setResolving(true);
    cancelRef.current = false;

    await initVpsClient();
    const vpsUrl = getVpsUrl();
    const vpsAvailable = !!vpsUrl && (await refreshVpsHealth()) && isVpsOnline();

    const { count: totalContent } = await supabase.from("content").select("*", { count: "exact", head: true });
    const { count: cachedCount } = await supabase.from("video_cache").select("*", { count: "exact", head: true }).gt("expires_at", new Date().toISOString());
    const { count: failedCount } = await supabase.from("resolve_failures").select("*", { count: "exact", head: true });

    const initialWithout = Math.max(0, (totalContent || 0) - (cachedCount || 0) - (failedCount || 0));
    setResolveProgress({ current: 0, total: initialWithout });

    try {
      const launchFn = vpsAvailable
        ? () => fetch(`${vpsUrl}/api/batch-resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ _wave: 0 }), signal: AbortSignal.timeout(10_000) }).catch(() => {})
        : () => supabase.functions.invoke("turbo-resolve").catch(() => {});

      toast({ title: vpsAvailable ? "⚡ VPS Online" : "☁️ Cloud Mode", description: "Resolução iniciada..." });
      await launchFn();

      let lastRemaining = initialWithout;
      let stagnant = 0;
      let elapsed = 0;
      while (!cancelRef.current && elapsed < 15 * 60 * 1000) {
        await sleep(4000);
        elapsed += 4000;
        const [{ count: t }, { count: c }, { count: f }] = await Promise.all([
          supabase.from("content").select("*", { count: "exact", head: true }),
          supabase.from("video_cache").select("*", { count: "exact", head: true }).gt("expires_at", new Date().toISOString()),
          supabase.from("resolve_failures").select("*", { count: "exact", head: true }),
        ]);
        const remaining = Math.max(0, (t || 0) - (c || 0) - (f || 0));
        setResolveProgress({ current: Math.max(0, initialWithout - remaining), total: initialWithout });
        if (remaining <= 0) break;
        if (remaining >= lastRemaining) stagnant++; else stagnant = 0;
        if (stagnant >= 6) { await launchFn(); stagnant = 0; }
        lastRemaining = remaining;
      }
      toast({ title: cancelRef.current ? "Cancelado" : "Concluído" });
    } catch {
      toast({ title: "Erro", description: "Falha na resolução", variant: "destructive" });
    }

    setResolving(false);
    loadStats();
    loadItems();
  };

  const openNativePlayer = (item: ContentItem) => {
    const status = videoStatuses.get(item.tmdb_id);
    if (!status?.has_video || !status.video_url) return;
    const slug = toSlug(item.title, item.tmdb_id);
    const playerType = item.content_type === "movie" ? "movie" : "tv";
    const params = new URLSearchParams({
      title: item.title,
      url: status.video_url,
      type: status.video_type === "mp4" ? "mp4" : "m3u8",
      audio: "legendado",
      tmdb: String(item.tmdb_id),
      ct: playerType,
    });
    navigate(`/player/${playerType}/${slug}?${params.toString()}`);
  };

  const getApiLink = (item: ContentItem) => `/player/${item.content_type}/${item.tmdb_id}`;

  const filteredItems = filterStatus === "all"
    ? items
    : items.filter(i => {
        const s = videoStatuses.get(i.tmdb_id);
        return filterStatus === "with" ? s?.has_video : !s?.has_video;
      });

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  // Calculate import progress percentage
  const importPercent = importProgress
    ? importProgress.totalPages
      ? Math.min(99, Math.round((importProgress.pagesProcessed / (importProgress.totalPages * 2)) * 100))
      : importProgress.pagesProcessed > 0 ? Math.min(95, importProgress.pagesProcessed) : 5
    : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-2 sm:gap-3">
            <Database className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            Banco de Vídeos
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Gerenciamento e indexação de links de vídeo</p>
        </div>
        <button
          onClick={resolving ? () => { cancelRef.current = true; } : resolveAllLinks}
          className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${
            resolving
              ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
        >
          {resolving ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Cancelar ({resolveProgress.current}/{resolveProgress.total})</>
          ) : (
            <><RefreshCw className="w-4 h-4" />Resolver Todos</>
          )}
        </button>
      </div>

      {/* Stats — always precise from DB */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="glass p-3 sm:p-4 rounded-xl text-center">
          <p className="text-lg sm:text-2xl font-bold text-primary">{stats.total.toLocaleString()}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Total Catálogo</p>
        </div>
        <div className="glass p-3 sm:p-4 rounded-xl text-center">
          <p className="text-lg sm:text-2xl font-bold text-emerald-400">{stats.withVideo.toLocaleString()}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Com Vídeo</p>
        </div>
        <div className="glass p-3 sm:p-4 rounded-xl text-center">
          <p className="text-lg sm:text-2xl font-bold text-amber-400">{stats.withoutVideo.toLocaleString()}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Sem Vídeo</p>
        </div>
      </div>

      {/* Provider Breakdown */}
      {Object.keys(stats.byProvider).length > 0 && (
        <div className="glass p-3 sm:p-4 rounded-xl">
          <p className="text-xs font-semibold text-muted-foreground mb-2">📊 Links por Provedor</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.byProvider)
              .sort((a, b) => b[1] - a[1])
              .map(([provider, count]) => (
                <div key={provider} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10">
                  <span className="text-[10px] font-medium text-foreground">{provider}</span>
                  <span className="text-[10px] font-bold text-primary">{count.toLocaleString()}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* CineVeo API Import */}
      <div className="glass p-3 sm:p-4 rounded-xl border border-primary/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-xs sm:text-sm font-semibold">CineVeo API</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">EXCLUSIVO</span>
          </div>
          {!importing ? (
            <button onClick={startImport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/15 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/25 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> Importar Tudo
            </button>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-primary"><Loader2 className="w-3.5 h-3.5 animate-spin" />Importando...</span>
          )}
        </div>

        {importing && importProgress && (
          <div className="mt-3 space-y-2">
            <div className="relative h-2 rounded-full bg-muted overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-500"
                style={{ width: `${importPercent}%` }} />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>
                {importProgress.currentType === "movies" ? "🎬 Filmes" : "📺 Séries"} — Página {importProgress.currentPage || 0}
                {importProgress.totalPages ? ` / ${importProgress.totalPages}` : ""}
              </span>
              <span className="font-medium text-primary">
                {importProgress.contentTotal.toLocaleString()} conteúdos • {importProgress.cacheTotal.toLocaleString()} links
              </span>
            </div>
          </div>
        )}

        {!importing && (
          <p className="mt-2 text-[10px] text-emerald-400 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            {stats.withVideo.toLocaleString()} links • {stats.total.toLocaleString()} no catálogo
          </p>
        )}
      </div>

      {/* Resolve progress */}
      {resolving && resolveProgress.total > 0 && (
        <div className="glass p-3 sm:p-4 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <span className="text-muted-foreground">Resolvendo links...</span>
            <span className="font-medium text-primary">
              {resolveProgress.current}/{resolveProgress.total} ({Math.round((resolveProgress.current / resolveProgress.total) * 100)}%)
            </span>
          </div>
          <div className="relative h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-300"
              style={{ width: `${(resolveProgress.current / resolveProgress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text" value={filterText}
            onChange={(e) => { setFilterText(e.target.value); setPage(0); }}
            placeholder="Buscar por título..."
            className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
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
          {(["all", "with", "without"] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-medium border transition-colors ${
                filterStatus === s ? "bg-primary/20 border-primary/30 text-primary" : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
              }`}>
              {s === "all" ? "Todos" : s === "with" ? "✓ Com vídeo" : "✗ Sem vídeo"}
            </button>
          ))}
        </div>
      </div>

      {/* Content list */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="glass p-8 sm:p-12 text-center">
          <Database className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-xs sm:text-sm">
            {stats.total === 0 ? "Catálogo vazio — clique em Importar Tudo para começar" : "Nenhum conteúdo encontrado"}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: card view */}
          <div className="sm:hidden space-y-2">
            {filteredItems.map((item) => {
              const status = videoStatuses.get(item.tmdb_id);
              return (
                <div key={item.id} className="glass p-3 rounded-xl flex items-center gap-3">
                  {item.poster_path ? (
                    <img src={item.poster_path.startsWith("http") ? item.poster_path : `https://image.tmdb.org/t/p/w92${item.poster_path}`} alt={item.title} className="w-10 h-14 rounded-lg object-cover flex-shrink-0" />
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
                      {status?.has_video ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-muted-foreground/40" />}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 relative">
                    <button
                      onClick={() => resolvingItems.has(item.id) ? null : setProviderMenu(providerMenu === item.id ? null : item.id)}
                      disabled={resolvingItems.has(item.id)}
                      className="w-7 h-7 rounded-lg bg-white/5 text-muted-foreground flex items-center justify-center hover:bg-white/10 disabled:opacity-50"
                    >
                      {resolvingItems.has(item.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    </button>
                    {providerMenu === item.id && (
                      <div className="absolute right-0 top-8 z-50 bg-card border border-border rounded-xl shadow-xl p-1.5 min-w-[130px] animate-fade-in">
                        <button onClick={() => handleProviderSelect(item, "cineveo-api")} className="w-full text-left px-3 py-1.5 text-[11px] font-medium rounded-lg hover:bg-primary/10 text-foreground">CineVeo API</button>
                      </div>
                    )}
                    {status?.has_video && (
                      <button onClick={() => openNativePlayer(item)} className="w-7 h-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center hover:bg-primary/30">
                        <Play className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: table view */}
          <div className="hidden sm:block glass overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Título</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Tipo</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Vídeo</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3 hidden md:table-cell">Link</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Provider</th>
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const status = videoStatuses.get(item.tmdb_id);
                    return (
                      <tr key={item.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {item.poster_path ? (
                              <img src={item.poster_path.startsWith("http") ? item.poster_path : `https://image.tmdb.org/t/p/w92${item.poster_path}`} alt={item.title} className="w-8 h-12 rounded-lg object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-8 h-12 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0"><Film className="w-3 h-3" /></div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate max-w-[200px] lg:max-w-none">{item.title}</p>
                              <p className="text-[10px] text-muted-foreground">TMDB: {item.tmdb_id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-1 rounded-full border font-medium ${
                            item.content_type === "movie" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                          }`}>{item.content_type === "movie" ? "Filme" : "Série"}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {status?.has_video ? <CheckCircle className="w-4 h-4 text-emerald-400 mx-auto" /> : <XCircle className="w-4 h-4 text-muted-foreground/40 mx-auto" />}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {status?.has_video ? (
                            <span className="text-[10px] text-primary/70 font-mono bg-primary/5 px-2 py-1 rounded-lg border border-primary/10 truncate block max-w-[200px]">
                              {status.video_url?.substring(0, 60)}...
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/40">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="text-xs text-muted-foreground">{status?.provider || "—"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 justify-end">
                            <div className="relative">
                              <button
                                onClick={() => resolvingItems.has(item.id) ? null : setProviderMenu(providerMenu === item.id ? null : item.id)}
                                disabled={resolvingItems.has(item.id)}
                                className="w-7 h-7 rounded-lg bg-white/5 text-muted-foreground flex items-center justify-center hover:bg-white/10 disabled:opacity-50" title="Resolver link"
                              >
                                {resolvingItems.has(item.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                              </button>
                              {providerMenu === item.id && (
                                <div className="absolute right-0 top-8 z-50 bg-card border border-border rounded-xl shadow-xl p-1.5 min-w-[130px] animate-fade-in">
                                  <button onClick={() => handleProviderSelect(item, "cineveo-api")} className="w-full text-left px-3 py-1.5 text-[11px] font-medium rounded-lg hover:bg-primary/10 text-foreground">CineVeo API</button>
                                </div>
                              )}
                            </div>
                            {status?.has_video && (
                              <button onClick={() => openNativePlayer(item)} className="w-7 h-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center hover:bg-primary/30" title="Abrir player">
                                <Play className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                {page * ITEMS_PER_PAGE + 1}–{Math.min((page + 1) * ITEMS_PER_PAGE, totalCount)} de {totalCount}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 disabled:opacity-30 transition-colors">←</button>
                <span className="text-xs text-muted-foreground font-medium">Pág {page + 1}/{totalPages}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * ITEMS_PER_PAGE >= totalCount}
                  className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 disabled:opacity-30 transition-colors">→</button>
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
};

export default BancoPage;
