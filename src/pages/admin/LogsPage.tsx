import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollText, CheckCircle, XCircle, Film, Tv, Loader2, Trash2, X, Play, ExternalLink, Upload } from "lucide-react";
import { toast } from "sonner";

interface ResolveLog {
  id: string;
  tmdb_id: number;
  title: string;
  content_type: string;
  season: number | null;
  episode: number | null;
  provider: string | null;
  video_url: string | null;
  video_type: string | null;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

const providerLabels: Record<string, string> = {
  cineveo: "CDN Prime",
  megaembed: "Fonte B",
  embedplay: "Fonte C",
  playerflix: "Fonte D",
  "json-import": "📦 JSON Import",
};

const LogsPage = () => {
  const [logs, setLogs] = useState<ResolveLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "success" | "failed">("all");
  const [filterType, setFilterType] = useState<"all" | "movie" | "series">("all");
  const [totalSuccess, setTotalSuccess] = useState(0);
  const [totalFailed, setTotalFailed] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedLog, setSelectedLog] = useState<ResolveLog | null>(null);
  const [tmdbDetail, setTmdbDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [testingPlayer, setTestingPlayer] = useState(false);
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchCounts = useCallback(async () => {
    const [{ count: sCount }, { count: fCount }, { count: tCount }] = await Promise.all([
      supabase.from("resolve_logs").select("*", { count: "exact", head: true }).eq("success", true),
      supabase.from("resolve_logs").select("*", { count: "exact", head: true }).eq("success", false),
      supabase.from("resolve_logs").select("*", { count: "exact", head: true }),
    ]);
    setTotalSuccess(sCount || 0);
    setTotalFailed(fCount || 0);
    setTotalCount(tCount || 0);
  }, []);

  const fetchLogs = useCallback(async () => {
    let query = supabase
      .from("resolve_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (filter === "success") query = query.eq("success", true);
    if (filter === "failed") query = query.eq("success", false);
    if (filterType !== "all") query = query.eq("content_type", filterType);

    const { data } = await query;
    if (data) setLogs(data as ResolveLog[]);
    setLoading(false);
  }, [filter, filterType]);

  useEffect(() => {
    fetchLogs();
    fetchCounts();
    
    // Auto-start JSON import if not running already
    const autoImportKey = "lyneflix_json_import_last";
    const lastImport = localStorage.getItem(autoImportKey);
    const elapsed = lastImport ? Date.now() - parseInt(lastImport, 10) : Infinity;
    // Only auto-trigger if > 6 hours since last import
    if (elapsed > 6 * 3600000) {
      localStorage.setItem(autoImportKey, Date.now().toString());
      (async () => {
        try {
          const res = await fetch("/data/filmes_3.json");
          const items = await res.json();
          await supabase.functions.invoke("import-json-catalog", {
            body: { items, offset: 0, batch_size: 200 },
          });
          toast.info("📦 Importação automática do JSON iniciada!");
        } catch {}
      })();
    }
  }, [fetchLogs, fetchCounts]);

  useEffect(() => {
    const channel = supabase
      .channel("resolve-logs-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "resolve_logs" },
        (payload) => {
          const newLog = payload.new as ResolveLog;
          setTotalCount(prev => prev + 1);
          if (newLog.success) setTotalSuccess(prev => prev + 1);
          else setTotalFailed(prev => prev + 1);

          if (filter === "success" && !newLog.success) return;
          if (filter === "failed" && newLog.success) return;
          if (filterType !== "all" && newLog.content_type !== filterType) return;

          setLogs((prev) => [newLog, ...prev].slice(0, 200));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [filter, filterType]);

  const clearLogs = async () => {
    await supabase.from("resolve_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setLogs([]);
    setTotalSuccess(0);
    setTotalFailed(0);
    setTotalCount(0);
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  };

  // Start JSON auto-import
  const startJsonImport = async () => {
    setImporting(true);
    try {
      const res = await fetch("/data/filmes_3.json");
      const items = await res.json();
      toast.info(`Iniciando importação de ${items.length} itens do JSON...`);

      const { error } = await supabase.functions.invoke("import-json-catalog", {
        body: { items, offset: 0, batch_size: 200 },
      });

      if (error) throw error;
      toast.success("Importação iniciada! Acompanhe nos logs abaixo.");
    } catch (err: any) {
      toast.error(`Erro ao iniciar: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  // Open log detail modal
  const openLogDetail = async (log: ResolveLog) => {
    setSelectedLog(log);
    setTmdbDetail(null);
    setPlayerUrl(null);
    setLoadingDetail(true);

    try {
      const tmdbType = log.content_type === "movie" ? "movie" : "tv";
      const tmdbRes = await fetch(
        `https://api.themoviedb.org/3/${tmdbType}/${log.tmdb_id}?language=pt-BR`,
        {
          headers: {
            Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI1MDFiOWNkYjllNDQ0NjkxMDJiODk5YjQ0YjU2MWQ5ZCIsIm5iZiI6MTc3MTIzMDg1My43NjYsInN1YiI6IjY5OTJkNjg1NzZjODAxNTdmMjFhZjMxMSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.c47JvphccOz_oyaUuQWCHQ1mXAsSH01OB14vKE2uenw",
          },
        }
      );
      if (tmdbRes.ok) {
        setTmdbDetail(await tmdbRes.json());
      }
    } catch {}
    setLoadingDetail(false);
  };

  // Test player for a log entry
  const testPlayer = async (log: ResolveLog) => {
    setTestingPlayer(true);
    setPlayerUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke("extract-video", {
        body: {
          tmdb_id: log.tmdb_id,
          content_type: log.content_type,
          season: log.season || undefined,
          episode: log.episode || undefined,
        },
      });
      if (error) throw error;
      if (data?.url && data?.type !== "iframe-proxy") {
        setPlayerUrl(data.url);
      } else {
        toast.error("Nenhuma fonte direta encontrada");
      }
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setTestingPlayer(false);
    }
  };

  const successRate = totalCount > 0 ? ((totalSuccess / totalCount) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-2">
            <ScrollText className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            Logs de Extração
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Monitoramento em tempo real de indexação de vídeos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startJsonImport}
            disabled={importing}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors disabled:opacity-50"
          >
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Importar JSON
          </button>
          <button
            onClick={clearLogs}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpar Logs
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        <div className="glass p-3 sm:p-4 rounded-xl text-center">
          <p className="text-lg sm:text-2xl font-bold text-primary tabular-nums">{totalCount.toLocaleString()}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Total</p>
        </div>
        <div className="glass p-3 sm:p-4 rounded-xl text-center">
          <p className="text-lg sm:text-2xl font-bold text-emerald-400 tabular-nums">{totalSuccess.toLocaleString()}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Sucesso</p>
        </div>
        <div className="glass p-3 sm:p-4 rounded-xl text-center">
          <p className="text-lg sm:text-2xl font-bold text-red-400 tabular-nums">{totalFailed.toLocaleString()}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Falhas</p>
        </div>
        <div className="glass p-3 sm:p-4 rounded-xl text-center">
          <p className="text-lg sm:text-2xl font-bold text-amber-400 tabular-nums">{successRate}%</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Taxa</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {(["all", "success", "failed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-medium border transition-colors ${
              filter === f
                ? "bg-primary/20 border-primary/30 text-primary"
                : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
            }`}
          >
            {f === "all" ? "Todos" : f === "success" ? "✓ Sucesso" : "✗ Falhas"}
          </button>
        ))}
        <div className="w-px h-6 bg-white/10 mx-1 self-center" />
        {(["all", "movie", "series"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-medium border transition-colors ${
              filterType === t
                ? "bg-primary/20 border-primary/30 text-primary"
                : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
            }`}
          >
            {t === "all" ? "Todos" : t === "movie" ? "Filmes" : "Séries"}
          </button>
        ))}
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
        Atualizando em tempo real
      </div>

      {/* Logs list */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : logs.length === 0 ? (
        <div className="glass p-8 sm:p-12 text-center">
          <ScrollText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-xs sm:text-sm">Nenhum log registrado ainda</p>
          <p className="text-muted-foreground/60 text-[10px] sm:text-xs mt-1">
            Os logs aparecerão aqui quando o sistema resolver links de vídeo
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {logs.map((log) => (
            <div
              key={log.id}
              onClick={() => openLogDetail(log)}
              className={`glass rounded-xl p-3 sm:p-4 flex items-start gap-3 border-l-2 transition-all cursor-pointer hover:bg-white/5 ${
                log.success ? "border-l-emerald-500/60" : "border-l-red-500/60"
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {log.success ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs sm:text-sm font-medium text-foreground truncate max-w-[200px] sm:max-w-none">
                    {log.title}
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
                      log.content_type === "movie"
                        ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                        : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                    }`}
                  >
                    {log.content_type === "movie" ? "Filme" : "Série"}
                  </span>
                  {log.provider === "json-import" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      📦 JSON
                    </span>
                  )}
                  {log.season && log.episode && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-muted-foreground">
                      S{log.season}E{log.episode}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {log.provider && (
                    <span className="text-[10px] sm:text-xs text-primary/80 font-medium">
                      {providerLabels[log.provider] || log.provider}
                    </span>
                  )}
                  {log.video_url && (
                    <span className="text-[9px] font-mono text-muted-foreground/60 truncate max-w-[150px] sm:max-w-[300px]">
                      {log.video_url.substring(0, 60)}...
                    </span>
                  )}
                  {log.error_message && (
                    <span className="text-[9px] text-red-400/70 truncate max-w-[200px]">
                      {log.error_message}
                    </span>
                  )}
                </div>
              </div>

              <span className="text-[9px] sm:text-[10px] text-muted-foreground/50 flex-shrink-0 whitespace-nowrap">
                {formatTime(log.created_at)}
              </span>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      )}

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setSelectedLog(null); setPlayerUrl(null); }} />
          <div className="relative w-full max-w-lg glass rounded-2xl border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => { setSelectedLog(null); setPlayerUrl(null); }}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-5 space-y-4">
              {/* Backdrop */}
              {tmdbDetail?.backdrop_path && (
                <div className="relative rounded-xl overflow-hidden -mx-5 -mt-5 mb-4">
                  <img
                    src={`https://image.tmdb.org/t/p/w780${tmdbDetail.backdrop_path}`}
                    alt=""
                    className="w-full h-40 object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                </div>
              )}

              {/* Title + badges */}
              <div>
                <h2 className="text-lg font-display font-bold text-foreground pr-8">
                  {selectedLog.title}
                </h2>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    selectedLog.success
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-red-500/10 text-red-400 border-red-500/20"
                  }`}>
                    {selectedLog.success ? "✓ Sucesso" : "✗ Falha"}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    selectedLog.content_type === "movie"
                      ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                      : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                  }`}>
                    {selectedLog.content_type === "movie" ? "Filme" : "Série"}
                  </span>
                  {selectedLog.provider && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      {providerLabels[selectedLog.provider] || selectedLog.provider}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    TMDB: {selectedLog.tmdb_id}
                  </span>
                </div>
              </div>

              {/* TMDB info */}
              {loadingDetail ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : tmdbDetail && (
                <div className="space-y-3">
                  <div className="flex gap-3">
                    {tmdbDetail.poster_path && (
                      <img
                        src={`https://image.tmdb.org/t/p/w154${tmdbDetail.poster_path}`}
                        alt=""
                        className="w-16 h-24 rounded-lg object-cover flex-shrink-0"
                      />
                    )}
                    <div className="space-y-1.5">
                      {tmdbDetail.overview && (
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
                          {tmdbDetail.overview}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground/70">
                        {tmdbDetail.vote_average > 0 && (
                          <span>⭐ {tmdbDetail.vote_average.toFixed(1)}</span>
                        )}
                        {(tmdbDetail.release_date || tmdbDetail.first_air_date) && (
                          <span>{(tmdbDetail.release_date || tmdbDetail.first_air_date)?.substring(0, 4)}</span>
                        )}
                        {tmdbDetail.runtime && <span>{tmdbDetail.runtime}min</span>}
                        {tmdbDetail.number_of_seasons && <span>{tmdbDetail.number_of_seasons} temp.</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Log details */}
              <div className="space-y-2 glass rounded-xl p-3">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Detalhes do Log</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground/60">Data:</span>
                    <span className="ml-1 text-foreground">{formatTime(selectedLog.created_at)}</span>
                  </div>
                  {selectedLog.season && (
                    <div>
                      <span className="text-muted-foreground/60">Temporada:</span>
                      <span className="ml-1 text-foreground">S{selectedLog.season}E{selectedLog.episode}</span>
                    </div>
                  )}
                  {selectedLog.video_url && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground/60">URL:</span>
                      <span className="ml-1 text-foreground/70 font-mono text-[9px] break-all">
                        {selectedLog.video_url}
                      </span>
                    </div>
                  )}
                  {selectedLog.error_message && (
                    <div className="col-span-2">
                      <span className="text-red-400/80">Erro:</span>
                      <span className="ml-1 text-red-300/70 text-[10px]">{selectedLog.error_message}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Player test */}
              {playerUrl ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Player Teste</p>
                  <div className="rounded-xl overflow-hidden bg-black aspect-video">
                    <video
                      src={playerUrl}
                      controls
                      autoPlay
                      className="w-full h-full"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => testPlayer(selectedLog)}
                    disabled={testingPlayer}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {testingPlayer ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    Testar Player
                  </button>
                  <button
                    onClick={() => {
                      const type = selectedLog.content_type === "movie" ? "filme" : "serie";
                      window.open(`/player/${type}/${selectedLog.tmdb_id}?title=${encodeURIComponent(selectedLog.title)}`, "_blank");
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 text-foreground hover:bg-white/10 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LogsPage;
