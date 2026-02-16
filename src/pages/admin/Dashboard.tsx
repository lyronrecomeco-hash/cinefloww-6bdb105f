import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Film, Tv, Sparkles, Drama, Eye, TrendingUp, BarChart3, PieChart as PieChartIcon } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, CartesianGrid } from "recharts";

interface Stats {
  totalMovies: number;
  totalSeries: number;
  totalDoramas: number;
  totalAnimes: number;
  totalViews: number;
  recentContent: any[];
  viewsByType: { name: string; value: number }[];
  viewsByDay: { date: string; views: number }[];
}

const COLORS = ["hsl(217, 91%, 60%)", "hsl(250, 80%, 60%)", "hsl(160, 60%, 50%)", "hsl(340, 70%, 55%)"];

const Dashboard = () => {
  const [stats, setStats] = useState<Stats>({
    totalMovies: 0, totalSeries: 0, totalDoramas: 0, totalAnimes: 0,
    totalViews: 0, recentContent: [], viewsByType: [], viewsByDay: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [movies, series, doramas, animes, views, recent, viewsData] = await Promise.all([
          supabase.from("content").select("id", { count: "exact", head: true }).eq("content_type", "movie"),
          supabase.from("content").select("id", { count: "exact", head: true }).eq("content_type", "series"),
          supabase.from("content").select("id", { count: "exact", head: true }).eq("content_type", "dorama"),
          supabase.from("content").select("id", { count: "exact", head: true }).eq("content_type", "anime"),
          supabase.from("content_views").select("id", { count: "exact", head: true }),
          supabase.from("content").select("*").order("created_at", { ascending: false }).limit(5),
          supabase.from("content_views").select("content_type, viewed_at"),
        ]);

        // Calculate views by type
        const typeMap: Record<string, number> = {};
        viewsData.data?.forEach((v: any) => {
          const t = v.content_type || "outro";
          typeMap[t] = (typeMap[t] || 0) + 1;
        });
        const viewsByType = Object.entries(typeMap).map(([name, value]) => ({ 
          name: name === "movie" ? "Filmes" : name === "series" ? "Séries" : name === "dorama" ? "Doramas" : name === "anime" ? "Animes" : name, 
          value 
        }));

        // Calculate views by day (last 7 days)
        const dayMap: Record<string, number> = {};
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          dayMap[d.toISOString().split("T")[0]] = 0;
        }
        viewsData.data?.forEach((v: any) => {
          const day = v.viewed_at?.split("T")[0];
          if (day && dayMap[day] !== undefined) dayMap[day]++;
        });
        const viewsByDay = Object.entries(dayMap).map(([date, views]) => ({
          date: new Date(date).toLocaleDateString("pt-BR", { weekday: "short" }),
          views,
        }));

        setStats({
          totalMovies: movies.count || 0,
          totalSeries: series.count || 0,
          totalDoramas: doramas.count || 0,
          totalAnimes: animes.count || 0,
          totalViews: views.count || 0,
          recentContent: recent.data || [],
          viewsByType: viewsByType.length ? viewsByType : [{ name: "Sem dados", value: 0 }],
          viewsByDay,
        });
      } catch (err) {
        console.error("Error fetching stats:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statCards = [
    { label: "Filmes", value: stats.totalMovies, icon: Film, color: "text-blue-400", bg: "bg-blue-400/10" },
    { label: "Séries", value: stats.totalSeries, icon: Tv, color: "text-purple-400", bg: "bg-purple-400/10" },
    { label: "Doramas", value: stats.totalDoramas, icon: Drama, color: "text-emerald-400", bg: "bg-emerald-400/10" },
    { label: "Animes", value: stats.totalAnimes, icon: Sparkles, color: "text-pink-400", bg: "bg-pink-400/10" },
  ];

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
        <p className="text-sm text-muted-foreground mt-1">Visão geral do seu catálogo</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Views card */}
      <div className="glass p-4 flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-amber-400/10 flex items-center justify-center flex-shrink-0">
          <Eye className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <p className="text-2xl font-bold font-display">{stats.totalViews}</p>
          <p className="text-xs text-muted-foreground">Total de Visualizações</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Views per day */}
        <div className="glass p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Visualizações (7 dias)</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={stats.viewsByDay}>
              <defs>
                <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 18%)" />
              <XAxis dataKey="date" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "hsl(220, 25%, 13%)", border: "1px solid hsl(220, 20%, 18%)", borderRadius: "12px", fontSize: "12px" }}
                labelStyle={{ color: "hsl(210, 40%, 98%)" }}
              />
              <Area type="monotone" dataKey="views" stroke="hsl(217, 91%, 60%)" fillOpacity={1} fill="url(#colorViews)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Content by type */}
        <div className="glass p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Conteúdo por Tipo</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={[
              { name: "Filmes", value: stats.totalMovies },
              { name: "Séries", value: stats.totalSeries },
              { name: "Doramas", value: stats.totalDoramas },
              { name: "Animes", value: stats.totalAnimes },
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 18%)" />
              <XAxis dataKey="name" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "hsl(220, 25%, 13%)", border: "1px solid hsl(220, 20%, 18%)", borderRadius: "12px", fontSize: "12px" }}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {[0, 1, 2, 3].map((i) => <Cell key={i} fill={COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart */}
        <div className="glass p-5">
          <div className="flex items-center gap-2 mb-4">
            <PieChartIcon className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Visualizações por Tipo</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={stats.viewsByType} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {stats.viewsByType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(220, 25%, 13%)", border: "1px solid hsl(220, 20%, 18%)", borderRadius: "12px", fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Recent content */}
        <div className="glass p-5">
          <div className="flex items-center gap-2 mb-4">
            <Film className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Adicionados Recentemente</h3>
          </div>
          <div className="space-y-3">
            {stats.recentContent.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum conteúdo adicionado ainda</p>
            ) : (
              stats.recentContent.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors">
                  {item.poster_path ? (
                    <img src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt={item.title} className="w-8 h-12 rounded-lg object-cover" />
                  ) : (
                    <div className="w-8 h-12 rounded-lg bg-white/5 flex items-center justify-center"><Film className="w-3 h-3 text-muted-foreground" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{item.content_type}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${item.status === "published" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                    {item.status === "published" ? "Publicado" : "Rascunho"}
                  </span>
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
