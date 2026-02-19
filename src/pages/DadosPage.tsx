import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Database, Film, Tv, Copy, Check, ExternalLink, Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

interface CachedVideo {
  id: string;
  tmdb_id: number;
  content_type: string;
  audio_type: string;
  video_type: string;
  provider: string;
  season: number | null;
  episode: number | null;
  expires_at: string;
  created_at: string;
  title?: string;
}

const ITEMS_PER_PAGE = 50;

const DadosPage = () => {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [videos, setVideos] = useState<CachedVideo[]>([]);
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, movies: 0, series: 0, expired: 0 });
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

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
    };
    check();
  }, [navigate]);

  useEffect(() => {
    if (authorized) fetchData();
  }, [authorized, page, typeFilter, filter]);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Count total
    let countQuery = supabase.from("video_cache").select("id", { count: "exact", head: true });
    if (typeFilter !== "all") countQuery = countQuery.eq("content_type", typeFilter);
    const { count } = await countQuery;
    setTotalCount(count || 0);

    // Fetch page
    const from = (page - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;
    let query = supabase.from("video_cache").select("id, tmdb_id, content_type, audio_type, video_type, provider, season, episode, expires_at, created_at").order("created_at", { ascending: false }).range(from, to);
    if (typeFilter !== "all") query = query.eq("content_type", typeFilter);
    const { data: cacheData } = await query;

    if (!cacheData) { setLoading(false); return; }

    // Get titles
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

    // Apply text filter client-side
    const filtered = filter
      ? enriched.filter(v => v.title?.toLowerCase().includes(filter.toLowerCase()) || String(v.tmdb_id).includes(filter))
      : enriched;

    setVideos(filtered);

    // Stats (first page only)
    if (page === 1 && !filter) {
      const now = new Date().toISOString();
      // Get full counts
      const [{ count: mc }, { count: sc }] = await Promise.all([
        supabase.from("video_cache").select("id", { count: "exact", head: true }).eq("content_type", "movie"),
        supabase.from("video_cache").select("id", { count: "exact", head: true }).eq("content_type", "series"),
      ]);
      setStats({
        total: count || 0,
        movies: mc || 0,
        series: sc || 0,
        expired: enriched.filter(v => v.expires_at < now).length,
      });
    }

    setLoading(false);
  }, [page, typeFilter, filter]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const copyUrl = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Group by content
  const grouped = videos.reduce((acc, v) => {
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
              <p className="text-xs text-muted-foreground">Todos os links salvos — {totalCount} registros</p>
            </div>
          </div>
          <button onClick={() => { setPage(1); fetchData(); }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/50 border border-border hover:bg-muted text-sm">
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
            <div key={s.label} className="p-3 rounded-xl bg-muted/30 border border-border">
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
              onChange={e => { setFilter(e.target.value); setPage(1); }}
              placeholder="Buscar por título ou TMDB ID..."
              className="w-full h-10 pl-9 pr-4 rounded-xl bg-muted/30 border border-border text-sm focus:outline-none focus:border-primary/50"
            />
          </div>
          {["all", "movie", "series"].map(t => (
            <button
              key={t}
              onClick={() => { setTypeFilter(t); setPage(1); }}
              className={`px-4 py-2 rounded-xl text-xs font-medium border transition-colors ${
                typeFilter === t ? "bg-primary/20 border-primary/30 text-primary" : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {t === "all" ? "Todos" : t === "movie" ? "Filmes" : "Séries"}
            </button>
          ))}
        </div>

        {/* Pagination Top */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-muted-foreground">
              Página {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-xs disabled:opacity-30 hover:bg-muted/50"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Anterior
              </button>
              {/* Page numbers */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let p: number;
                if (totalPages <= 5) p = i + 1;
                else if (page <= 3) p = i + 1;
                else if (page >= totalPages - 2) p = totalPages - 4 + i;
                else p = page - 2 + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium ${
                      p === page ? "bg-primary text-primary-foreground" : "bg-muted/30 border border-border hover:bg-muted/50"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-xs disabled:opacity-30 hover:bg-muted/50"
              >
                Próximo <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {Object.values(grouped).map(group => (
              <div key={`${group.tmdb_id}-${group.content_type}`} className="rounded-xl bg-muted/10 border border-border overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
                  <div className="flex items-center gap-2">
                    {group.content_type === "movie" ? <Film className="w-4 h-4 text-primary" /> : <Tv className="w-4 h-4 text-primary" />}
                    <span className="font-medium text-sm">{group.title}</span>
                    <span className="text-xs text-muted-foreground">TMDB {group.tmdb_id}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{group.items.length} link(s)</span>
                </div>
                <div className="divide-y divide-border/30">
                  {group.items.map(v => {
                    const isExpired = v.expires_at < new Date().toISOString();
                    return (
                      <div key={v.id} className={`flex items-center gap-3 px-4 py-2 text-xs ${isExpired ? "opacity-40" : ""}`}>
                        <span className="px-2 py-0.5 rounded bg-muted text-[10px] font-mono">{v.audio_type}</span>
                        {v.season != null && <span className="text-muted-foreground">T{v.season}E{v.episode}</span>}
                        <span className="px-2 py-0.5 rounded bg-muted text-[10px]">{v.provider}</span>
                        <span className="px-2 py-0.5 rounded bg-muted text-[10px]">{v.video_type}</span>
                        <code className="flex-1 truncate text-muted-foreground font-mono text-[10px]">***</code>
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

        {/* Pagination Bottom */}
        {totalPages > 1 && (
          <div className="flex justify-center mt-6">
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-xs disabled:opacity-30 hover:bg-muted/50">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-3 py-1.5 text-xs text-muted-foreground">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-xs disabled:opacity-30 hover:bg-muted/50">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DadosPage;
