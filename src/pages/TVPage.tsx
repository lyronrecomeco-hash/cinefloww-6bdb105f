import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Radio, Search, Tv2, ArrowLeft, Loader2, Volume2, VolumeX, Maximize } from "lucide-react";
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

interface EPGEntry {
  id: string;
  epg: {
    title: string;
    desc: string;
    start_date: string;
  };
}

const TVPage = () => {
  const { channelId } = useParams<{ channelId?: string }>();
  const [channels, setChannels] = useState<TVChannel[]>([]);
  const [categories, setCategories] = useState<TVCategory[]>([]);
  const [epgMap, setEpgMap] = useState<Record<string, EPGEntry["epg"]>>({});
  const [activeCategory, setActiveCategory] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Player state
  const [playerChannel, setPlayerChannel] = useState<TVChannel | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamType, setStreamType] = useState<"m3u8" | "mp4" | "iframe">("iframe");
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [iframeHtml, setIframeHtml] = useState<string | null>(null);

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

  const fetchEpg = useCallback(async () => {
    try {
      const resp = await fetch("https://embedtv.best/api/epgs");
      if (resp.ok) {
        const data: EPGEntry[] = await resp.json();
        const map: Record<string, EPGEntry["epg"]> = {};
        for (const entry of data) map[entry.id] = entry.epg;
        setEpgMap(map);
      }
    } catch {}
  }, []);

  useEffect(() => { fetchData(); fetchEpg(); }, [fetchData, fetchEpg]);
  useEffect(() => {
    const interval = setInterval(fetchEpg, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchEpg]);

  // Auto-open player when route has channelId
  useEffect(() => {
    if (channelId && channels.length > 0) {
      const ch = channels.find(c => c.id === channelId);
      if (ch) openPlayer(ch);
    }
  }, [channelId, channels]);

  // Cleanup HLS on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  // Attach HLS when streamUrl changes
  useEffect(() => {
    if (!streamUrl || streamType === "iframe") return;

    const video = videoRef.current;
    if (!video) return;

    // Cleanup previous
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (streamType === "m3u8") {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: false,
          lowLatencyMode: true,
          backBufferLength: 30,
          maxBufferLength: 15,
          maxMaxBufferLength: 30,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 6,
        });
        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            console.error("[tv-player] HLS fatal error:", data.type);
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              // Try to recover
              hls.startLoad();
            } else {
              setPlayerError("Erro ao carregar stream. Tentando via iframe...");
              fallbackToIframe();
            }
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // iOS native HLS
        video.src = streamUrl;
        video.play().catch(() => {});
      } else {
        setPlayerError("HLS não suportado neste navegador");
      }
    } else if (streamType === "mp4") {
      video.src = streamUrl;
      video.play().catch(() => {});
    }
  }, [streamUrl, streamType]);

  const fallbackToIframe = useCallback(async () => {
    if (!playerChannel) return;
    setStreamType("iframe");
    setStreamUrl(null);
    setPlayerError(null);

    try {
      const { data, error } = await supabase.functions.invoke("proxy-tv", {
        body: { url: playerChannel.stream_url },
      });
      if (!error && data?.html) {
        setIframeHtml(data.html);
      } else {
        setIframeHtml(null);
      }
    } catch {
      setIframeHtml(null);
    }
  }, [playerChannel]);

  const openPlayer = useCallback(async (channel: TVChannel) => {
    setPlayerChannel(channel);
    setPlayerLoading(true);
    setPlayerError(null);
    setStreamUrl(null);
    setIframeHtml(null);

    try {
      // Try to extract clean m3u8 stream
      const { data, error } = await supabase.functions.invoke("extract-tv", {
        body: { channel_id: channel.id },
      });

      if (!error && data?.url && data.type !== "iframe") {
        console.log(`[tv] Got ${data.type} stream: ${data.url.substring(0, 60)}...`);
        setStreamUrl(data.url);
        setStreamType(data.type as "m3u8" | "mp4");
      } else {
        // Fallback to proxy iframe
        console.log("[tv] No direct stream, falling back to proxy iframe");
        const proxyResp = await supabase.functions.invoke("proxy-tv", {
          body: { url: channel.stream_url },
        });
        if (proxyResp.data?.html) {
          setIframeHtml(proxyResp.data.html);
          setStreamType("iframe");
        } else {
          setStreamType("iframe");
          setIframeHtml(null);
        }
      }
    } catch (err) {
      console.error("[tv] Error extracting stream:", err);
      setStreamType("iframe");
      setIframeHtml(null);
    }

    setPlayerLoading(false);
  }, []);

  const closePlayer = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    setPlayerChannel(null);
    setStreamUrl(null);
    setIframeHtml(null);
    setPlayerError(null);
    navigate("/lynetv", { replace: true });
  }, [navigate]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = !video.muted;
      setIsMuted(video.muted);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = document.getElementById("tv-player-container");
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen?.();
    }
  }, []);

  const filtered = channels.filter((ch) => {
    const matchCat = activeCategory === 0 || ch.categories?.includes(activeCategory);
    const matchSearch = !search || ch.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleWatch = (channel: TVChannel) => {
    navigate(`/tv/${channel.id}`);
  };

  // ===== PLAYER VIEW =====
  if (playerChannel) {
    return (
      <div id="tv-player-container" className="fixed inset-0 z-[100] bg-black flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-black/80 backdrop-blur-sm z-10 safe-top">
          <button onClick={closePlayer} className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-white truncate">{playerChannel.name}</h2>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
              </span>
              <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">AO VIVO</span>
              {streamType !== "iframe" && (
                <span className="text-[10px] text-emerald-400 font-medium ml-2">● HLS Nativo</span>
              )}
            </div>
          </div>
          {streamType !== "iframe" && (
            <div className="flex items-center gap-2">
              <button onClick={toggleMute} className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                {isMuted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
              </button>
              <button onClick={toggleFullscreen} className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                <Maximize className="w-4 h-4 text-white" />
              </button>
            </div>
          )}
        </div>

        {/* Player */}
        <div className="flex-1 relative bg-black">
          {playerLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <span className="text-xs text-white/60">Extraindo stream...</span>
            </div>
          ) : playerError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <span className="text-sm text-red-400">{playerError}</span>
            </div>
          ) : streamType !== "iframe" ? (
            <video
              ref={videoRef}
              className="w-full h-full bg-black"
              autoPlay
              playsInline
              muted={isMuted}
              controls={false}
              onClick={(e) => {
                const v = e.currentTarget;
                v.paused ? v.play() : v.pause();
              }}
            />
          ) : iframeHtml ? (
            <iframe
              srcDoc={iframeHtml}
              className="w-full h-full border-0"
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              title={playerChannel.name}
            />
          ) : (
            <iframe
              src={playerChannel.stream_url}
              className="w-full h-full border-0"
              allow="autoplay; encrypted-media; fullscreen"
              title={playerChannel.name}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-20 sm:pt-24 lg:pt-28 px-3 sm:px-6 lg:px-12 pb-20">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6 sm:mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Tv2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold flex items-center gap-2">
                TV <span className="text-gradient">LYNE</span>
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
              </h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground">{filtered.length} canais disponíveis</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar canal..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 sm:h-10 pl-9 pr-3 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-6 sm:mb-8 pb-1 -mx-3 px-3 sm:mx-0 sm:px-0">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex-shrink-0 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-sm font-medium transition-all duration-300 ${
                activeCategory === cat.id
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Channels Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Tv2 className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-sm">Nenhum canal encontrado</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3 lg:gap-4">
            {filtered.map((channel) => {
              const epg = epgMap[channel.id];
              return (
                <button
                  key={channel.id}
                  onClick={() => handleWatch(channel)}
                  className="group relative glass glass-hover rounded-xl sm:rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.03] hover:shadow-xl hover:shadow-primary/10 text-left"
                >
                  {/* Live indicator */}
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-red-500/90 backdrop-blur-sm">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                    </span>
                    <span className="text-[8px] sm:text-[9px] font-bold text-white uppercase tracking-wider">AO VIVO</span>
                  </div>

                  {/* Channel image */}
                  <div className="aspect-video flex items-center justify-center p-3 sm:p-4 lg:p-6 bg-gradient-to-br from-white/[0.03] to-transparent">
                    {channel.image_url ? (
                      <img
                        src={channel.image_url}
                        alt={channel.name}
                        className="w-full h-full object-contain max-h-12 sm:max-h-16 lg:max-h-20 transition-transform duration-300 group-hover:scale-110"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                        }}
                      />
                    ) : null}
                    <div className={`${channel.image_url ? "hidden" : ""} flex items-center justify-center`}>
                      <Radio className="w-6 h-6 sm:w-8 sm:h-8 text-muted-foreground/50" />
                    </div>
                  </div>

                  {/* Channel info + EPG */}
                  <div className="px-2.5 sm:px-3 pb-2.5 sm:pb-3 pt-1">
                    <h3 className="text-[11px] sm:text-xs lg:text-sm font-semibold line-clamp-1 text-foreground group-hover:text-primary transition-colors">
                      {channel.name}
                    </h3>
                    {epg ? (
                      <p className="text-[9px] sm:text-[10px] text-primary/70 mt-0.5 line-clamp-1 font-medium">
                        {epg.title}
                      </p>
                    ) : (
                      <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">{channel.category}</p>
                    )}
                  </div>

                  {/* Hover play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-background/40 backdrop-blur-sm">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/90 flex items-center justify-center shadow-lg shadow-primary/30">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </button>
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
