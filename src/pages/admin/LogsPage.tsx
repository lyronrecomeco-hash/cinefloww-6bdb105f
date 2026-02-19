import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollText, CheckCircle, XCircle, Film, Tv, Loader2, Trash2 } from "lucide-react";

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
};

const LogsPage = () => {
  const [logs, setLogs] = useState<ResolveLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "success" | "failed">("all");
  const [filterType, setFilterType] = useState<"all" | "movie" | "series">("all");
  const [totalSuccess, setTotalSuccess] = useState(0);
  const [totalFailed, setTotalFailed] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Fetch real-time counts from DB
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
  }, [fetchLogs, fetchCounts]);

  // Real-time subscription - update both logs AND counts
  useEffect(() => {
    const channel = supabase
      .channel("resolve-logs-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "resolve_logs" },
        (payload) => {
          const newLog = payload.new as ResolveLog;
          
          // Update counts in real-time
          setTotalCount(prev => prev + 1);
          if (newLog.success) setTotalSuccess(prev => prev + 1);
          else setTotalFailed(prev => prev + 1);

          // Apply filters for log list
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
        <button
          onClick={clearLogs}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Limpar Logs
        </button>
      </div>

      {/* Stats - Real-time counters from DB */}
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
              className={`glass rounded-xl p-3 sm:p-4 flex items-start gap-3 border-l-2 transition-all ${
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
    </div>
  );
};

export default LogsPage;
