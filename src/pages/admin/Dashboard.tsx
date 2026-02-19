import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Film, Tv, Sparkles, Drama, Eye, TrendingUp, BarChart3, PieChart as PieChartIcon } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, CartesianGrid } from "recharts";

const COLORS = ["hsl(217, 91%, 60%)", "hsl(250, 80%, 60%)", "hsl(160, 60%, 50%)", "hsl(340, 70%, 55%)"];

const Dashboard = () => {
  const [counts, setCounts] = useState({ movies: 0, series: 0, doramas: 0, animes: 0 });
  const [uniqueVisitors, setUniqueVisitors] = useState(0);
  const [recentContent, setRecentContent] = useState<any[]>([]);
  const [viewsByDay, setViewsByDay] = useState<{ date: string; views: number }[]>([]);
  const [viewsByType, setViewsByType] = useState<{ name: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const processVisitorData = (visitorData: any[]) => {
    // Unique visitors count
    const uniqueIds = new Set(visitorData.map((v: any) => v.visitor_id));
    setUniqueVisitors(uniqueIds.size);

    // Views by day (last 7 days)
    const now = new Date();
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
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [movies, series, doramas, animes, recent, visitors] = await Promise.all([
          supabase.from("content").select("id", { count: "exact", head: true }).eq("content_type", "movie"),
          supabase.from("content").select("id", { count: "exact", head: true }).eq("content_type", "series"),
          supabase.from("content").select("id", { count: "exact", head: true }).eq("content_type", "dorama"),
          supabase.from("content").select("id", { count: "exact", head: true }).eq("content_type", "anime"),
          supabase.from("content").select("id, title, poster_path, content_type, created_at").order("created_at", { ascending: false }).limit(5),
          supabase.from("site_visitors").select("visitor_id, visited_at, pathname").eq("hostname", "lyneflix.online"),
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

    // Realtime subscription for live visitor updates
    const channel = supabase
      .channel("dashboard-visitors")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "site_visitors",
      }, async () => {
        // Refetch visitors on new entry
        const { data } = await supabase
          .from("site_visitors")
          .select("visitor_id, visited_at, pathname")
          .eq("hostname", "lyneflix.online");
        if (data) processVisitorData(data);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const statCards = useMemo(() => [
    { label: "Filmes", value: counts.movies, icon: Film, color: "text-blue-400", bg: "bg-blue-400/10" },
    { label: "Séries", value: counts.series, icon: Tv, color: "text-purple-400", bg: "bg-purple-400/10" },
    { label: "Doramas", value: counts.doramas, icon: Drama, color: "text-emerald-400", bg: "bg-emerald-400/10" },
    { label: "Animes", value: counts.animes, icon: Sparkles, color: "text-pink-400", bg: "bg-pink-400/10" },
  ], [counts]);

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
        <p className="text-sm text-muted-foreground mt-1">Visão geral do seu catálogo • Visitantes em tempo real</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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
        <div className="glass p-4 flex items-center gap-4 relative overflow-hidden">
          <div className="absolute top-2 right-2">
            <span className="flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-400/10 flex items-center justify-center flex-shrink-0">
            <Eye className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-bold font-display">{uniqueVisitors}</p>
            <p className="text-xs text-muted-foreground">Visitantes únicos</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Visitantes únicos (7 dias)</h3>
            <span className="ml-auto flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
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

        <div className="glass p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Conteúdo por Tipo</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={[
              { name: "Filmes", value: counts.movies },
              { name: "Séries", value: counts.series },
              { name: "Doramas", value: counts.doramas },
              { name: "Animes", value: counts.animes },
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 18%)" />
              <XAxis dataKey="name" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "hsl(220, 25%, 13%)", border: "1px solid hsl(220, 20%, 18%)", borderRadius: "12px", fontSize: "12px" }} />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {[0, 1, 2, 3].map((i) => <Cell key={i} fill={COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass p-5">
          <div className="flex items-center gap-2 mb-4">
            <PieChartIcon className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Visitantes por Seção</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={viewsByType} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {viewsByType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(220, 25%, 13%)", border: "1px solid hsl(220, 20%, 18%)", borderRadius: "12px", fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass p-5">
          <div className="flex items-center gap-2 mb-4">
            <Film className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Adicionados Recentemente</h3>
          </div>
          <div className="space-y-3">
            {recentContent.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum conteúdo adicionado ainda</p>
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
