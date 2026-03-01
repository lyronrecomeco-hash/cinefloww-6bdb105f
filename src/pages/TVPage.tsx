import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MobileBottomNav from "@/components/MobileBottomNav";
import { supabase } from "@/integrations/supabase/client";
import { Radio, Search, Tv2, Loader2, Signal, ChevronRight, Play, Volume2, VolumeX, Maximize, Minimize, AlertCircle } from "lucide-react";
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
  const [playerError, setPlayerError] = useState(false);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  // Ad gate
  const [showAdGate, setShowAdGate] = useState(false);
  const [adGateCompleted, setAdGateCompleted] = useState(false);

  useEffect(() => {
    // AdGateModal stores key as ad_completed_tv_0 (contentType=tv, tmdbId=0)
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

  const startPlayback = useCallback((channel: TVChannel) => {
    const video = videoRef.current;
    if (!video) return;

    setPlayerLoading(true);
    setPlayerError(false);
    setIsPlaying(true);

    hlsRef.current?.destroy();
    hlsRef.current = null;

    let streamUrl = getCleanStreamUrl(channel.stream_url);

    // If it's a CineVeo embed URL (not a direct stream), extract via edge function
    const isDirectStream = streamUrl.includes(".m3u8") || streamUrl.includes(".mp4") || streamUrl.includes(".ts");

    if (!isDirectStream) {
      // It's an embed URL - use extract-tv to get direct stream
      supabase.functions.invoke("extract-tv", {
        body: { embed_url: streamUrl },
      }).then(({ data, error }) => {
        if (error || !data?.url) {
          console.warn("[TVPage] extract-tv failed, trying embed as iframe fallback");
          setPlayerError(true);
          setPlayerLoading(false);
          return;
        }
        const extractedUrl = getCleanStreamUrl(data.url);
        playStream(video, extractedUrl);
      });
      return;
    }

    playStream(video, streamUrl);
  }, []);

  const playStream = useCallback((video: HTMLVideoElement, streamUrl: string) => {
    if (streamUrl.includes(".m3u8") && Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        maxBufferLength: 10,
        maxMaxBufferLength: 30,
        startLevel: -1,
        enableWorker: true,
        fragLoadingMaxRetry: 3,
        fragLoadingRetryDelay: 1000,
        manifestLoadingMaxRetry: 3,
        levelLoadingMaxRetry: 3,
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
            // Try to recover
            hls.startLoad();
          } else {
            setPlayerError(true);
            setPlayerLoading(false);
          }
        }
      });
    } else if (streamUrl.includes(".m3u8") && video.canPlayType("application/vnd.apple.mpegurl")) {
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

    // Safety timeout - if still loading after 15s, show error
    setTimeout(() => {
      if (video.readyState < 2) {
        setPlayerError(true);
        setPlayerLoading(false);
      }
    }, 15000);
  }, []);

  const handleSelectChannel = useCallback((channel: TVChannel) => {
    setSelectedChannel(channel);
    setIsPlaying(false);
    setPlayerError(false);
    navigate(`/lynetv/${channel.id}`, { replace: true });

    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [navigate]);

  const handlePlay = useCallback(() => {
    if (!selectedChannel) return;
    if (!adGateCompleted) {
      setShowAdGate(true);
      return;
    }
    startPlayback(selectedChannel);
  }, [selectedChannel, adGateCompleted, startPlayback]);

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
    if (selectedChannel) {
      startPlayback(selectedChannel);
    }
  }, [selectedChannel, startPlayback]);

  // Filter channels
  const filtered = useMemo(() => channels.filter((ch) => {
    const matchCat = activeCategory === 0 || ch.categories?.includes(activeCategory);
    const matchSearch = !search || ch.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  }), [channels, activeCategory, search]);

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
        {/* ===== PLAYER AREA ===== */}
        <div className="w-full bg-black">
          <div
            ref={playerContainerRef}
            className="relative w-full max-w-[1400px] mx-auto aspect-video"
          >
            {/* Video element - always mounted */}
            <video
              ref={videoRef}
              className={`w-full h-full object-contain bg-black ${isPlaying ? "block" : "hidden"}`}
              playsInline
              autoPlay
              muted={isMuted}
            />

            {/* Idle state - no channel selected or not playing */}
            {(!selectedChannel || !isPlaying) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-black via-[hsl(220,25%,8%)] to-black">
                {selectedChannel ? (
                  <>
                    {/* Channel preview */}
                    <div className="flex flex-col items-center gap-4">
                      {selectedChannel.image_url ? (
                        <img
                          src={selectedChannel.image_url}
                          alt={selectedChannel.name}
                          className="w-20 h-20 sm:w-28 sm:h-28 object-contain"
                        />
                      ) : (
                        <Radio className="w-16 h-16 text-muted-foreground/30" />
                      )}
                      <h2 className="text-white font-bold text-lg sm:text-2xl text-center px-4">{selectedChannel.name}</h2>
                      <p className="text-muted-foreground text-xs sm:text-sm">{selectedChannel.category}</p>
                      <button
                        onClick={handlePlay}
                        className="mt-2 flex items-center gap-2.5 px-8 py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm sm:text-base hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-primary/30"
                      >
                        <Play className="w-5 h-5 fill-current" />
                        ASSISTIR AO VIVO
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-center px-6">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <Tv2 className="w-8 h-8 sm:w-10 sm:h-10 text-primary/60" />
                    </div>
                    <h2 className="text-white font-bold text-lg sm:text-xl">Selecione um canal</h2>
                    <p className="text-muted-foreground text-xs sm:text-sm max-w-xs">Escolha um canal abaixo para começar a assistir ao vivo</p>
                  </div>
                )}
              </div>
            )}

            {/* Loading overlay */}
            {playerLoading && isPlaying && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-xs text-muted-foreground mt-3 animate-pulse">Conectando ao stream...</p>
              </div>
            )}

            {/* Error overlay */}
            {playerError && isPlaying && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-10">
                <AlertCircle className="w-10 h-10 text-destructive mb-3" />
                <p className="text-sm text-white font-medium mb-1">Falha ao carregar stream</p>
                <p className="text-xs text-muted-foreground mb-4">O canal pode estar temporariamente fora do ar</p>
                <button onClick={retryPlayback} className="px-6 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all">
                  Tentar novamente
                </button>
              </div>
            )}

            {/* Player controls overlay */}
            {isPlaying && !playerLoading && !playerError && (
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 sm:px-5 py-2.5 bg-gradient-to-t from-black/80 to-transparent z-10 opacity-0 hover:opacity-100 transition-opacity duration-300">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/90 backdrop-blur-sm">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                    </span>
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">AO VIVO</span>
                  </div>
                  <span className="text-sm font-medium text-white">{selectedChannel?.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={toggleMute} className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all">
                    {isMuted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
                  </button>
                  <button onClick={toggleFullscreen} className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all">
                    {isFullscreen ? <Minimize className="w-4 h-4 text-white" /> : <Maximize className="w-4 h-4 text-white" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== CHANNEL LIST BELOW PLAYER ===== */}
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 lg:px-8 mt-6 sm:mt-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
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
                  {channels.length} canais ao vivo
                </p>
              </div>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar canal..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-10 pr-4 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
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
            {categories.map((cat) => (
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
                            {channel.image_url ? (
                              <img
                                src={channel.image_url}
                                alt={channel.name}
                                className="w-full h-full object-contain max-h-12 sm:max-h-16 transition-transform duration-300 group-hover:scale-110"
                                loading="lazy"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                  const next = (e.target as HTMLImageElement).nextElementSibling;
                                  if (next) next.classList.remove("hidden");
                                }}
                              />
                            ) : null}
                            <div className={`${channel.image_url ? "hidden" : ""} flex items-center justify-center`}>
                              <Radio className="w-6 h-6 sm:w-7 sm:h-7 text-muted-foreground/40" />
                            </div>
                          </div>

                          {/* Channel info */}
                          <div className="px-2 sm:px-2.5 pb-2.5 pt-0.5">
                            <h3 className="text-[10px] sm:text-xs font-semibold line-clamp-1 text-foreground group-hover:text-primary transition-colors">
                              {channel.name}
                            </h3>
                            <p className="text-[8px] sm:text-[9px] text-muted-foreground/60 mt-0.5">{channel.category}</p>
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
