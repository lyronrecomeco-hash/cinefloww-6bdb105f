import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Database, Film, Tv, Copy, Check, ExternalLink, Search, RefreshCw } from "lucide-react";

interface CachedVideo {
  id: string;
  tmdb_id: number;
  content_type: string;
  audio_type: string;
  video_url: string;
  video_type: string;
  provider: string;
  season: number | null;
  episode: number | null;
  expires_at: string;
  created_at: string;
  title?: string;
}

const DadosPage = () => {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [videos, setVideos] = useState<CachedVideo[]>([]);
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, movies: 0, series: 0, expired: 0 });

  // Auth check
  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/admin/login"); return; }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!data) { navigate("/"); return; }
      setAuthorized(true);
      fetchData();
    };
    check();
  }, [navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    
    // Get all video cache entries
    const { data: cacheData } = await supabase
      .from("video_cache")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (!cacheData) { setLoading(false); return; }

    // Get titles for all tmdb_ids
    const tmdbIds = [...new Set(cacheData.map(v => v.tmdb_id))];
    const { data: contentData } = await supabase
      .from("content")
      .select("tmdb_id, title, content_type")
      .in("tmdb_id", tmdbIds);

    const titleMap = new Map(contentData?.map(c => [`${c.tmdb_id}-${c.content_type}`, c.title]) || []);

    const enriched: CachedVideo[] = cacheData.map(v => ({
      ...v,
      title: titleMap.get(`${v.tmdb_id}-${v.content_type}`) || `TMDB ${v.tmdb_id}`,
    }));

    setVideos(enriched);

    const now = new Date().toISOString();
    setStats({
      total: enriched.length,
      movies: enriched.filter(v => v.content_type === "movie").length,
      series: enriched.filter(v => v.content_type === "series").length,
      expired: enriched.filter(v => v.expires_at < now).length,
    });

    setLoading(false);
  }, []);

  const copyUrl = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filtered = videos.filter(v => {
    if (typeFilter !== "all" && v.content_type !== typeFilter) return false;
    if (filter && !v.title?.toLowerCase().includes(filter.toLowerCase()) && !String(v.tmdb_id).includes(filter)) return false;
    return true;
  });

  // Group by content
  const grouped = filtered.reduce((acc, v) => {
    const key = `${v.tmdb_id}-${v.content_type}`;
    if (!acc[key]) acc[key] = { title: v.title || "", tmdb_id: v.tmdb_id, content_type: v.content_type, items: [] };
    acc[key].items.push(v);
    return acc;
  }, {} as Record<string, { title: string; tmdb_id: number; content_type: string; items: CachedVideo[] }>);

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Banco de Dados de Vídeos</h1>
              <p className="text-xs text-muted-foreground">Todos os links salvos — acesso restrito</p>
            </div>
          </div>
          <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total", value: stats.total, icon: Database },
            { label: "Filmes", value: stats.movies, icon: Film },
            { label: "Séries", value: stats.series, icon: Tv },
            { label: "Expirados", value: stats.expired, icon: RefreshCw },
          ].map(s => (
            <div key={s.label} className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-lg font-bold">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Buscar por título ou TMDB ID..."
              className="w-full h-10 pl-9 pr-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
            />
          </div>
          {["all", "movie", "series"].map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-4 py-2 rounded-xl text-xs font-medium border transition-colors ${
                typeFilter === t ? "bg-primary/20 border-primary/30 text-primary" : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
              }`}
            >
              {t === "all" ? "Todos" : t === "movie" ? "Filmes" : "Séries"}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {Object.values(grouped).map(group => (
              <div key={`${group.tmdb_id}-${group.content_type}`} className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02]">
                  <div className="flex items-center gap-2">
                    {group.content_type === "movie" ? <Film className="w-4 h-4 text-primary" /> : <Tv className="w-4 h-4 text-primary" />}
                    <span className="font-medium text-sm">{group.title}</span>
                    <span className="text-xs text-muted-foreground">TMDB {group.tmdb_id}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{group.items.length} link(s)</span>
                </div>
                <div className="divide-y divide-white/5">
                  {group.items.map(v => {
                    const isExpired = v.expires_at < new Date().toISOString();
                    return (
                      <div key={v.id} className={`flex items-center gap-3 px-4 py-2 text-xs ${isExpired ? "opacity-40" : ""}`}>
                        <span className="px-2 py-0.5 rounded bg-white/10 text-[10px] font-mono">{v.audio_type}</span>
                        {v.season != null && <span className="text-muted-foreground">T{v.season}E{v.episode}</span>}
                        <span className="px-2 py-0.5 rounded bg-white/10 text-[10px]">{v.provider}</span>
                        <span className="px-2 py-0.5 rounded bg-white/10 text-[10px]">{v.video_type}</span>
                        <code className="flex-1 truncate text-muted-foreground font-mono text-[10px]">{v.video_url}</code>
                        <button
                          onClick={() => copyUrl(v.id, v.video_url)}
                          className="flex-shrink-0 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                          title="Copiar URL"
                        >
                          {copiedId === v.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <a href={v.video_url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Abrir">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {Object.keys(grouped).length === 0 && (
              <p className="text-center text-muted-foreground py-20">Nenhum vídeo encontrado.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DadosPage;
