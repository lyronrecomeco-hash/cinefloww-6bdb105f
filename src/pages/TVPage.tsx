import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MobileBottomNav from "@/components/MobileBottomNav";
import { supabase } from "@/integrations/supabase/client";
import { Radio, Search, Tv2, Loader2, Signal, ChevronRight, Play, Pause, Volume2, VolumeX, Maximize, Minimize, AlertCircle } from "lucide-react";
import AdGateModal from "@/components/AdGateModal";
import Hls from "hls.js";

interface TVChannel {
  id: string;
  name: string;
  image_url: string | null;
  stream_url: string;
  category: string;
  categories: number[];
  active: boolean;
}

interface TVCategory {
  id: number;
  name: string;
  sort_order: number;
}

const TVPage = () => {
  const { channelId } = useParams<{ channelId?: string }>();
  const [channels, setChannels] = useState<TVChannel[]>([]);
  const [categories, setCategories] = useState<TVCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Player state
  const [selectedChannel, setSelectedChannel] = useState<TVChannel | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playerError, setPlayerError] = useState(false);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Ad gate
  const [showAdGate, setShowAdGate] = useState(false);
  const [adGateCompleted, setAdGateCompleted] = useState(false);

  useEffect(() => {
    const completed = sessionStorage.getItem("ad_completed_tv_0");
    if (completed) setAdGateCompleted(true);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [chRes, catRes] = await Promise.all([
      supabase.from("tv_channels").select("*").eq("active", true).order("sort_order"),
      supabase.from("tv_categories").select("*").order("sort_order"),
    ]);
    setChannels((chRes.data as TVChannel[]) || []);
    setCategories((catRes.data as TVCategory[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-select channel from URL
  useEffect(() => {
    if (channels.length === 0 || !channelId) return;
    const ch = channels.find(c => c.id === channelId);
    if (ch && !selectedChannel) {
      setSelectedChannel(ch);
    }
  }, [channelId, channels]);

  // Fullscreen listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Cleanup HLS on unmount
  useEffect(() => {
    return () => {
      hlsRef.current?.destroy();
    };
  }, []);

  const getCleanStreamUrl = (url: string) => url.replace(/\/live\//gi, "/");

  /** Resolve the final playable URL - handles both direct and embed URLs */
  const resolveStreamUrl = useCallback(async (channel: TVChannel): Promise<{ url: string; type: "m3u8" | "mp4" | "iframe" } | null> => {
    let streamUrl = getCleanStreamUrl(channel.stream_url);
    const isDirectStream = /\.(m3u8|mp4|ts)(\?|$)/i.test(streamUrl);

    if (isDirectStream) {
      const type = streamUrl.includes(".m3u8") ? "m3u8" as const : "mp4" as const;
      return { url: streamUrl, type };
    }

    // Embed URL - extract via edge function
    try {
      const { data, error } = await supabase.functions.invoke("extract-tv", {
        body: { embed_url: streamUrl },
      });
      if (error || !data?.url) return null;
      const cleanUrl = getCleanStreamUrl(data.url);
      return { url: cleanUrl, type: data.type === "mp4" ? "mp4" : "m3u8" };
    } catch {
      return null;
    }
  }, []);

  const playStream = useCallback((video: HTMLVideoElement, streamUrl: string) => {
    // Destroy previous HLS instance
    hlsRef.current?.destroy();
    hlsRef.current = null;

    const isM3u8 = streamUrl.includes(".m3u8");

    if (isM3u8 && Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        maxBufferLength: 15,
        maxMaxBufferLength: 60,
        startLevel: -1,
        enableWorker: true,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 1000,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
        fragLoadingMaxRetryTimeout: 8000,
        manifestLoadingMaxRetryTimeout: 8000,
        levelLoadingMaxRetryTimeout: 8000,
      });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
        setPlayerLoading(false);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            console.warn("[TV] HLS network error, retrying...");
            setTimeout(() => hls.startLoad(), 1500);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            console.warn("[TV] HLS media error, recovering...");
            hls.recoverMediaError();
          } else {
            setPlayerError(true);
            setPlayerLoading(false);
          }
        }
      });
    } else if (isM3u8 && video.canPlayType("application/vnd.apple.mpegurl")) {
      // iOS native HLS
      video.removeAttribute("crossOrigin");
      video.src = streamUrl;
      video.load();
      video.play().catch(() => {});
      video.onloadedmetadata = () => setPlayerLoading(false);
      video.onerror = () => { setPlayerError(true); setPlayerLoading(false); };
    } else {
      // MP4 or other direct
      video.removeAttribute("crossOrigin");
      video.src = streamUrl;
      video.load();
      video.play().catch(() => {});
      video.onloadedmetadata = () => setPlayerLoading(false);
      video.onerror = () => { setPlayerError(true); setPlayerLoading(false); };
    }

    // Safety timeout - 20s
    setTimeout(() => {
      if (video.readyState < 2 && !video.paused) {
        console.warn("[TV] Safety timeout - stream didn't load in 20s");
        setPlayerError(true);
        setPlayerLoading(false);
      }
    }, 20000);
  }, []);

  const startPlayback = useCallback(async (channel: TVChannel) => {
    const video = videoRef.current;
    if (!video) return;

    setPlayerLoading(true);
    setPlayerError(false);
    setIsPlaying(true);
    setIsPaused(false);

    hlsRef.current?.destroy();
    hlsRef.current = null;

    const resolved = await resolveStreamUrl(channel);
    if (!resolved || resolved.type === "iframe") {
      setPlayerError(true);
      setPlayerLoading(false);
      return;
    }

    playStream(video, resolved.url);
  }, [resolveStreamUrl, playStream]);

  const handleSelectChannel = useCallback((channel: TVChannel) => {
    setSelectedChannel(channel);
    setIsPlaying(false);
    setIsPaused(false);
    setPlayerError(false);
    navigate(`/lynetv/${channel.id}`, { replace: true });
    window.scrollTo({ top: 0, behavior: "smooth" });

    // If ads already completed, auto-play
    const completed = sessionStorage.getItem("ad_completed_tv_0");
    if (completed) {
      setAdGateCompleted(true);
      setTimeout(() => startPlayback(channel), 150);
    }
  }, [navigate, startPlayback]);

  // Toggle play/pause - this is where ad gate triggers
  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!selectedChannel) return;

    if (!isPlaying) {
      // First play - check ad gate
      if (!adGateCompleted) {
        setShowAdGate(true);
        return;
      }
      startPlayback(selectedChannel);
      return;
    }

    // Already playing - toggle pause
    if (video) {
      if (video.paused) {
        video.play().catch(() => {});
        setIsPaused(false);
      } else {
        video.pause();
        setIsPaused(true);
      }
    }
  }, [selectedChannel, isPlaying, adGateCompleted, startPlayback]);

  const handleAdContinue = useCallback(() => {
    setShowAdGate(false);
    setAdGateCompleted(true);
    if (selectedChannel) {
      startPlayback(selectedChannel);
    }
  }, [selectedChannel, startPlayback]);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  const toggleFullscreen = useCallback(() => {
    const el = playerContainerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }, []);

  const retryPlayback = useCallback(() => {
    if (selectedChannel) startPlayback(selectedChannel);
  }, [selectedChannel, startPlayback]);

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  // Filter channels
  const filtered = useMemo(() => channels.filter((ch) => {
    const matchCat = activeCategory === 0 || ch.categories?.includes(activeCategory);
    const matchSearch = !search || ch.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  }), [channels, activeCategory, search]);

  // Deduplicate categories by id AND name
  const uniqueCategories = useMemo(() => {
    const seen = new Set<number>();
    const seenNames = new Set<string>();
    return categories.filter(c => {
      const lowerName = c.name.toLowerCase();
      if (seen.has(c.id) || seenNames.has(lowerName) || lowerName === "todos") return false;
      seen.add(c.id);
      seenNames.add(lowerName);
      return true;
    });
  }, [categories]);

  // Group by category
  const sortedGroups = useMemo(() => {
    const grouped = filtered.reduce<Record<string, TVChannel[]>>((acc, ch) => {
      const cat = ch.category || "Outros";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(ch);
      return acc;
    }, {});
    const catOrder = categories.reduce<Record<string, number>>((m, c) => { m[c.name] = c.sort_order; return m; }, {});
    return Object.entries(grouped).sort(([a], [b]) => (catOrder[a] ?? 999) - (catOrder[b] ?? 999));
  }, [filtered, categories]);

  // Fallback image
  const getChannelImage = (channel: TVChannel) => {
    if (channel.image_url && channel.image_url.trim() !== "") return channel.image_url;
    return null;
  };

  const channelInitials = (name: string) => {
    return name.split(" ").slice(0, 2).map(w => w?.[0] || "").join("").toUpperCase();
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {showAdGate && (
        <AdGateModal
          onContinue={handleAdContinue}
          onClose={() => setShowAdGate(false)}
          contentTitle="LyneTV"
          tmdbId={0}
          contentType="tv"
        />
      )}

      <div className="pt-16 sm:pt-20 lg:pt-24 pb-24 sm:pb-12">
        {/* ===== HEADER ===== */}
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 lg:px-8 mb-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-red-500/20 to-primary/20 flex items-center justify-center border border-white/5">
              <Tv2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-2">
                TV <span className="text-gradient">LYNE</span>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </span>
              </h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1.5">
                <Signal className="w-3 h-3" />
                {channels.length} canais ao vivo • Transmissão em tempo real
              </p>
            </div>
          </div>
        </div>

        {/* ===== PLAYER AREA ===== */}
        {selectedChannel && (
          <div className="max-w-[1400px] mx-auto px-3 sm:px-6 lg:px-8 mb-6">
            <div
              ref={playerContainerRef}
              className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-white/5"
              onMouseMove={resetControlsTimer}
              onTouchStart={resetControlsTimer}
            >
              <video
                ref={videoRef}
                className="w-full h-full object-contain bg-black"
                playsInline
                autoPlay
                muted={isMuted}
                onClick={togglePlayPause}
              />

              {/* Not started overlay - smaller play button */}
              {!isPlaying && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-black/60 via-black/80 to-black/60 cursor-pointer"
                  onClick={togglePlayPause}
                >
                  {selectedChannel.image_url ? (
                    <img src={selectedChannel.image_url} alt="" className="w-12 h-12 sm:w-14 sm:h-14 object-contain mb-2 opacity-60" />
                  ) : (
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-white/10 flex items-center justify-center mb-2">
                      <span className="text-sm font-bold text-white/60">{channelInitials(selectedChannel.name)}</span>
                    </div>
                  )}
                  <h3 className="text-white font-semibold text-xs sm:text-sm mb-0.5">{selectedChannel.name}</h3>
                  <p className="text-muted-foreground text-[9px] sm:text-[10px] mb-3">{selectedChannel.category}</p>
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-primary/90 flex items-center justify-center shadow-lg shadow-primary/30 hover:scale-105 transition-transform">
                    <Play className="w-5 h-5 sm:w-5.5 sm:h-5.5 text-primary-foreground fill-current ml-0.5" />
                  </div>
                </div>
              )}

              {/* Paused overlay */}
              {isPlaying && isPaused && !playerLoading && !playerError && (
                <div
                  className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer"
                  onClick={togglePlayPause}
                >
                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center hover:scale-105 transition-transform">
                    <Play className="w-5 h-5 text-white fill-current ml-0.5" />
                  </div>
                </div>
              )}

              {/* Loading overlay */}
              {playerLoading && isPlaying && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-[10px] text-muted-foreground mt-2 animate-pulse">Conectando ao stream...</p>
                </div>
              )}

              {/* Error overlay */}
              {playerError && isPlaying && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-10">
                  <AlertCircle className="w-8 h-8 text-destructive mb-2" />
                  <p className="text-xs text-white font-medium mb-0.5">Falha ao carregar stream</p>
                  <p className="text-[10px] text-muted-foreground mb-3">O canal pode estar temporariamente fora do ar</p>
                  <button onClick={retryPlayback} className="px-5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-all">
                    Tentar novamente
                  </button>
                </div>
              )}

              {/* Player controls */}
              {isPlaying && !playerLoading && !playerError && (
                <div className={`absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 sm:px-5 py-2.5 bg-gradient-to-t from-black/80 to-transparent z-10 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0"}`}>
                  <div className="flex items-center gap-3">
                    <button onClick={(e) => { e.stopPropagation(); togglePlayPause(); }} className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all">
                      {isPaused ? <Play className="w-3.5 h-3.5 text-white fill-current ml-0.5" /> : <Pause className="w-3.5 h-3.5 text-white" />}
                    </button>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/90 backdrop-blur-sm">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                      </span>
                      <span className="text-[9px] font-bold text-white uppercase tracking-wider">AO VIVO</span>
                    </div>
                    <span className="text-xs font-medium text-white hidden sm:block">{selectedChannel?.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all">
                      {isMuted ? <VolumeX className="w-3.5 h-3.5 text-white" /> : <Volume2 className="w-3.5 h-3.5 text-white" />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all">
                      {isFullscreen ? <Minimize className="w-3.5 h-3.5 text-white" /> : <Maximize className="w-3.5 h-3.5 text-white" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== CHANNEL LIST ===== */}
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 lg:px-8">
          {/* Search - centered on PC */}
          <div className="flex justify-center mb-5">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar canal..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          {/* Category filter */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-5 pb-1">
            <button
              onClick={() => setActiveCategory(0)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                activeCategory === 0
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
              }`}
            >
              Todos
            </button>
            {uniqueCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                  activeCategory === cat.id
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                    : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Channels grid */}
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Tv2 className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">Nenhum canal encontrado</p>
            </div>
          ) : (
            <div className="space-y-7">
              {sortedGroups.map(([catName, catChannels]) => (
                <div key={catName}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1 h-5 rounded-full bg-gradient-to-b from-primary to-primary/40" />
                    <h2 className="text-sm font-bold tracking-tight">{catName}</h2>
                    <span className="text-[10px] text-muted-foreground/50 bg-white/5 px-1.5 py-0.5 rounded-md">{catChannels.length}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 ml-auto" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3">
                    {catChannels.map((channel) => {
                      const isSelected = selectedChannel?.id === channel.id;
                      const imgUrl = getChannelImage(channel);
                      return (
                        <button
                          key={channel.id}
                          onClick={() => handleSelectChannel(channel)}
                          className={`group relative glass rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.03] hover:shadow-xl text-left border ${
                            isSelected
                              ? "ring-2 ring-primary border-primary/40 shadow-lg shadow-primary/10"
                              : "border-white/5 hover:border-primary/20"
                          }`}
                        >
                          {/* Live badge */}
                          <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/90 backdrop-blur-sm">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                            </span>
                            <span className="text-[7px] font-bold text-white uppercase tracking-wider">LIVE</span>
                          </div>

                          {/* Now playing */}
                          {isSelected && isPlaying && (
                            <div className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded-full bg-primary/90 backdrop-blur-sm">
                              <span className="text-[7px] font-bold text-primary-foreground uppercase tracking-wider">▶ NOW</span>
                            </div>
                          )}

                          {/* Channel image */}
                          <div className="aspect-video flex items-center justify-center p-3 sm:p-4 bg-gradient-to-br from-white/[0.03] to-transparent">
                            {imgUrl ? (
                              <img
                                src={imgUrl}
                                alt={channel.name}
                                className="w-full h-full object-contain max-h-12 sm:max-h-16 transition-transform duration-300 group-hover:scale-110"
                                loading="lazy"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                  const fallback = (e.target as HTMLImageElement).nextElementSibling;
                                  if (fallback) (fallback as HTMLElement).style.display = "flex";
                                }}
                              />
                            ) : null}
                            <div
                              className="items-center justify-center"
                              style={{ display: imgUrl ? "none" : "flex" }}
                            >
                              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                                <span className="text-xs sm:text-sm font-bold text-primary">{channelInitials(channel.name)}</span>
                              </div>
                            </div>
                          </div>

                          {/* Channel info */}
                          <div className="px-2 sm:px-2.5 pb-2.5 pt-0.5">
                            <h3 className="text-[10px] sm:text-xs font-semibold line-clamp-1 text-foreground group-hover:text-primary transition-colors">
                              {channel.name}
                            </h3>
                            <div className="flex items-center justify-between mt-1">
                              <p className="text-[8px] sm:text-[9px] text-muted-foreground/60">{channel.category}</p>
                              <Play className="w-3 h-3 text-primary/60 group-hover:text-primary transition-colors" />
                            </div>
                          </div>

                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-primary/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
      <MobileBottomNav />
    </div>
  );
};

export default TVPage;
