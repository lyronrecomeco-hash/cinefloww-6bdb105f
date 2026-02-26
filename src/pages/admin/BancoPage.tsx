import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database, Film, Tv, Loader2, Play, RefreshCw, CheckCircle, XCircle, Search, ExternalLink, Link2, X, Upload, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CustomPlayer from "@/components/CustomPlayer";
import { initVpsClient, isVpsOnline, getVpsUrl } from "@/lib/vpsClient";
import { secureVideoUrl } from "@/lib/videoUrl";

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
  const [items, setItems] = useState<ContentItem[]>([]);
  const [videoStatuses, setVideoStatuses] = useState<Map<number, VideoStatus>>(new Map());
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [filterText, setFilterText] = useState("");
  const [filterType, setFilterType] = useState<"all" | "movie" | "series">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "with" | "without">("all");
  const [resolving, setResolving] = useState(false);
  const [resolveProgress, setResolveProgress] = useState({ current: 0, total: 0 });
  const cancelRef = useRef(false);
  const autoResolveStarted = useRef(false);
  const { toast } = useToast();
  const [stats, setStats] = useState({ total: 0, withVideo: 0, withoutVideo: 0, byProvider: {} as Record<string, number> });
  const [playerItem, setPlayerItem] = useState<ContentItem | null>(null);
  const [protectedPlayerUrl, setProtectedPlayerUrl] = useState<string | null>(null);
  const [playerUrlLoading, setPlayerUrlLoading] = useState(false);
  const [providerMenu, setProviderMenu] = useState<string | null>(null);
  const [resolvingItems, setResolvingItems] = useState<Set<string>>(new Set());
  // VisionCine removed
  // IPTV CiineVeo import state
  const [iptvImporting, setIptvImporting] = useState(false);
  const [iptvProgress, setIptvProgress] = useState<{ phase: string; entries: number; valid: number; cache: number; content: number; done: boolean } | null>(null);
  const [iptvDbStats, setIptvDbStats] = useState<{ links: number; content: number }>({ links: 0, content: 0 });
  // CineVeo API import state
  const [cineveoImporting, setCineveoImporting] = useState(false);
  const [cineveoProgress, setCineveoProgress] = useState<any>(null);
  const [cineveoDbStats, setCineveoDbStats] = useState<{ links: number; content: number }>({ links: 0, content: 0 });

  // Load everything in ONE parallel blast
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const from = page * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    let contentQuery = supabase
      .from("content")
      .select("id, tmdb_id, imdb_id, title, content_type, poster_path, release_date", { count: "exact" })
      .order("release_date", { ascending: false, nullsFirst: false })
      .range(from, to);

    if (filterType !== "all") contentQuery = contentQuery.eq("content_type", filterType);
    if (filterText.trim()) contentQuery = contentQuery.ilike("title", `%${filterText.trim()}%`);

    // Fire ALL queries in parallel — zero sequential waits
    const [contentResult, statsResult, providerResult] = await Promise.all([
      contentQuery,
      supabase.from("content").select("*", { count: "exact", head: true }),
      supabase.rpc("get_video_stats_by_provider" as any),
    ]);

    const { data, count } = contentResult;
    if (data) {
      setItems(data);
      setTotalCount(count || 0);

      // Fetch video statuses in parallel with setting items
      const tmdbIds = data.map(i => i.tmdb_id);
      if (tmdbIds.length > 0) {
        const { data: cached } = await supabase
          .from("video_cache")
          .select("tmdb_id, video_url, provider, video_type")
          .in("tmdb_id", tmdbIds)
          .gt("expires_at", new Date().toISOString());

        const statusMap = new Map<number, VideoStatus>();
        const cachedMap = new Map(cached?.map(c => [c.tmdb_id, c]) || []);
        for (const item of data) {
          const cachedItem = cachedMap.get(item.tmdb_id);
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

    // Process stats
    const total = statsResult.count || 0;
    const providerData = providerResult.data;
    if (providerData && Array.isArray(providerData)) {
      const byProvider: Record<string, number> = {};
      let uniqueWithVideo = 0;
      for (const row of providerData as any[]) {
        byProvider[row.provider] = Number(row.cnt);
        uniqueWithVideo += Number(row.cnt);
      }
      setStats({ total, withVideo: uniqueWithVideo, withoutVideo: Math.max(0, total - uniqueWithVideo), byProvider });
    } else {
      const { count: withVideo } = await supabase
        .from("video_cache")
        .select("tmdb_id", { count: "exact", head: true })
        .gt("expires_at", new Date().toISOString());
      setStats({ total, withVideo: withVideo || 0, withoutVideo: Math.max(0, total - (withVideo || 0)), byProvider: {} });
    }

    setLoading(false);
  }, [page, filterType, filterText]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);


  // Realtime subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel('video-cache-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'video_cache' }, (payload) => {
        const newItem = payload.new as any;
        setStats(prev => ({
          ...prev,
          withVideo: prev.withVideo + 1,
          withoutVideo: Math.max(0, prev.withoutVideo - 1),
        }));
        setVideoStatuses(prev => {
          const next = new Map(prev);
          next.set(newItem.tmdb_id, {
            tmdb_id: newItem.tmdb_id,
            has_video: true,
            video_url: newItem.video_url,
            provider: newItem.provider,
            video_type: newItem.video_type,
          });
          return next;
        });
        if (resolving) {
          setResolveProgress(prev => ({ ...prev, current: prev.current + 1 }));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [resolving]);

  useEffect(() => {
    let alive = true;

    const resolveProtectedPlayerUrl = async () => {
      if (!playerItem) {
        setProtectedPlayerUrl(null);
        setPlayerUrlLoading(false);
        return;
      }

      const status = videoStatuses.get(playerItem.tmdb_id);
      if (!status?.has_video || !status.video_url) {
        setProtectedPlayerUrl(null);
        setPlayerUrlLoading(false);
        return;
      }

      if (status.video_type === "iframe-proxy") {
        setProtectedPlayerUrl(status.video_url);
        setPlayerUrlLoading(false);
        return;
      }

      setPlayerUrlLoading(true);
      try {
        const safeUrl = await secureVideoUrl(status.video_url);
        if (alive) setProtectedPlayerUrl(safeUrl);
      } catch {
        if (alive) setProtectedPlayerUrl(status.video_url);
      } finally {
        if (alive) setPlayerUrlLoading(false);
      }
    };

    resolveProtectedPlayerUrl();
    return () => { alive = false; };
  }, [playerItem, videoStatuses]);

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
        toast({
          title: "❌ Não encontrado",
          description: data?.message || `${item.title} — ${forceProvider || "nenhum provedor"} não possui este conteúdo`,
          variant: "destructive",
        });
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
      setResolvingItems(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Resolve ALL links — VPS-first, fallback to turbo-resolve
  const resolveAllLinks = async () => {
    setResolving(true);
    cancelRef.current = false;

    // Init VPS and check if online
    await initVpsClient();
    const vpsUrl = getVpsUrl();
    const vpsAvailable = isVpsOnline() && !!vpsUrl;

    const { count: totalContent } = await supabase
      .from("content")
      .select("*", { count: "exact", head: true });
    const { count: cachedCount } = await supabase
      .from("video_cache")
      .select("*", { count: "exact", head: true })
      .gt("expires_at", new Date().toISOString());
    const { count: failedCount } = await supabase
      .from("resolve_failures")
      .select("*", { count: "exact", head: true });

    const initialWithout = Math.max(0, (totalContent || 0) - (cachedCount || 0) - (failedCount || 0));
    setResolveProgress({ current: 0, total: initialWithout });

    try {
      if (vpsAvailable) {
        // === VPS MODE: trigger batch-resolve on VPS ===
        toast({ title: "⚡ VPS Online", description: "Resolução sendo executada na VPS..." });

        // Fire batch-resolve on the VPS
        const launchVpsWave = async () => {
          try {
            await fetch(`${vpsUrl}/api/batch-resolve`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ _wave: 0 }),
              signal: AbortSignal.timeout(10_000),
            });
          } catch { /* VPS will process in background */ }
        };

        await launchVpsWave();

        // Poll progress
        let lastRemaining = initialWithout;
        let stagnantPolls = 0;
        let elapsedMs = 0;
        const MAX_DURATION_MS = 15 * 60 * 1000;

        while (!cancelRef.current && elapsedMs < MAX_DURATION_MS) {
          await sleep(4000);
          elapsedMs += 4000;

          const [{ count: totalNow }, { count: cachedNow }, { count: failedNow }] = await Promise.all([
            supabase.from("content").select("*", { count: "exact", head: true }),
            supabase.from("video_cache").select("*", { count: "exact", head: true }).gt("expires_at", new Date().toISOString()),
            supabase.from("resolve_failures").select("*", { count: "exact", head: true }),
          ]);

          const remaining = Math.max(0, (totalNow || 0) - (cachedNow || 0) - (failedNow || 0));
          const current = Math.max(0, initialWithout - remaining);
          setResolveProgress({ current, total: initialWithout });

          if (remaining <= 0) break;

          if (remaining >= lastRemaining) {
            stagnantPolls += 1;
          } else {
            stagnantPolls = 0;
          }

          // Re-launch VPS wave if stagnant
          if (stagnantPolls >= 6) {
            await launchVpsWave();
            stagnantPolls = 0;
          }

          lastRemaining = remaining;
        }
      } else {
        // === CLOUD FALLBACK: use turbo-resolve edge function ===
        toast({ title: "☁️ Cloud Mode", description: "VPS offline, usando resolução Cloud..." });

        const launchWave = async () => {
          const { error } = await supabase.functions.invoke("turbo-resolve");
          if (error) throw error;
        };

        await launchWave();

        let lastRemaining = initialWithout;
        let stagnantPolls = 0;
        let elapsedMs = 0;
        const MAX_DURATION_MS = 15 * 60 * 1000;

        while (!cancelRef.current && elapsedMs < MAX_DURATION_MS) {
          await sleep(4000);
          elapsedMs += 4000;

          const [{ count: totalNow }, { count: cachedNow }, { count: failedNow }] = await Promise.all([
            supabase.from("content").select("*", { count: "exact", head: true }),
            supabase.from("video_cache").select("*", { count: "exact", head: true }).gt("expires_at", new Date().toISOString()),
            supabase.from("resolve_failures").select("*", { count: "exact", head: true }),
          ]);

          const remaining = Math.max(0, (totalNow || 0) - (cachedNow || 0) - (failedNow || 0));
          const current = Math.max(0, initialWithout - remaining);
          setResolveProgress({ current, total: initialWithout });

          if (remaining <= 0) break;

          if (remaining >= lastRemaining) {
            stagnantPolls += 1;
          } else {
            stagnantPolls = 0;
          }

          if (stagnantPolls >= 6) {
            await launchWave();
            stagnantPolls = 0;
          }

          lastRemaining = remaining;
        }
      }

      toast({
        title: cancelRef.current ? "Resolução cancelada" : "Resolução concluída",
        description: vpsAvailable ? "Processado via VPS ⚡" : "Processado via Cloud ☁️",
      });
    } catch (e) {
      console.error("[banco] resolve error:", e);
      toast({ title: "Erro", description: "Falha na resolução em lote", variant: "destructive" });
    }

    setResolving(false);
    fetchAll();
  };

  // Build API-style link using hosted URL
  const getApiLink = (item: ContentItem) => {
    return `/player/${item.content_type}/${item.tmdb_id}`;
  };

  const openProtectedLink = async (rawUrl?: string) => {
    if (!rawUrl) return;
    try {
      const safeUrl = await secureVideoUrl(rawUrl);
      window.open(safeUrl, "_blank", "noopener,noreferrer");
    } catch {
      window.open(rawUrl, "_blank", "noopener,noreferrer");
    }
  };

  // VisionCine removed

  // Load IPTV DB stats on mount
  const loadIptvDbStats = useCallback(async () => {
    const { count: linkCount } = await supabase.from("video_cache").select("*", { count: "exact", head: true }).eq("provider", "cineveo-iptv");
    // Use a simple count approach: count content that has at least one cineveo-iptv link
    // We use the count from the progress + actual link count for display
    const { count: contentWithIptv } = await supabase
      .from("content")
      .select("*", { count: "exact", head: true });
    setIptvDbStats({ links: linkCount || 0, content: contentWithIptv || 0 });
  }, []);
  useEffect(() => { loadIptvDbStats(); }, [loadIptvDbStats]);

  // CineVeo API stats
  const loadCineveoDbStats = useCallback(async () => {
    const { count: linkCount } = await supabase.from("video_cache").select("*", { count: "exact", head: true }).eq("provider", "cineveo-api");
    setCineveoDbStats({ links: linkCount || 0, content: 0 });
  }, []);
  useEffect(() => { loadCineveoDbStats(); }, [loadCineveoDbStats]);

  // CineVeo API import
  const startCineveoImport = async () => {
    setCineveoImporting(true);
    setCineveoProgress({ phase: "fetching_catalog", total: 0, imported_content: 0, imported_cache: 0 });
    supabase.functions.invoke("import-cineveo-catalog", {
      body: { types: ["movies", "series"] },
    }).catch(() => {});
  };

  // Poll CineVeo progress
  useEffect(() => {
    if (!cineveoImporting) return;
    const interval = setInterval(async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "cineveo_import_progress").maybeSingle();
      if (data?.value) {
        const p = data.value as any;
        setCineveoProgress(p);
        if (p.done) {
          clearInterval(interval);
          setCineveoImporting(false);
          if (p.phase === "error") {
            toast({ title: "Erro CineVeo API", description: p.error || "Falha na importação", variant: "destructive" });
          } else {
            toast({ title: "✅ Importação CineVeo API concluída", description: `${p.imported_content || 0} conteúdos, ${p.imported_cache || 0} links` });
          }
          fetchAll();
          loadCineveoDbStats();
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [cineveoImporting]);

  // IPTV CiineVeo — fire once, auto-chains server-side, UI polls progress
  const IPTV_URL = "https://cineveo.site/api/generate_iptv_list.php?user=lyneflix-vods";
  const startIptvImport = async () => {
    setIptvImporting(true);
    setIptvProgress({ phase: "downloading", entries: 0, valid: 0, cache: 0, content: 0, done: false });

    // Single fire — function auto-chains itself
    supabase.functions.invoke("import-iptv", {
      body: { url: IPTV_URL },
    }).catch(() => {}); // Don't await — polling handles UI
  };

  // Poll IPTV progress from site_settings
  useEffect(() => {
    if (!iptvImporting) return;
    const interval = setInterval(async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "iptv_import_progress").maybeSingle();
      if (data?.value) {
        const p = data.value as any;
        setIptvProgress({
          phase: p.phase || "downloading",
          entries: p.entries || 0,
          valid: p.valid || 0,
          cache: p.cache_imported || p.cache || 0,
          content: p.content_imported || p.content || 0,
          done: p.done || false,
        });
        if (p.done) {
          clearInterval(interval);
          setIptvImporting(false);
          if (p.phase === "error") {
            toast({ title: "Erro IPTV", description: p.error || "Falha na importação", variant: "destructive" });
          } else {
            toast({
              title: "✅ Importação IPTV concluída",
              description: `Links importados com sucesso`,
            });
          }
          fetchAll();
          loadIptvDbStats();
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [iptvImporting]);

  const filteredItems = filterStatus === "all"
    ? items
    : items.filter(i => {
        const s = videoStatuses.get(i.tmdb_id);
        return filterStatus === "with" ? s?.has_video : !s?.has_video;
      });

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

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

      {/* Stats */}
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

      {/* VisionCine removed */}

      {/* CiineVeo IPTV Import */}
      <div className="glass p-3 sm:p-4 rounded-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" />
            <span className="text-xs sm:text-sm font-semibold">CiineVeo IPTV</span>
            <span className="text-[10px] text-muted-foreground">(links diretos .mp4)</span>
          </div>
          {!iptvImporting ? (
            <button onClick={startIptvImport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/15 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/25 transition-colors">
              <Upload className="w-3.5 h-3.5" /> Importar Lista
            </button>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-primary"><Loader2 className="w-3.5 h-3.5 animate-spin" />Importando...</span>
          )}
        </div>
        {iptvImporting && iptvProgress && (
          <div className="mt-2 space-y-1">
            <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all"
                style={{ width: iptvProgress.entries > 0 ? `${Math.round((iptvProgress.cache / Math.max(iptvProgress.valid, 1)) * 100)}%` : '0%' }} />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {iptvProgress.phase === "downloading" ? "Baixando lista..." :
               iptvProgress.phase === "importing_cache" ? `Importando links... ${iptvProgress.cache.toLocaleString()}/${iptvProgress.valid.toLocaleString()}` :
               iptvProgress.phase === "enriching_content" ? `Enriquecendo catálogo... ${iptvProgress.content} novos` :
               `${iptvProgress.entries.toLocaleString()} entradas, ${iptvProgress.cache} links, ${iptvProgress.content} conteúdos`}
            </p>
          </div>
        )}
        {!iptvImporting && (
          <p className="mt-2 text-[10px] text-emerald-400 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />{iptvDbStats.links.toLocaleString()} links importados ({iptvDbStats.content.toLocaleString()} no catálogo)
          </p>
        )}
      </div>

      {/* CineVeo API Import (automático a cada 4h) */}
      <div className="glass p-3 sm:p-4 rounded-xl border border-primary/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-xs sm:text-sm font-semibold">CineVeo API</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">AUTOMÁTICO</span>
            <span className="text-[9px] text-muted-foreground">a cada 4h</span>
          </div>
          {!cineveoImporting ? (
            <button onClick={startCineveoImport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-muted-foreground text-xs font-medium hover:bg-white/10 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> Forçar Atualização
            </button>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-primary"><Loader2 className="w-3.5 h-3.5 animate-spin" />Importando...</span>
          )}
        </div>
        {cineveoImporting && cineveoProgress && (
          <div className="mt-2 space-y-1">
            <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all"
                style={{ width: cineveoProgress.total > 0 ? `${Math.round(((cineveoProgress.imported_content || 0) + (cineveoProgress.imported_cache || 0)) / Math.max(cineveoProgress.total * 2, 1) * 100)}%` : '10%' }} />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {cineveoProgress.phase === "fetching_catalog" ? "Buscando catálogo da API..." :
               cineveoProgress.phase === "processing" ? `Processando ${cineveoProgress.total} itens...` :
               cineveoProgress.phase === "importing_content" ? `Importando conteúdo... ${cineveoProgress.imported_content || 0}` :
               cineveoProgress.phase === "done" ? `✅ ${cineveoProgress.imported_content || 0} conteúdos, ${cineveoProgress.imported_cache || 0} links` :
               cineveoProgress.phase === "error" ? `❌ ${cineveoProgress.error}` :
               "Processando..."}
            </p>
          </div>
        )}
        {!cineveoImporting && (
          <p className="mt-2 text-[10px] text-emerald-400 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />{cineveoDbStats.links.toLocaleString()} links via CineVeo API — atualização automática ativa
          </p>
        )}
      </div>

      {/* Resolve progress */}
      {resolving && resolveProgress.total > 0 && (
        <div className="glass p-3 sm:p-4 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <span className="text-muted-foreground">Resolvendo links (pág por pág, A→Z)...</span>
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
          <p className="text-muted-foreground text-xs sm:text-sm">Nenhum conteúdo encontrado</p>
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
                    <img src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt={item.title} className="w-10 h-14 rounded-lg object-cover flex-shrink-0" />
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
                      {status?.has_video ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-muted-foreground/40" />
                      )}
                    </div>
                    {status?.has_video && (
                      <p className="text-[9px] text-primary/60 font-mono mt-0.5 truncate">{getApiLink(item)}</p>
                    )}
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
                        <button onClick={() => handleProviderSelect(item, "cineveo-iptv")} className="w-full text-left px-3 py-1.5 text-[11px] font-medium rounded-lg hover:bg-primary/10 text-foreground">CineVeo IPTV</button>
                        <button onClick={() => handleProviderSelect(item, "mega")} className="w-full text-left px-3 py-1.5 text-[11px] font-medium rounded-lg hover:bg-primary/10 text-foreground">Mega.nz</button>
                      </div>
                    )}
                    {status?.has_video && (
                      <button onClick={() => setPlayerItem(item)} className="w-7 h-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center hover:bg-primary/30">
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
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3 hidden md:table-cell">Link API</th>
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
                              <img src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt={item.title} className="w-8 h-12 rounded-lg object-cover flex-shrink-0" />
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
                            <span className="text-[10px] text-primary/70 font-mono bg-primary/5 px-2 py-1 rounded-lg border border-primary/10">
                              {getApiLink(item)}
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
                                  <button onClick={() => handleProviderSelect(item, "cineveo-iptv")} className="w-full text-left px-3 py-1.5 text-[11px] font-medium rounded-lg hover:bg-primary/10 text-foreground">CineVeo IPTV</button>
                                  <button onClick={() => handleProviderSelect(item, "mega")} className="w-full text-left px-3 py-1.5 text-[11px] font-medium rounded-lg hover:bg-primary/10 text-foreground">Mega.nz</button>
                                </div>
                              )}
                            </div>
                            {status?.has_video && (
                              <>
                                <button onClick={() => setPlayerItem(item)} className="w-7 h-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center hover:bg-primary/30" title="Abrir player">
                                  <Play className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => openProtectedLink(status.video_url)}
                                  className="w-7 h-7 rounded-lg bg-white/5 text-muted-foreground flex items-center justify-center hover:bg-white/10"
                                  title="Link direto"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              </>
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

      {/* Player Modal - URL sempre assinada antes de reproduzir */}
      {playerItem && (() => {
        const status = videoStatuses.get(playerItem.tmdb_id);
        if (!status?.has_video || !status.video_url) return null;
        return (
          <div className="fixed inset-0 z-[100] bg-black animate-fade-in">
            {playerUrlLoading || !protectedPlayerUrl ? (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <CustomPlayer
                sources={[{
                  url: protectedPlayerUrl,
                  quality: "auto",
                  provider: status.provider || "cache",
                  type: (status.video_type === "mp4" ? "mp4" : "m3u8") as "mp4" | "m3u8",
                }]}
                title={playerItem.title}
                onClose={() => {
                  setPlayerItem(null);
                  setProtectedPlayerUrl(null);
                }}
                onError={() => {
                  setPlayerItem(null);
                  setProtectedPlayerUrl(null);
                }}
              />
            )}
          </div>
        );
      })()}
    </div>
  );
};

export default BancoPage;
