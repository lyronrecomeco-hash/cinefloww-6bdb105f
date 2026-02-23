import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Shield, AlertTriangle, Activity, Users, Globe, Clock, Ban, CheckCircle, RefreshCw } from "lucide-react";

interface AccessLog {
  id: string;
  endpoint: string;
  ip_hash: string | null;
  user_agent: string | null;
  blocked: boolean;
  reason: string | null;
  accessed_at: string;
}

interface Stats {
  totalRequests: number;
  blockedRequests: number;
  uniqueIPs: number;
  blockRate: number;
  topEndpoints: { endpoint: string; count: number }[];
  topReasons: { reason: string; count: number }[];
  requestsPerMinute: number;
}

const SecurityMonitor = () => {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalRequests: 0, blockedRequests: 0, uniqueIPs: 0, blockRate: 0,
    topEndpoints: [], topReasons: [], requestsPerMinute: 0,
  });
  const [loading, setLoading] = useState(true);
  const [liveMode, setLiveMode] = useState(true);
  const [visitors, setVisitors] = useState({ today: 0, total: 0, uniqueToday: 0 });
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchData = useCallback(async () => {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // Fetch logs, stats, visitors in parallel
    const [logsRes, totalRes, blockedRes, visitorsRes, todayVisitorsRes] = await Promise.all([
      supabase.from("api_access_log").select("*").gte("accessed_at", last24h).order("accessed_at", { ascending: false }).limit(100),
      supabase.from("api_access_log").select("id", { count: "exact", head: true }).gte("accessed_at", last24h),
      supabase.from("api_access_log").select("id", { count: "exact", head: true }).gte("accessed_at", last24h).eq("blocked", true),
      supabase.from("site_visitors").select("id", { count: "exact", head: true }),
      supabase.from("site_visitors").select("visitor_id", { count: "exact", head: true }).gte("visited_at", todayStart),
    ]);

    const recentLogs = (logsRes.data || []) as AccessLog[];
    setLogs(recentLogs);

    const total = totalRes.count || 0;
    const blocked = blockedRes.count || 0;
    const uniqueIPs = new Set(recentLogs.map(l => l.ip_hash).filter(Boolean)).size;

    // Compute top endpoints
    const endpointMap: Record<string, number> = {};
    const reasonMap: Record<string, number> = {};
    recentLogs.forEach(l => {
      endpointMap[l.endpoint] = (endpointMap[l.endpoint] || 0) + 1;
      if (l.reason) reasonMap[l.reason] = (reasonMap[l.reason] || 0) + 1;
    });

    // RPM: count requests in last 5 min
    const last5min = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const rpm = recentLogs.filter(l => l.accessed_at >= last5min).length / 5;

    setStats({
      totalRequests: total,
      blockedRequests: blocked,
      uniqueIPs,
      blockRate: total > 0 ? (blocked / total) * 100 : 0,
      topEndpoints: Object.entries(endpointMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([endpoint, count]) => ({ endpoint, count })),
      topReasons: Object.entries(reasonMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([reason, count]) => ({ reason, count })),
      requestsPerMinute: Math.round(rpm * 10) / 10,
    });

    setVisitors({
      total: visitorsRes.count || 0,
      today: todayVisitorsRes.count || 0,
      uniqueToday: todayVisitorsRes.count || 0,
    });

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    if (liveMode) {
      intervalRef.current = setInterval(fetchData, 10000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [liveMode, fetchData]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Monitoramento de Segurança</h1>
            <p className="text-xs text-muted-foreground">lyneflix.online — Tempo real</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLiveMode(!liveMode)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
              liveMode ? "bg-green-500/20 border-green-500/30 text-green-400" : "bg-white/5 border-white/10 text-muted-foreground"
            }`}
          >
            <Activity className={`w-3.5 h-3.5 ${liveMode ? "animate-pulse" : ""}`} />
            {liveMode ? "AO VIVO" : "Pausado"}
          </button>
          <button onClick={fetchData} className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Requisições 24h", value: stats.totalRequests, icon: Activity, color: "text-blue-400" },
          { label: "Bloqueadas", value: stats.blockedRequests, icon: Ban, color: "text-red-400" },
          { label: "Taxa Bloqueio", value: `${stats.blockRate.toFixed(1)}%`, icon: Shield, color: stats.blockRate > 20 ? "text-red-400" : "text-green-400" },
          { label: "Endpoints", value: stats.topEndpoints.length, icon: Globe, color: "text-purple-400" },
          { label: "Req/min", value: stats.requestsPerMinute, icon: Clock, color: stats.requestsPerMinute > 30 ? "text-red-400" : "text-green-400" },
          { label: "Visitantes Hoje", value: visitors.today, icon: Users, color: "text-primary" },
        ].map(s => (
          <div key={s.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
            <div className="flex items-center gap-1.5 mb-1">
              <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
              <span className="text-[10px] text-muted-foreground">{s.label}</span>
            </div>
            <p className="text-lg font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Two columns: Top Endpoints + Top Block Reasons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Top Endpoints
          </h3>
          <div className="space-y-2">
            {stats.topEndpoints.map(e => (
              <div key={e.endpoint} className="flex items-center justify-between text-xs">
                <span className="font-mono text-muted-foreground truncate">{e.endpoint}</span>
                <span className="font-semibold">{e.count}</span>
              </div>
            ))}
            {stats.topEndpoints.length === 0 && <p className="text-xs text-muted-foreground">Sem dados</p>}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" /> Motivos de Bloqueio
          </h3>
          <div className="space-y-2">
            {stats.topReasons.map(r => (
              <div key={r.reason} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{r.reason}</span>
                <span className="font-semibold text-red-400">{r.count}</span>
              </div>
            ))}
            {stats.topReasons.length === 0 && <p className="text-xs text-muted-foreground">Nenhum bloqueio</p>}
          </div>
        </div>
      </div>

      {/* Live Log Feed */}
      <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
        <div className="px-4 py-3 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" /> Log em Tempo Real
          </h3>
          <span className="text-[10px] text-muted-foreground">{logs.length} entradas</span>
        </div>
        <div className="max-h-[400px] overflow-y-auto divide-y divide-white/5">
          {logs.map(log => (
            <div key={log.id} className={`flex items-center gap-3 px-4 py-2 text-xs ${log.blocked ? "bg-red-500/5" : ""}`}>
              {log.blocked ? (
                <Ban className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              ) : (
                <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
              )}
              <span className="text-muted-foreground w-16 flex-shrink-0">{formatTime(log.accessed_at)}</span>
              <span className="font-mono truncate flex-1">{log.endpoint}</span>
              {log.reason && <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px]">{log.reason}</span>}
            </div>
          ))}
          {logs.length === 0 && (
            <p className="text-center text-muted-foreground py-10 text-sm">Sem logs nas últimas 24h</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SecurityMonitor;
