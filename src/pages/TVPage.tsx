import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Radio, Search, Tv2, Loader2, Signal, ChevronRight, X, Maximize, Minimize, Play } from "lucide-react";
import AdGateModal from "@/components/AdGateModal";
import Hls from "hls.js";

interface ApiChannel {
  id: number;
  title: string;
  type: string;
  poster: string;
  category: string;
  stream_url: string;
}

const TVPage = () => {
  const { channelId } = useParams<{ channelId?: string }>();
  const navigate = useNavigate();

  const [channels, setChannels] = useState<ApiChannel[]>([]);
  const [categoryList, setCategoryList] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Player
  const [playerChannel, setPlayerChannel] = useState<ApiChannel | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerError, setPlayerError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  // Ad gate
  const [showAdGate, setShowAdGate] = useState(false);
  const [adGateCompleted, setAdGateCompleted] = useState(false);
  const [pendingChannel, setPendingChannel] = useState<ApiChannel | null>(null);

  useEffect(() => {
    const completed = sessionStorage.getItem("ad_completed_lynetv_0");
    if (completed) setAdGateCompleted(true);
  }, []);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("fetch-tv-channels");
      if (fnError) throw fnError;
      if (data?.channels) {
        setChannels(data.channels);
        setCategoryList(data.categories || []);
      }
    } catch (err: any) {
      console.error("[TVPage] Fetch error:", err);
      setError("Erro ao carregar canais. Tente novamente.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  // Auto-refresh every 5 min
  useEffect(() => {
    const interval = setInterval(fetchChannels, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchChannels]);

  // Fullscreen listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Start HLS playback
  const startPlayback = useCallback((channel: ApiChannel) => {
    setPlayerChannel(channel);
    setPlayerLoading(true);
    setPlayerError(false);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setTimeout(() => {
      const video = videoRef.current;
      if (!video) return;

      const url = channel.stream_url;
      video.removeAttribute("crossorigin");

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          startLevel: -1,
          abrEwmaDefaultEstimate: 5000000,
          maxBufferLength: 10,
          maxMaxBufferLength: 60,
          maxBufferSize: 30 * 1000 * 1000,
          startFragPrefetch: true,
          testBandwidth: false,
          progressive: true,
          backBufferLength: 20,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 6,
          liveDurationInfinity: true,
          fragLoadingTimeOut: 10000,
          fragLoadingMaxRetry: 5,
          manifestLoadingTimeOut: 8000,
          manifestLoadingMaxRetry: 3,
          xhrSetup: (xhr) => { xhr.withCredentials = false; },
        });

        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setPlayerLoading(false);
          video.play().catch(() => {});
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hls.startLoad();
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
            } else {
              setPlayerError(true);
              setPlayerLoading(false);
            }
          }
        });

        hls.on(Hls.Events.FRAG_LOADED, () => {
          setPlayerLoading(false);
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
        video.addEventListener("loadedmetadata", () => {
          setPlayerLoading(false);
          video.play().catch(() => {});
        }, { once: true });
      }

      video.addEventListener("error", () => {
        setPlayerError(true);
        setPlayerLoading(false);
      }, { once: true });
    }, 50);
  }, []);

  const handleWatch = useCallback((channel: ApiChannel) => {
    if (!adGateCompleted) {
      setPendingChannel(channel);
      setShowAdGate(true);
      return;
    }
    navigate(`/tv/${channel.id}`, { replace: true });
    startPlayback(channel);
  }, [adGateCompleted, navigate, startPlayback]);

  const handleAdContinue = useCallback(() => {
    setShowAdGate(false);
    setAdGateCompleted(true);
    if (pendingChannel) {
      navigate(`/tv/${pendingChannel.id}`, { replace: true });
      startPlayback(pendingChannel);
      setPendingChannel(null);
    }
  }, [pendingChannel, navigate, startPlayback]);

  // If route has channelId, find and play it after channels load
  useEffect(() => {
    if (!channelId || channels.length === 0 || playerChannel) return;
    const ch = channels.find(c => String(c.id) === channelId);
    if (ch) {
      if (adGateCompleted) {
        startPlayback(ch);
      } else {
        setPendingChannel(ch);
        setShowAdGate(true);
      }
    }
  }, [channelId, channels, adGateCompleted, playerChannel, startPlayback]);

  const closePlayer = useCallback(() => {
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    setPlayerChannel(null);
    setPlayerError(false);
    navigate("/lynetv", { replace: true });
  }, [navigate]);

  const toggleFullscreen = useCallback(() => {
    const el = playerContainerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, []);

  // Filter
  const filtered = channels.filter((ch) => {
    const matchCat = activeCategory === "all" || ch.category === activeCategory;
    const matchSearch = !search || ch.title.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  // Group by category
  const grouped = filtered.reduce<Record<string, ApiChannel[]>>((acc, ch) => {
    const cat = ch.category || "Outros";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ch);
    return acc;
  }, {});

  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
    if (a === "JOGOS DO DIA") return -1;
    if (b === "JOGOS DO DIA") return 1;
    return a.localeCompare(b, "pt-BR");
  });

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

      <div className="pt-20 sm:pt-24 px-3 sm:px-6 lg:px-12 pb-20">

        {/* ===== PLAYER ===== */}
        {playerChannel && (
          <div className="mb-6">
            <div
              ref={playerContainerRef}
              className="relative w-full max-w-5xl mx-auto aspect-video bg-black rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl shadow-black/60"
            >
              <video
                ref={videoRef}
                className="w-full h-full object-contain bg-black"
                playsInline
                autoPlay
              />

              {playerLoading && !playerError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20">
                  <div className="lyneflix-spinner mb-4" />
                  <p className="text-xs text-muted-foreground animate-pulse">Conectando ao vivo...</p>
                </div>
              )}

              {playerError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
                  <div className="text-center p-6">
                    <Radio className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-3">Canal indisponível no momento</p>
                    <button
                      onClick={() => startPlayback(playerChannel)}
                      className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
                    >
                      Tentar novamente
                    </button>
                  </div>
                </div>
              )}

              {/* Overlay controls */}
              <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent z-10">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/90">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                    </span>
                    <span className="text-[9px] font-bold text-white uppercase tracking-wider">AO VIVO</span>
                  </div>
                  <span className="text-xs font-semibold text-white drop-shadow-lg">{playerChannel.title}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={toggleFullscreen} className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all">
                    {isFullscreen ? <Minimize className="w-3.5 h-3.5 text-white" /> : <Maximize className="w-3.5 h-3.5 text-white" />}
                  </button>
                  <button onClick={closePlayer} className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all">
                    <X className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== HEADER ===== */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/20 to-primary/20 flex items-center justify-center border border-white/5">
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
              <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                <Signal className="w-3 h-3" />
                {channels.length} canais ao vivo
              </p>
            </div>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar canal..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-4 rounded-lg bg-white/5 border border-white/10 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
            />
          </div>
        </div>

        {/* Category pills */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-6 pb-1">
          <button
            onClick={() => setActiveCategory("all")}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
              activeCategory === "all"
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
            }`}
          >
            Todos
          </button>
          {categoryList.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
                activeCategory === cat
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                  : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* ===== CONTENT ===== */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground animate-pulse">Carregando canais...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Radio className="w-10 h-10 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">{error}</p>
            <button onClick={fetchChannels} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">
              Tentar novamente
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Tv2 className="w-12 h-12 text-muted-foreground/20 mb-3" />
            <p className="text-xs text-muted-foreground">Nenhum canal encontrado</p>
          </div>
        ) : (
          <div className="space-y-7">
            {sortedGroups.map(([catName, catChannels]) => (
              <section key={catName}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-5 rounded-full bg-gradient-to-b from-primary to-primary/30" />
                  <h2 className="text-xs sm:text-sm font-bold tracking-tight">{catName}</h2>
                  <span className="text-[9px] text-muted-foreground/40 ml-1">{catChannels.length}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/20 ml-auto" />
                </div>

                <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                  {catChannels.map((channel) => {
                    const isPlaying = playerChannel?.id === channel.id;
                    return (
                      <div
                        key={channel.id}
                        className={`group relative rounded-lg overflow-hidden transition-all duration-200 border ${
                          isPlaying
                            ? "ring-2 ring-primary border-primary/40 shadow-lg shadow-primary/20"
                            : "border-white/5 hover:border-white/15 bg-white/[0.02] hover:bg-white/[0.04]"
                        }`}
                      >
                        {/* Live indicator */}
                        <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 px-1 py-px rounded-full bg-red-600/90">
                          <span className="relative flex h-1 w-1">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                            <span className="relative inline-flex rounded-full h-1 w-1 bg-white" />
                          </span>
                          <span className="text-[6px] font-bold text-white uppercase tracking-widest">LIVE</span>
                        </div>

                        {isPlaying && (
                          <div className="absolute top-1 left-1 z-10 px-1.5 py-px rounded-full bg-primary">
                            <span className="text-[6px] font-bold text-primary-foreground uppercase">▶ ON</span>
                          </div>
                        )}

                        {/* Channel poster */}
                        <div className="aspect-[4/3] flex items-center justify-center p-2 bg-gradient-to-br from-white/[0.03] to-transparent">
                          {channel.poster ? (
                            <img
                              src={channel.poster}
                              alt={channel.title}
                              className="w-full h-full object-contain max-h-10 sm:max-h-12 transition-transform duration-200 group-hover:scale-105"
                              loading="lazy"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <Radio className="w-5 h-5 text-muted-foreground/20" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="px-2 pb-1.5">
                          <h3 className="text-[9px] sm:text-[10px] font-semibold line-clamp-2 text-foreground leading-tight min-h-[24px]">
                            {channel.title}
                          </h3>
                          <p className="text-[7px] text-muted-foreground/40 mt-0.5 uppercase tracking-wider font-medium truncate">
                            {channel.category}
                          </p>
                        </div>

                        {/* Assistir button - outside the card visually but inside for click */}
                        <div className="px-2 pb-2">
                          <button
                            onClick={() => handleWatch(channel)}
                            className={`w-full flex items-center justify-center gap-1 py-1.5 rounded-md text-[9px] font-semibold transition-all ${
                              isPlaying
                                ? "bg-primary/20 text-primary"
                                : "bg-white/5 text-muted-foreground hover:bg-primary hover:text-primary-foreground"
                            }`}
                          >
                            <Play className="w-2.5 h-2.5" />
                            {isPlaying ? "Assistindo" : "Assistir"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default TVPage;
