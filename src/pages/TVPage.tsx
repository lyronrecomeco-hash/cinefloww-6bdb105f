import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Radio, Search, Tv2, Loader2, Signal, X, Maximize, Minimize, Play } from "lucide-react";
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

const CHANNELS_PER_CATEGORY = 20;

const TVPage = () => {
  const { channelId } = useParams<{ channelId?: string }>();
  const navigate = useNavigate();

  const [channels, setChannels] = useState<ApiChannel[]>([]);
  const [categoryList, setCategoryList] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    const interval = setInterval(fetchChannels, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchChannels]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

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
    }, 100);
  }, []);

  const handleWatch = useCallback((channel: ApiChannel) => {
    if (!adGateCompleted) {
      setPendingChannel(channel);
      setShowAdGate(true);
      return;
    }
    navigate(`/tv/${channel.id}`, { replace: true });
    startPlayback(channel);
    // Scroll to top to see player
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  const toggleExpand = (cat: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
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

      <div className="pt-20 sm:pt-24 px-4 sm:px-6 lg:px-10 pb-24 max-w-[1400px] mx-auto">

        {/* ===== PLAYER ===== */}
        {playerChannel && (
          <div className="mb-8">
            <div
              ref={playerContainerRef}
              className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl shadow-black/60"
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
                  <p className="text-sm text-muted-foreground animate-pulse">Conectando ao vivo...</p>
                </div>
              )}

              {playerError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
                  <div className="text-center p-6">
                    <Radio className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground mb-4">Canal indisponível no momento</p>
                    <button
                      onClick={() => startPlayback(playerChannel)}
                      className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
                    >
                      Tentar novamente
                    </button>
                  </div>
                </div>
              )}

              {/* Overlay controls */}
              <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 sm:px-6 py-3 bg-gradient-to-b from-black/80 via-black/30 to-transparent z-10">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/90 backdrop-blur-sm">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                    </span>
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">AO VIVO</span>
                  </div>
                  <span className="text-sm font-semibold text-white drop-shadow-lg">{playerChannel.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={toggleFullscreen} className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all border border-white/10">
                    {isFullscreen ? <Minimize className="w-4 h-4 text-white" /> : <Maximize className="w-4 h-4 text-white" />}
                  </button>
                  <button onClick={closePlayer} className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all border border-white/10">
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== HEADER ===== */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Tv2 className="w-7 h-7 text-primary" />
            <h1 className="font-display text-2xl sm:text-3xl font-bold">
              TV <span className="text-gradient">LYNE</span>
            </h1>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
          </div>
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <Signal className="w-3 h-3" />
            {channels.length} canais disponíveis ao vivo
          </p>
        </div>

        {/* Search */}
        <div className="max-w-lg mx-auto mb-5">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar canal, jogo ou categoria..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-11 pr-4 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-8 pb-1 justify-center flex-wrap">
          <button
            onClick={() => setActiveCategory("all")}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${
              activeCategory === "all"
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            }`}
          >
            Todos
          </button>
          {categoryList.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                activeCategory === cat
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* ===== CONTENT ===== */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground animate-pulse">Carregando canais...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Radio className="w-12 h-12 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <button onClick={fetchChannels} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
              Tentar novamente
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Tv2 className="w-14 h-14 text-muted-foreground/20 mb-4" />
            <p className="text-sm text-muted-foreground">Nenhum canal encontrado</p>
          </div>
        ) : (
          <div className="space-y-10">
            {sortedGroups.map(([catName, catChannels]) => {
              const isExpanded = expandedCats.has(catName);
              const displayChannels = isExpanded ? catChannels : catChannels.slice(0, CHANNELS_PER_CATEGORY);
              const hasMore = catChannels.length > CHANNELS_PER_CATEGORY;

              return (
                <section key={catName}>
                  {/* Category header with separator */}
                  <div className="flex items-center gap-3 mb-5">
                    <h2 className="text-base sm:text-lg font-bold tracking-tight uppercase">{catName}</h2>
                    <span className="px-2 py-0.5 rounded-md bg-primary/20 text-primary text-[11px] font-bold tabular-nums">
                      {catChannels.length}
                    </span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>

                  {/* Channel grid - 4 cols on desktop like CineVeo reference */}
                  <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {displayChannels.map((channel) => {
                      const isPlaying = playerChannel?.id === channel.id;
                      return (
                        <div
                          key={channel.id}
                          className={`rounded-xl overflow-hidden transition-all duration-300 border ${
                            isPlaying
                              ? "ring-2 ring-primary border-primary/40 shadow-lg shadow-primary/20"
                              : "border-white/10 hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.06]"
                          }`}
                        >
                          {/* Channel poster area */}
                          <div className="aspect-video flex items-center justify-center p-5 bg-gradient-to-br from-white/[0.04] to-transparent relative">
                            {isPlaying && (
                              <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-primary">
                                <span className="text-[9px] font-bold text-primary-foreground uppercase tracking-wider">▶ AO VIVO</span>
                              </div>
                            )}
                            {channel.poster ? (
                              <img
                                src={channel.poster}
                                alt={channel.title}
                                className="max-h-20 sm:max-h-24 object-contain transition-transform duration-300 hover:scale-105"
                                loading="lazy"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <Radio className="w-10 h-10 text-muted-foreground/20" />
                            )}
                          </div>

                          {/* Info */}
                          <div className="px-4 pt-3 pb-2">
                            <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-tight min-h-[40px]">
                              {channel.title}
                            </h3>
                            <p className="text-[10px] text-muted-foreground/50 mt-1 uppercase tracking-wider font-medium">
                              {channel.category}
                            </p>
                          </div>

                          {/* ASSISTIR button */}
                          <div className="px-4 pb-4 pt-1">
                            <button
                              onClick={() => handleWatch(channel)}
                              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${
                                isPlaying
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-amber-500 hover:bg-amber-400 text-black"
                              }`}
                            >
                              <Play className="w-3.5 h-3.5" />
                              {isPlaying ? "ASSISTINDO" : "ASSISTIR"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Show more button */}
                  {hasMore && (
                    <div className="flex justify-center mt-4">
                      <button
                        onClick={() => toggleExpand(catName)}
                        className="px-6 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground transition-all"
                      >
                        {isExpanded
                          ? "Mostrar menos"
                          : `Ver todos os ${catChannels.length} canais`}
                      </button>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default TVPage;
