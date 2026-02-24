import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Film, Tv, Sparkles, Drama, Eye, TrendingUp, BarChart3, PieChart as PieChartIcon, Users, Activity, Globe, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, CartesianGrid } from "recharts";

const COLORS = ["hsl(217, 91%, 60%)", "hsl(250, 80%, 60%)", "hsl(160, 60%, 50%)", "hsl(340, 70%, 55%)", "hsl(30, 80%, 55%)"];

const Dashboard = () => {
  const [counts, setCounts] = useState({ movies: 0, series: 0, doramas: 0, animes: 0 });
  const [uniqueVisitors, setUniqueVisitors] = useState(0);
  const [recentContent, setRecentContent] = useState<any[]>([]);
  const [viewsByDay, setViewsByDay] = useState<{ date: string; views: number }[]>([]);
  const [viewsByType, setViewsByType] = useState<{ name: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // Real-time monitoring
  const [onlineNow, setOnlineNow] = useState(0);
  const [todayVisitors, setTodayVisitors] = useState(0);
  const [todayViews, setTodayViews] = useState(0);
  const [recentVisitors, setRecentVisitors] = useState<any[]>([]);
  const [viewsPerHour, setViewsPerHour] = useState<{ hour: string; views: number }[]>([]);

  const processVisitorData = useCallback((visitorData: any[]) => {
    const uniqueIds = new Set(visitorData.map((v: any) => v.visitor_id));
    setUniqueVisitors(uniqueIds.size);

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // Today's unique visitors
    const todaySet = new Set<string>();
    let todayViewCount = 0;
    visitorData.forEach((v: any) => {
      if (v.visited_at?.startsWith(todayStr)) {
        todaySet.add(v.visitor_id);
        todayViewCount++;
      }
    });
    setTodayVisitors(todaySet.size);
    setTodayViews(todayViewCount);

    // Online now (last 5 min) — exclude admin pages
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const onlineSet = new Set<string>();
    visitorData.forEach((v: any) => {
      if (new Date(v.visited_at) >= fiveMinAgo && !v.pathname?.startsWith("/admin")) onlineSet.add(v.visitor_id);
    });
    setOnlineNow(onlineSet.size);

    // Recent visitors (last 10) — exclude admin pages
    const sorted = [...visitorData]
      .filter((v) => v.visited_at?.startsWith(todayStr) && !v.pathname?.startsWith("/admin"))
      .sort((a, b) => new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime())
      .slice(0, 12);
    setRecentVisitors(sorted);

    // Views by hour (today)
    const hourMap: Record<string, number> = {};
    for (let h = 0; h <= now.getHours(); h++) {
      hourMap[`${h.toString().padStart(2, "0")}h`] = 0;
    }
    visitorData.forEach((v: any) => {
      if (v.visited_at?.startsWith(todayStr)) {
        const h = new Date(v.visited_at).getHours();
        const key = `${h.toString().padStart(2, "0")}h`;
        if (hourMap[key] !== undefined) hourMap[key]++;
      }
    });
    setViewsPerHour(Object.entries(hourMap).map(([hour, views]) => ({ hour, views })));

    // Views by day (last 7 days)
    const dayMap: Record<string, Set<string>> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dayMap[d.toISOString().split("T")[0]] = new Set();
    }
    visitorData.forEach((v: any) => {
      const day = v.visited_at?.split("T")[0];
      if (day && dayMap[day]) dayMap[day].add(v.visitor_id);
    });
    setViewsByDay(Object.entries(dayMap).map(([date, set]) => ({
      date: new Date(date).toLocaleDateString("pt-BR", { weekday: "short" }),
      views: set.size,
    })));

    // Views by page type
    const typeMap: Record<string, Set<string>> = {};
    visitorData.forEach((v: any) => {
      const p = v.pathname || "/";
      let t = "Outros";
      if (p.startsWith("/filme")) t = "Filmes";
      else if (p.startsWith("/serie")) t = "Séries";
      else if (p === "/") t = "Home";
      else if (p.startsWith("/player")) t = "Player";
      if (!typeMap[t]) typeMap[t] = new Set();
      typeMap[t].add(v.visitor_id);
    });
    const vbt = Object.entries(typeMap).map(([name, set]) => ({ name, value: set.size }));
    setViewsByType(vbt.length ? vbt : [{ name: "Sem dados", value: 0 }]);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [movies, series, doramas, animes, recent, visitors] = await Promise.all([
          supabase.from("content").select("id", { count: "exact", head: true }).eq("content_type", "movie"),
          supabase.from("content").select("id", { count: "exact", head: true }).eq("content_type", "series"),
          supabase.from("content").select("id", { count: "exact", head: true }).eq("content_type", "dorama"),
          supabase.from("content").select("id", { count: "exact", head: true }).eq("content_type", "anime"),
          supabase.from("content").select("id, title, poster_path, content_type, created_at").order("created_at", { ascending: false }).limit(5),
          supabase.from("site_visitors").select("visitor_id, visited_at, pathname, hostname").eq("hostname", "lyneflix.online").gte("visited_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()).order("visited_at", { ascending: false }).limit(1000),
        ]);

        setCounts({
          movies: movies.count || 0,
          series: series.count || 0,
          doramas: doramas.count || 0,
          animes: animes.count || 0,
        });
        setRecentContent(recent.data || []);
        processVisitorData(visitors.data || []);
      } catch (err) {
        console.error("Dashboard error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    // Realtime subscription
    const channel = supabase
      .channel("dashboard-visitors-rt")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "site_visitors",
      }, async () => {
      const { data } = await supabase
          .from("site_visitors")
          .select("visitor_id, visited_at, pathname, hostname")
          .eq("hostname", "lyneflix.online")
          .gte("visited_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order("visited_at", { ascending: false })
          .limit(1000);
        if (data) processVisitorData(data);
      })
      .subscribe();

    // Auto-refresh online count every 30s
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("site_visitors")
        .select("visitor_id, visited_at, pathname, hostname")
        .eq("hostname", "lyneflix.online")
        .gte("visited_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("visited_at", { ascending: false })
        .limit(1000);
      if (data) processVisitorData(data);
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [processVisitorData]);

  const statCards = useMemo(() => [
    { label: "Filmes", value: counts.movies, icon: Film, color: "text-blue-400", bg: "bg-blue-400/10" },
    { label: "Séries", value: counts.series, icon: Tv, color: "text-purple-400", bg: "bg-purple-400/10" },
    { label: "Doramas", value: counts.doramas, icon: Drama, color: "text-emerald-400", bg: "bg-emerald-400/10" },
    { label: "Animes", value: counts.animes, icon: Sparkles, color: "text-pink-400", bg: "bg-pink-400/10" },
  ], [counts]);

  const formatTime = (d: string) => {
    const date = new Date(d);
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const getPageLabel = (pathname: string | null) => {
    if (!pathname || pathname === "/") return "Home";
    if (pathname.startsWith("/filme")) return "Filme";
    if (pathname.startsWith("/serie")) return "Série";
    if (pathname.startsWith("/player")) return "Player";
    if (pathname.startsWith("/dorama")) return "Dorama";
    if (pathname.startsWith("/conta")) return "Conta";
    return pathname.slice(1, 15);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Monitoramento em tempo real • Métricas de divulgação</p>
      </div>

      {/* Live monitoring row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass p-4 flex items-center gap-3 relative overflow-hidden">
          <div className="absolute top-2 right-2">
            <span className="flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-400/10 flex items-center justify-center flex-shrink-0">
            <Activity className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-bold font-display text-emerald-400">{onlineNow}</p>
            <p className="text-[10px] text-muted-foreground">Online agora</p>
          </div>
        </div>
        <div className="glass p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-400/10 flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-bold font-display">{todayVisitors}</p>
            <p className="text-[10px] text-muted-foreground">Visitantes hoje</p>
          </div>
        </div>
        <div className="glass p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-400/10 flex items-center justify-center flex-shrink-0">
            <Globe className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <p className="text-2xl font-bold font-display">{todayViews}</p>
            <p className="text-[10px] text-muted-foreground">Pageviews hoje</p>
          </div>
        </div>
        <div className="glass p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-400/10 flex items-center justify-center flex-shrink-0">
            <Eye className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-bold font-display">{uniqueVisitors}</p>
            <p className="text-[10px] text-muted-foreground">Total únicos</p>
          </div>
        </div>
      </div>

      {/* Catalog stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((card) => (
          <div key={card.label} className="glass p-4 flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl ${card.bg} flex items-center justify-center flex-shrink-0`}>
              <card.icon className={`w-5 h-5 ${card.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold font-display">{card.value}</p>
              <p className="text-xs text-muted-foreground">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Hourly traffic today */}
        <div className="glass p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Tráfego por hora (hoje)</h3>
            <span className="ml-auto flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={viewsPerHour}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 18%)" />
              <XAxis dataKey="hour" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "hsl(220, 25%, 13%)", border: "1px solid hsl(220, 20%, 18%)", borderRadius: "12px", fontSize: "12px" }} />
              <Bar dataKey="views" radius={[4, 4, 0, 0]} fill="hsl(217, 91%, 60%)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 7-day trend */}
        <div className="glass p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Visitantes únicos (7 dias)</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={viewsByDay}>
              <defs>
                <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 18%)" />
              <XAxis dataKey="date" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "hsl(220, 25%, 13%)", border: "1px solid hsl(220, 20%, 18%)", borderRadius: "12px", fontSize: "12px" }} />
              <Area type="monotone" dataKey="views" stroke="hsl(217, 91%, 60%)" fillOpacity={1} fill="url(#colorViews)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Live feed */}
        <div className="glass p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="font-display font-semibold text-sm">Feed ao vivo</h3>
            <span className="ml-auto text-[10px] text-emerald-400 font-medium">LIVE</span>
          </div>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {recentVisitors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum visitante hoje</p>
            ) : (
              recentVisitors.map((v: any, i: number) => (
                <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-white/[0.02] text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span className="text-muted-foreground font-mono">{formatTime(v.visited_at)}</span>
                  <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
                    {getPageLabel(v.pathname)}
                  </span>
                  <span className="text-muted-foreground/50 truncate ml-auto font-mono text-[10px]">
                    {v.visitor_id?.slice(0, 8)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Content by type + Pie */}
        <div className="glass p-5">
          <div className="flex items-center gap-2 mb-4">
            <PieChartIcon className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Visitantes por Seção</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={viewsByType} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {viewsByType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(220, 25%, 13%)", border: "1px solid hsl(220, 20%, 18%)", borderRadius: "12px", fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Recent content */}
        <div className="glass p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Film className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Adicionados Recentemente</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recentContent.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8 col-span-2">Nenhum conteúdo adicionado ainda</p>
            ) : (
              recentContent.map((item: any) => (
                <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03]">
                  {item.poster_path ? (
                    <img src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt="" className="w-9 h-13 rounded-lg object-cover" />
                  ) : (
                    <div className="w-9 h-13 rounded-lg bg-white/10 flex items-center justify-center">
                      <Film className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <p className="text-[11px] text-muted-foreground capitalize">{item.content_type}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
