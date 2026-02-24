import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Wrench, Search, Film, Tv, Loader2, CheckCircle, XCircle, Play, RefreshCw,
  Plus, Link2, ChevronDown, ChevronRight, Star, X, ExternalLink, Save, Pencil, Trash2,
  Database
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { searchMulti, getMovieDetails, getSeriesDetails, getSeasonDetails, posterUrl, TMDBMovie, TMDBMovieDetail } from "@/services/tmdb";
import CustomPlayer from "@/components/CustomPlayer";

const IMG_BASE = "https://image.tmdb.org/t/p";
const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

const ContentSourcesPage = () => {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TMDBMovie[]>([]);
  const [selectedItem, setSelectedItem] = useState<TMDBMovieDetail | null>(null);
  const [selectedType, setSelectedType] = useState<"movie" | "tv">("movie");
  const [loadingDetail, setLoadingDetail] = useState(false);
  const { toast } = useToast();

  // Video status for selected item
  const [videoStatuses, setVideoStatuses] = useState<Map<string, { url: string; type: string; provider: string }>>(new Map());
  const [loadingVideos, setLoadingVideos] = useState(false);

  // Series episode state
  const [expandedSeason, setExpandedSeason] = useState<number | null>(null);
  const [seasonEpisodes, setSeasonEpisodes] = useState<Map<number, any[]>>(new Map());
  const [loadingSeason, setLoadingSeason] = useState<number | null>(null);

  // Manual link input
  const [manualInput, setManualInput] = useState<{ key: string; url: string; type: "m3u8" | "mp4" | "iframe-proxy" } | null>(null);

  // Extracting state
  const [extractingKeys, setExtractingKeys] = useState<Set<string>>(new Set());

  // Sync catalog state
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ processed: number; total: number } | null>(null);

  // Player
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);
  const [playerType, setPlayerType] = useState<"m3u8" | "mp4">("m3u8");
  const [playerTitle, setPlayerTitle] = useState("");

  // Content status in DB
  const [contentInDb, setContentInDb] = useState(false);
  const [contentDbId, setContentDbId] = useState<string | null>(null);

  // Catalog status cache for search results (true = in catalog)
  const [catalogStatus, setCatalogStatus] = useState<Map<number, boolean>>(new Map());
  // Video indexation cache for search results (provider name or false)
  const [videoIndexStatus, setVideoIndexStatus] = useState<Map<number, string | false>>(new Map());

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = async (searchQuery?: string) => {
    const q = searchQuery ?? query;
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const data = await searchMulti(q);
      const filtered = data.results.filter(r => r.media_type === "movie" || r.media_type === "tv").slice(0, 20);
      setResults(filtered);
      
      // Check catalog + video indexation status for all results
      if (filtered.length > 0) {
        const tmdbIds = filtered.map(r => r.id);
        
        // Parallel: check catalog AND video_cache (query ALL content_types, no filter)
        const [contentRes, videoCacheRes] = await Promise.all([
          supabase.from("content").select("tmdb_id, content_type").in("tmdb_id", tmdbIds),
          supabase.from("video_cache")
            .select("tmdb_id, provider, content_type")
            .in("tmdb_id", tmdbIds)
            .gt("expires_at", new Date().toISOString()),
        ]);
        
        const catalogMap = new Map<number, boolean>();
        contentRes.data?.forEach(row => catalogMap.set(row.tmdb_id, true));
        setCatalogStatus(catalogMap);
        
        // Collect ALL providers per tmdb_id (may have multiple content_types)
        const videoMap = new Map<number, string | false>();
        videoCacheRes.data?.forEach(row => {
          const existing = videoMap.get(row.tmdb_id);
          const provider = row.provider || "unknown";
          if (!existing) {
            videoMap.set(row.tmdb_id, provider);
          } else if (typeof existing === "string" && !existing.includes(provider)) {
            videoMap.set(row.tmdb_id, `${existing}, ${provider}`);
          }
        });
        setVideoIndexStatus(videoMap);
      }
    } catch { toast({ title: "Erro na busca", variant: "destructive" }); }
    setSearching(false);
  };

  // Live search with debounce
  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (selectedItem) return; // Don't search while viewing detail
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(() => handleSearch(value), 400);
  };

  const addResultToContent = async (item: TMDBMovie) => {
    const type = item.media_type === "tv" ? "tv" : "movie";
    const contentType = type === "tv" ? "series" : "movie";
    try {
      const detail = type === "movie" ? await getMovieDetails(item.id) : await getSeriesDetails(item.id);
      const { error } = await supabase.from("content").upsert({
        tmdb_id: detail.id,
        title: detail.title || detail.name || "",
        original_title: detail.title || detail.name,
        content_type: contentType,
        poster_path: detail.poster_path,
        backdrop_path: detail.backdrop_path,
        overview: detail.overview,
        vote_average: detail.vote_average,
        release_date: detail.release_date || detail.first_air_date,
        imdb_id: detail.imdb_id || detail.external_ids?.imdb_id,
        number_of_seasons: detail.number_of_seasons,
        number_of_episodes: detail.number_of_episodes,
        runtime: detail.runtime,
        status: "published",
      }, { onConflict: "tmdb_id,content_type" });
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      } else {
        setCatalogStatus(prev => new Map(prev).set(item.id, true));
        toast({ title: "✅ Adicionado ao catálogo!" });
      }
    } catch {
      toast({ title: "Erro ao adicionar", variant: "destructive" });
    }
  };

  const selectResult = async (item: TMDBMovie) => {
    const type = item.media_type === "tv" ? "tv" : "movie";
    setSelectedType(type);
    setLoadingDetail(true);
    setVideoStatuses(new Map());
    setExpandedSeason(null);
    setSeasonEpisodes(new Map());
    try {
      const detail = type === "movie" ? await getMovieDetails(item.id) : await getSeriesDetails(item.id);
      setSelectedItem(detail);

      // Check if in content table
      const { data: contentRow } = await supabase
        .from("content")
        .select("id")
        .eq("tmdb_id", item.id)
        .eq("content_type", type === "tv" ? "series" : "movie")
        .maybeSingle();
      setContentInDb(!!contentRow);
      setContentDbId(contentRow?.id || null);

      // Load video statuses
      await loadVideoStatuses(item.id, type);
    } catch { toast({ title: "Erro ao carregar detalhes", variant: "destructive" }); }
    setLoadingDetail(false);
  };

  const loadVideoStatuses = async (tmdbId: number, type: string) => {
    setLoadingVideos(true);
    // Query ALL content_types for this tmdb_id (series/tv/anime/dorama/movie can vary)
    const { data } = await supabase
      .from("video_cache")
      .select("tmdb_id, video_url, video_type, provider, season, episode, content_type")
      .eq("tmdb_id", tmdbId)
      .gt("expires_at", new Date().toISOString());

    const map = new Map<string, { url: string; type: string; provider: string }>();
    data?.forEach(d => {
      const key = d.season != null ? `${d.season}-${d.episode}` : "movie";
      map.set(key, { url: d.video_url, type: d.video_type, provider: d.provider });
    });
    setVideoStatuses(map);
    setLoadingVideos(false);
  };

  const loadSeasonEpisodes = async (seasonNum: number) => {
    if (!selectedItem) return;
    if (seasonEpisodes.has(seasonNum)) {
      setExpandedSeason(expandedSeason === seasonNum ? null : seasonNum);
      return;
    }
    setLoadingSeason(seasonNum);
    try {
      const data = await getSeasonDetails(selectedItem.id, seasonNum);
      setSeasonEpisodes(prev => new Map(prev).set(seasonNum, data.episodes));
      setExpandedSeason(seasonNum);
    } catch { toast({ title: "Erro ao carregar episódios", variant: "destructive" }); }
    setLoadingSeason(null);
  };

  const extractVideo = async (tmdbId: number, type: string, season?: number, episode?: number, title?: string) => {
    const key = season != null ? `${season}-${episode}` : "movie";
    setExtractingKeys(prev => new Set(prev).add(key));
    try {
      // Get imdb_id from selectedItem
      const imdbId = selectedItem?.imdb_id || selectedItem?.external_ids?.imdb_id || null;
      const { data } = await supabase.functions.invoke("extract-video", {
        body: {
          tmdb_id: tmdbId,
          imdb_id: imdbId,
          content_type: type,
          season,
          episode,
          title: title || selectedItem?.title || selectedItem?.name || "",
          audio_type: "legendado",
        },
      });
      if (data?.url) {
        setVideoStatuses(prev => {
          const next = new Map(prev);
          next.set(key, { url: data.url, type: data.type, provider: data.provider });
          return next;
        });
        toast({ title: "✅ Link extraído!", description: `Via ${data.provider}` });
      } else {
        toast({ title: "❌ Não encontrado", description: data?.message || "Nenhum provedor retornou link", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro na extração", variant: "destructive" });
    }
    setExtractingKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
  };

  const saveManualLink = async () => {
    if (!manualInput || !selectedItem || !manualInput.url) return;
    const key = manualInput.key;
    const isMovie = key === "movie";
    const season = isMovie ? null : parseInt(key.split("-")[0]);
    const episode = isMovie ? null : parseInt(key.split("-")[1]);

    // Build the proper URL - if it's an embed URL, wrap it in proxy-player
    let finalUrl = manualInput.url;
    let finalType = manualInput.type;

    // If user pasted an embed URL, auto-wrap in proxy
    if (finalType === "iframe-proxy" || (!finalUrl.includes(".m3u8") && !finalUrl.includes(".mp4"))) {
      finalUrl = `https://${PROJECT_ID}.supabase.co/functions/v1/proxy-player?url=${encodeURIComponent(finalUrl)}`;
      finalType = "iframe-proxy";
    }

    const contentType = selectedType === "tv" ? "tv" : "movie";

    const { error } = await supabase.from("video_cache").upsert({
      tmdb_id: selectedItem.id,
      content_type: contentType,
      video_url: finalUrl,
      video_type: finalType,
      provider: "manual",
      audio_type: "legendado",
      season,
      episode,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "tmdb_id,content_type,audio_type,season,episode" });

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }

    setVideoStatuses(prev => {
      const next = new Map(prev);
      next.set(key, { url: finalUrl, type: finalType, provider: "manual" });
      return next;
    });
    setManualInput(null);
    toast({ title: "✅ Link salvo!", description: "Vídeo indexado com sucesso" });
  };

  const deleteVideoCache = async (key: string) => {
    if (!selectedItem) return;
    const isMovie = key === "movie";
    const contentType = selectedType === "tv" ? "tv" : "movie";

    let q = supabase.from("video_cache").delete()
      .eq("tmdb_id", selectedItem.id)
      .eq("content_type", contentType)
      .eq("audio_type", "legendado");

    if (isMovie) {
      q = q.is("season", null).is("episode", null);
    } else {
      const [s, e] = key.split("-").map(Number);
      q = q.eq("season", s).eq("episode", e);
    }

    const { error } = await q;
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }

    setVideoStatuses(prev => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    toast({ title: "🗑️ Link removido" });
  };

  const addToContent = async () => {
    if (!selectedItem) return;
    const contentType = selectedType === "tv" ? "series" : "movie";
    const { error } = await supabase.from("content").upsert({
      tmdb_id: selectedItem.id,
      title: selectedItem.title || selectedItem.name || "",
      original_title: selectedItem.title || selectedItem.name,
      content_type: contentType,
      poster_path: selectedItem.poster_path,
      backdrop_path: selectedItem.backdrop_path,
      overview: selectedItem.overview,
      vote_average: selectedItem.vote_average,
      release_date: selectedItem.release_date || selectedItem.first_air_date,
      imdb_id: selectedItem.imdb_id || selectedItem.external_ids?.imdb_id,
      number_of_seasons: selectedItem.number_of_seasons,
      number_of_episodes: selectedItem.number_of_episodes,
      runtime: selectedItem.runtime,
      status: "published",
    }, { onConflict: "tmdb_id,content_type" });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setContentInDb(true);
      toast({ title: "✅ Adicionado ao catálogo!" });
    }
  };

  const openPlayer = (url: string, type: string, title: string) => {
    if (type === "iframe-proxy") {
      window.open(url, "_blank");
      return;
    }
    setPlayerUrl(url);
    setPlayerType(type as "m3u8" | "mp4");
    setPlayerTitle(title);
  };

  const extractAllEpisodes = async (seasonNum: number) => {
    if (!selectedItem) return;
    const episodes = seasonEpisodes.get(seasonNum);
    if (!episodes) return;

    for (const ep of episodes) {
      const key = `${seasonNum}-${ep.episode_number}`;
      if (videoStatuses.has(key)) continue;
      await extractVideo(selectedItem.id, "tv", seasonNum, ep.episode_number, selectedItem.name || selectedItem.title);
    }
  };

  // Sync entire catalog - re-extract all content links
  const syncCatalog = async () => {
    setSyncing(true);
    setSyncProgress({ processed: 0, total: 0 });
    try {
      const { count } = await supabase.from("content").select("*", { count: "exact", head: true });
      const total = count || 0;
      setSyncProgress({ processed: 0, total });

      const sessionId = `sync_${Date.now()}`;
      await supabase.functions.invoke("refresh-links", {
        body: { mode: "all", batch_size: 1000, session_id: sessionId },
      });

      const poll = setInterval(async () => {
        const { data } = await supabase
          .from("site_settings")
          .select("value")
          .eq("key", "refresh_links_progress")
          .maybeSingle();
        if (data?.value) {
          const v = data.value as any;
          setSyncProgress({ processed: v.processed || 0, total: v.total || total });
          if (v.status === "completed" || v.status === "cancelled") {
            clearInterval(poll);
            setSyncing(false);
            toast({ title: "Sincronização concluída", description: `${v.processed || 0} links atualizados` });
          }
        }
      }, 3000);
      setTimeout(() => { clearInterval(poll); setSyncing(false); }, 600000);
    } catch {
      setSyncing(false);
      toast({ title: "Erro na sincronização", variant: "destructive" });
    }
  };

  const renderVideoAction = (key: string, label: string, tmdbId: number, type: string, season?: number, episode?: number) => {
    const status = videoStatuses.get(key);
    const isExtracting = extractingKeys.has(key);
    const isManualOpen = manualInput?.key === key;

    return (
      <div className="flex items-center gap-1.5">
        {status ? (
          <>
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <CheckCircle className="w-3 h-3" />
              {status.provider}
            </span>
            <button
              onClick={() => openPlayer(status.url, status.type, label)}
              className="w-7 h-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center hover:bg-primary/30"
              title="Testar"
            >
              <Play className="w-3 h-3" />
            </button>
            <a href={status.url} target="_blank" rel="noopener noreferrer"
              className="w-7 h-7 rounded-lg bg-white/5 text-muted-foreground flex items-center justify-center hover:bg-white/10"
              title="Abrir link"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
            {/* Edit/swap link */}
            <button
              onClick={() => setManualInput(isManualOpen ? null : { key, url: status.url.includes("proxy-player") ? decodeURIComponent(status.url.split("url=")[1] || "") : status.url, type: status.type as any })}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                isManualOpen ? "bg-amber-500/20 text-amber-400" : "bg-white/5 text-muted-foreground hover:bg-white/10"
              }`}
              title="Trocar link"
            >
              <Pencil className="w-3 h-3" />
            </button>
            {/* Delete link */}
            <button
              onClick={() => deleteVideoCache(key)}
              className="w-7 h-7 rounded-lg bg-white/5 text-muted-foreground flex items-center justify-center hover:bg-destructive/20 hover:text-destructive"
              title="Remover link"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </>
        ) : (
          <XCircle className="w-3.5 h-3.5 text-muted-foreground/40" />
        )}
        <button
          onClick={() => extractVideo(tmdbId, type, season, episode)}
          disabled={isExtracting}
          className="w-7 h-7 rounded-lg bg-white/5 text-muted-foreground flex items-center justify-center hover:bg-white/10 disabled:opacity-50"
          title="Extrair das fontes"
        >
          {isExtracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
        {!status && (
          <button
            onClick={() => setManualInput(isManualOpen ? null : { key, url: "", type: "m3u8" })}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              isManualOpen ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground hover:bg-white/10"
            }`}
            title="Adicionar manualmente"
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-display">Fontes & Vídeos</h1>
            <p className="text-xs text-muted-foreground">Pesquise, extraia ou adicione links de vídeo manualmente</p>
          </div>
        </div>
        <button
          onClick={syncCatalog}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/20 text-primary text-sm font-medium hover:bg-primary/30 transition-colors disabled:opacity-50"
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
          {syncing ? "Sincronizando..." : "Atualizar Catálogo"}
        </button>
      </div>

      {/* Sync progress */}
      {syncing && syncProgress && (
        <div className="bg-card/50 border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">Atualizando links do catálogo...</span>
            <span className="text-foreground font-medium">{syncProgress.processed} / {syncProgress.total || "..."}</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: syncProgress.total ? `${(syncProgress.processed / syncProgress.total) * 100}%` : "5%" }}
            />
          </div>
        </div>
      )}

      {/* Search - live search, no button */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          placeholder="Pesquisar filme ou série no TMDB..."
          className="w-full h-10 pl-10 pr-10 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />}
      </div>

      {/* Search results */}
      {results.length > 0 && !selectedItem && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {results.map(item => {
            const inCatalog = catalogStatus.get(item.id);
            const hasVideo = videoIndexStatus.get(item.id);
            return (
              <div
                key={`${item.media_type}-${item.id}`}
                className="glass rounded-xl overflow-hidden border border-transparent hover:border-primary/30 transition-all group relative"
              >
                <button
                  onClick={() => selectResult(item)}
                  className="w-full text-left"
                >
                  <div className="aspect-[2/3] bg-muted/30 overflow-hidden">
                    {item.poster_path ? (
                      <img src={posterUrl(item.poster_path, "w342")} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {item.media_type === "movie" ? <Film className="w-8 h-8 text-muted-foreground/30" /> : <Tv className="w-8 h-8 text-muted-foreground/30" />}
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium line-clamp-2">{item.title || item.name}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
                        item.media_type === "movie" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                      }`}>{item.media_type === "movie" ? "Filme" : "Série"}</span>
                      {item.vote_average > 0 && (
                        <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                          <Star className="w-2.5 h-2.5 text-primary fill-primary" />
                          {item.vote_average.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                {/* Status badges */}
                <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 items-end">
                  {inCatalog ? (
                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/90 text-white font-medium shadow-sm">
                      No catálogo
                    </span>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); addResultToContent(item); }}
                      className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-500/90 text-white font-medium shadow-sm hover:bg-amber-600 flex items-center gap-0.5"
                    >
                      <Plus className="w-2.5 h-2.5" /> Adicionar
                    </button>
                  )}
                  {hasVideo ? (
                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-blue-500/90 text-white font-medium shadow-sm flex items-center gap-0.5">
                      <CheckCircle className="w-2.5 h-2.5" /> {hasVideo}
                    </span>
                  ) : inCatalog ? (
                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-red-500/80 text-white font-medium shadow-sm flex items-center gap-0.5">
                      <XCircle className="w-2.5 h-2.5" /> Sem vídeo
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail view */}
      {loadingDetail && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {selectedItem && !loadingDetail && (
        <div className="space-y-4">
          {/* Back + Info */}
          <div className="glass rounded-2xl p-4 sm:p-5">
            <div className="flex gap-4">
              {selectedItem.poster_path && (
                <img src={posterUrl(selectedItem.poster_path, "w185")} alt="" className="w-20 sm:w-28 rounded-xl flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold font-display">{selectedItem.title || selectedItem.name}</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      TMDB: {selectedItem.id}
                      {selectedItem.imdb_id && ` • IMDB: ${selectedItem.imdb_id}`}
                      {selectedItem.external_ids?.imdb_id && ` • IMDB: ${selectedItem.external_ids.imdb_id}`}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                        selectedType === "movie" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                      }`}>{selectedType === "movie" ? "Filme" : "Série"}</span>
                      {contentInDb ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">No catálogo</span>
                      ) : (
                        <button
                          onClick={addToContent}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium hover:bg-amber-500/20"
                        >
                          + Adicionar ao catálogo
                        </button>
                      )}
                    </div>
                  </div>
                  <button onClick={() => { setSelectedItem(null); setResults([]); }} className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {selectedItem.overview && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{selectedItem.overview}</p>
                )}
              </div>
            </div>
          </div>

          {/* Manual input form (floating) */}
          {manualInput && (
            <div className="glass rounded-2xl p-4 border-2 border-primary/20 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">
                  {videoStatuses.has(manualInput.key) ? "Trocar link" : "Adicionar link"} — {manualInput.key === "movie" ? "Filme" : `T${manualInput.key.split("-")[0]} E${manualInput.key.split("-")[1]}`}
                </h3>
                <button onClick={() => setManualInput(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
              <input
                value={manualInput.url}
                onChange={e => setManualInput({ ...manualInput, url: e.target.value })}
                placeholder="Cole o link do vídeo (m3u8, mp4 ou URL embed)..."
                className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50 font-mono"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Tipo:</span>
                {(["m3u8", "mp4", "iframe-proxy"] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setManualInput({ ...manualInput, type: t })}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-colors ${
                      manualInput.type === t ? "bg-primary/20 border-primary/30 text-primary" : "bg-white/5 border-white/10 text-muted-foreground"
                    }`}
                  >{t}</button>
                ))}
                <div className="flex-1" />
                <button
                  onClick={saveManualLink}
                  disabled={!manualInput.url}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" /> Salvar
                </button>
              </div>
            </div>
          )}

          {/* Movie video status */}
          {selectedType === "movie" && (
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Vídeo do filme</span>
                {renderVideoAction("movie", selectedItem.title || selectedItem.name || "", selectedItem.id, "movie")}
              </div>
            </div>
          )}

          {/* Series seasons & episodes */}
          {selectedType === "tv" && selectedItem.seasons && (
            <div className="space-y-2">
              {selectedItem.seasons
                .filter(s => s.season_number > 0)
                .map(season => {
                  const isExpanded = expandedSeason === season.season_number;
                  const episodes = seasonEpisodes.get(season.season_number) || [];
                  const isLoading = loadingSeason === season.season_number;

                  // Count episodes with video
                  const withVideo = episodes.filter(ep => videoStatuses.has(`${season.season_number}-${ep.episode_number}`)).length;

                  return (
                    <div key={season.season_number} className="glass rounded-2xl overflow-hidden">
                      {/* Season header */}
                      <button
                        onClick={() => loadSeasonEpisodes(season.season_number)}
                        className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          ) : isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-primary" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                          <span className="text-sm font-medium">{season.name}</span>
                          <span className="text-[10px] text-muted-foreground">{season.episode_count} eps</span>
                          {episodes.length > 0 && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                              withVideo === episodes.length
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : withVideo > 0
                                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  : "bg-white/5 text-muted-foreground border border-white/10"
                            }`}>
                              {withVideo}/{episodes.length}
                            </span>
                          )}
                        </div>
                        {isExpanded && episodes.length > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); extractAllEpisodes(season.season_number); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/15 border border-primary/20 text-primary text-[10px] font-medium hover:bg-primary/25 transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" /> Extrair tudo
                          </button>
                        )}
                      </button>

                      {/* Episodes */}
                      {isExpanded && (
                        <div className="border-t border-white/5">
                          {episodes.length === 0 && !isLoading && (
                            <p className="p-4 text-xs text-muted-foreground text-center">Nenhum episódio encontrado</p>
                          )}
                          {episodes.map(ep => {
                            const key = `${season.season_number}-${ep.episode_number}`;
                            return (
                              <div key={ep.id} className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                                <div className="flex items-center gap-3 min-w-0">
                                  {ep.still_path ? (
                                    <img src={posterUrl(ep.still_path, "w92")} alt="" className="w-16 h-9 rounded-lg object-cover flex-shrink-0" />
                                  ) : (
                                    <div className="w-16 h-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                                      <Play className="w-3 h-3 text-muted-foreground/30" />
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium truncate">
                                      <span className="text-muted-foreground">E{ep.episode_number}</span> {ep.name}
                                    </p>
                                    {ep.runtime && (
                                      <p className="text-[10px] text-muted-foreground">{ep.runtime}min</p>
                                    )}
                                  </div>
                                </div>
                                {renderVideoAction(
                                  key,
                                  `${selectedItem.name || selectedItem.title} T${season.season_number}E${ep.episode_number}`,
                                  selectedItem.id,
                                  "tv",
                                  season.season_number,
                                  ep.episode_number
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Player overlay */}
      {playerUrl && (
        <div className="fixed inset-0 z-[100] bg-black animate-fade-in">
          <CustomPlayer
            sources={[{ url: playerUrl, quality: "auto", provider: "test", type: playerType }]}
            title={playerTitle}
            onClose={() => setPlayerUrl(null)}
            onError={() => setPlayerUrl(null)}
          />
        </div>
      )}
    </div>
  );
};

export default ContentSourcesPage;
