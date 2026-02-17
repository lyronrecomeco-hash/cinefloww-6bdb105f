import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database, Film, Tv, Loader2, Play, RefreshCw, CheckCircle, XCircle, Search, ExternalLink, Link2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CustomPlayer from "@/components/CustomPlayer";

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
  const { toast } = useToast();
  const [stats, setStats] = useState({ total: 0, withVideo: 0, withoutVideo: 0 });
  const [playerItem, setPlayerItem] = useState<ContentItem | null>(null);

  const fetchContent = useCallback(async () => {
    setLoading(true);
    const from = page * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    let query = supabase
      .from("content")
      .select("id, tmdb_id, imdb_id, title, content_type, poster_path, release_date", { count: "exact" })
      .order("title", { ascending: true })
      .range(from, to);

    if (filterType !== "all") query = query.eq("content_type", filterType);
    if (filterText.trim()) query = query.ilike("title", `%${filterText.trim()}%`);

    const { data, error, count } = await query;
    if (!error && data) {
      setItems(data);
      setTotalCount(count || 0);
      await checkVideoStatuses(data);
    }
    setLoading(false);
  }, [page, filterType, filterText]);

  const checkVideoStatuses = async (contentItems: ContentItem[]) => {
    const tmdbIds = contentItems.map(i => i.tmdb_id);
    const { data: cached } = await supabase
      .from("video_cache")
      .select("tmdb_id, video_url, provider, video_type")
      .in("tmdb_id", tmdbIds)
      .gt("expires_at", new Date().toISOString());

    const statusMap = new Map<number, VideoStatus>();
    for (const item of contentItems) {
      const cachedItem = cached?.find(c => c.tmdb_id === item.tmdb_id);
      statusMap.set(item.tmdb_id, {
        tmdb_id: item.tmdb_id,
        has_video: !!cachedItem,
        video_url: cachedItem?.video_url,
        provider: cachedItem?.provider,
        video_type: cachedItem?.video_type,
      });
    }
    setVideoStatuses(statusMap);
  };

  const fetchStats = useCallback(async () => {
    const { count: total } = await supabase
      .from("content")
      .select("*", { count: "exact", head: true });
    const { count: withVideo } = await supabase
      .from("video_cache")
      .select("*", { count: "exact", head: true })
      .gt("expires_at", new Date().toISOString());
    setStats({
      total: total || 0,
      withVideo: withVideo || 0,
      withoutVideo: Math.max(0, (total || 0) - (withVideo || 0)),
    });
  }, []);

  useEffect(() => {
    fetchContent();
    fetchStats();
  }, [fetchContent, fetchStats]);

  const resolveLink = async (item: ContentItem) => {
    const status = videoStatuses.get(item.tmdb_id);
    if (status?.has_video) return status;
    try {
      const { data } = await supabase.functions.invoke("extract-video", {
        body: { tmdb_id: item.tmdb_id, imdb_id: item.imdb_id, content_type: item.content_type, audio_type: "legendado" },
      });
      const newStatus: VideoStatus = {
        tmdb_id: item.tmdb_id,
        has_video: !!data?.url,
        video_url: data?.url,
        provider: data?.provider,
        video_type: data?.type,
      };
      setVideoStatuses(prev => new Map(prev).set(item.tmdb_id, newStatus));
      return newStatus;
    } catch {
      return { tmdb_id: item.tmdb_id, has_video: false };
    }
  };

  // Resolve ALL links in order: page by page, alphabetically
  const resolveAllLinks = async () => {
    setResolving(true);
    cancelRef.current = false;

    const { count: totalItems } = await supabase
      .from("content")
      .select("*", { count: "exact", head: true });
    if (!totalItems) { setResolving(false); return; }

    // Get ALL cached tmdb_ids
    const cachedIds = new Set<number>();
    let offset = 0;
    while (true) {
      const { data } = await supabase
        .from("video_cache")
        .select("tmdb_id")
        .gt("expires_at", new Date().toISOString())
        .range(offset, offset + 999);
      if (!data?.length) break;
      data.forEach(c => cachedIds.add(c.tmdb_id));
      if (data.length < 1000) break;
      offset += 1000;
    }

    const PAGE_SIZE = 50;
    const CONCURRENCY = 15;
    let totalResolved = 0;
    const totalToResolve = Math.max(0, totalItems - cachedIds.size);
    setResolveProgress({ current: 0, total: totalToResolve });

    let pageOffset = 0;
    while (pageOffset < totalItems && !cancelRef.current) {
      const { data: pageItems } = await supabase
        .from("content")
        .select("id, tmdb_id, imdb_id, title, content_type, poster_path, release_date")
        .order("title", { ascending: true })
        .range(pageOffset, pageOffset + PAGE_SIZE - 1);

      if (!pageItems?.length) break;

      const toResolve = pageItems.filter(i => !cachedIds.has(i.tmdb_id));

      if (toResolve.length > 0) {
        const queue = [...toResolve];
        const worker = async () => {
          while (queue.length > 0 && !cancelRef.current) {
            const item = queue.shift();
            if (!item) break;
            await resolveLink(item);
            totalResolved++;
            setResolveProgress({ current: totalResolved, total: totalToResolve });
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()));
      }

      pageOffset += PAGE_SIZE;
    }

    toast({
      title: cancelRef.current ? "Resolução cancelada" : "Resolução concluída",
      description: `${totalResolved} links processados`,
    });

    setResolving(false);
    fetchStats();
    fetchContent();
  };

  // Build API-style link for display
  const getApiLink = (item: ContentItem) => {
    return `/api/${item.content_type}/${item.tmdb_id}`;
  };

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
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Total</p>
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
                  <div className="flex items-center gap-1">
                    <button onClick={() => resolveLink(item)} className="w-7 h-7 rounded-lg bg-white/5 text-muted-foreground flex items-center justify-center hover:bg-white/10">
                      <RefreshCw className="w-3 h-3" />
                    </button>
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
                            <button onClick={() => resolveLink(item)} className="w-7 h-7 rounded-lg bg-white/5 text-muted-foreground flex items-center justify-center hover:bg-white/10" title="Resolver link">
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                            {status?.has_video && (
                              <>
                                <button onClick={() => setPlayerItem(item)} className="w-7 h-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center hover:bg-primary/30" title="Abrir player">
                                  <Play className="w-3.5 h-3.5" />
                                </button>
                                <a href={status.video_url} target="_blank" rel="noopener noreferrer" className="w-7 h-7 rounded-lg bg-white/5 text-muted-foreground flex items-center justify-center hover:bg-white/10" title="Link direto">
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
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

      {/* Player Modal - uses cached video_url directly */}
      {playerItem && (() => {
        const status = videoStatuses.get(playerItem.tmdb_id);
        if (!status?.has_video || !status.video_url) return null;
        return (
          <div className="fixed inset-0 z-[100] bg-black animate-fade-in">
            <CustomPlayer
              sources={[{
                url: status.video_url,
                quality: "auto",
                provider: status.provider || "cache",
                type: (status.video_type === "mp4" ? "mp4" : "m3u8") as "mp4" | "m3u8",
              }]}
              title={playerItem.title}
              onClose={() => setPlayerItem(null)}
              onError={() => setPlayerItem(null)}
            />
          </div>
        );
      })()}
    </div>
  );
};

export default BancoPage;
