import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Radio, Search, Tv2, ArrowLeft, Volume2, VolumeX, Maximize, Minimize, Loader2 } from "lucide-react";
import AdGateModal from "@/components/AdGateModal";

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

// Default BBB channel to auto-play on entry
const DEFAULT_CHANNEL_ID = "bbb1";

const TVPage = () => {
  const { channelId } = useParams<{ channelId?: string }>();
  const [channels, setChannels] = useState<TVChannel[]>([]);
  const [categories, setCategories] = useState<TVCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Player state
  const [playerChannel, setPlayerChannel] = useState<TVChannel | null>(null);
  const [iframeHtml, setIframeHtml] = useState<string | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  // Ad gate state
  const [showAdGate, setShowAdGate] = useState(false);
  const [adGateCompleted, setAdGateCompleted] = useState(false);
  const [pendingChannel, setPendingChannel] = useState<TVChannel | null>(null);

  // Check if ad gate was already completed this session
  useEffect(() => {
    const completed = sessionStorage.getItem("ad_completed_lynetv_0");
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

  // Auto-open player when route has channelId or default
  useEffect(() => {
    if (channels.length === 0) return;
    const targetId = channelId || DEFAULT_CHANNEL_ID;
    const ch = channels.find(c => c.id === targetId);
    if (ch && !playerChannel) {
      if (adGateCompleted) {
        openPlayer(ch);
      } else {
        setPendingChannel(ch);
        setShowAdGate(true);
      }
    }
  }, [channelId, channels, adGateCompleted]);

  // Fullscreen change listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const openPlayer = useCallback(async (channel: TVChannel) => {
    setPlayerChannel(channel);
    setPlayerLoading(true);
    setIframeHtml(null);

    try {
      const { data } = await supabase.functions.invoke("proxy-tv", {
        body: { url: channel.stream_url },
      });
      if (data?.html) {
        setIframeHtml(data.html);
      }
    } catch {}

    setPlayerLoading(false);
  }, []);

  const handleAdContinue = useCallback(() => {
    setShowAdGate(false);
    setAdGateCompleted(true);
    if (pendingChannel) {
      openPlayer(pendingChannel);
      setPendingChannel(null);
    }
  }, [pendingChannel, openPlayer]);

  const handleWatch = useCallback((channel: TVChannel) => {
    if (!adGateCompleted) {
      setPendingChannel(channel);
      setShowAdGate(true);
      return;
    }
    navigate(`/tv/${channel.id}`, { replace: true });
    openPlayer(channel);
  }, [adGateCompleted, navigate, openPlayer]);

  const toggleFullscreen = useCallback(() => {
    const el = playerContainerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen?.();
    }
  }, []);

  // Filter channels
  const filtered = channels.filter((ch) => {
    const matchCat = activeCategory === 0 || ch.categories?.includes(activeCategory);
    const matchSearch = !search || ch.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  // Group filtered channels by category name
  const grouped = filtered.reduce<Record<string, TVChannel[]>>((acc, ch) => {
    const cat = ch.category || "Outros";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ch);
    return acc;
  }, {});

  // Sort category groups by the category order from DB
  const catOrder = categories.reduce<Record<string, number>>((m, c) => { m[c.name] = c.sort_order; return m; }, {});
  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => (catOrder[a] ?? 999) - (catOrder[b] ?? 999));

  // Get BBB cameras for the quick-switch bar
  const bbbChannels = channels.filter(c => c.categories?.includes(8) || c.category === "BBB 2026");

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Ad Gate Modal */}
      {showAdGate && (
        <AdGateModal
          onContinue={handleAdContinue}
          onClose={() => setShowAdGate(false)}
          contentTitle="LyneTV"
          tmdbId={0}
          contentType="tv"
        />
      )}

      <div className="pt-20 sm:pt-24 lg:pt-28 px-0 sm:px-6 lg:px-12 pb-20">
        {/* ===== FEATURED PLAYER (top) ===== */}
        {playerChannel && (
          <div className="mb-6 sm:mb-8">
            <div
              ref={playerContainerRef}
              className="relative w-full aspect-video bg-black rounded-none sm:rounded-2xl overflow-hidden"
            >
              {playerLoading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
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

              {/* Overlay controls */}
              <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 sm:px-5 py-3 bg-gradient-to-b from-black/70 to-transparent pointer-events-none z-10">
                <div className="flex items-center gap-2 pointer-events-auto">
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                    <span className="text-[10px] sm:text-xs text-red-400 font-bold uppercase tracking-wider">AO VIVO</span>
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-white ml-2">{playerChannel.name}</span>
                </div>
                <button
                  onClick={toggleFullscreen}
                  className="pointer-events-auto w-8 h-8 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors"
                >
                  {isFullscreen ? <Minimize className="w-4 h-4 text-white" /> : <Maximize className="w-4 h-4 text-white" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== BBB CAMERAS BAR ===== */}
        {bbbChannels.length > 0 && (
          <div className="px-3 sm:px-0 mb-6 sm:mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-primary text-sm">📺</span>
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-primary">Câmeras BBB 24H</h2>
            </div>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {bbbChannels.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => handleWatch(ch)}
                  className={`flex-shrink-0 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-xs font-medium border transition-all ${
                    playerChannel?.id === ch.id
                      ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25"
                      : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                  }`}
                >
                  {ch.name.replace(/^BBB\s*-?\s*/i, "").replace(/^bbb\s*/i, "")}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ===== HEADER ===== */}
        <div className="px-3 sm:px-0">
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
                <p className="text-[10px] sm:text-xs text-muted-foreground">Assista seus canais favoritos online</p>
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
          <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-6 sm:mb-8 pb-1">
            <button
              onClick={() => setActiveCategory(0)}
              className={`flex-shrink-0 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-sm font-medium transition-all duration-300 ${
                activeCategory === 0
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              }`}
            >
              Todos
            </button>
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
        </div>

        {/* ===== CHANNELS BY CATEGORY ===== */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground px-3">
            <Tv2 className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-sm">Nenhum canal encontrado</p>
          </div>
        ) : (
          <div className="space-y-8 px-3 sm:px-0">
            {sortedGroups.map(([catName, catChannels]) => (
              <div key={catName}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-5 rounded-full bg-primary" />
                  <h2 className="text-sm sm:text-base font-bold">{catName}</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3 lg:gap-4">
                  {catChannels.map((channel) => (
                    <button
                      key={channel.id}
                      onClick={() => handleWatch(channel)}
                      className={`group relative glass glass-hover rounded-xl sm:rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.03] hover:shadow-xl hover:shadow-primary/10 text-left ${
                        playerChannel?.id === channel.id ? "ring-2 ring-primary" : ""
                      }`}
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

                      {/* Channel info */}
                      <div className="px-2.5 sm:px-3 pb-2.5 sm:pb-3 pt-1">
                        <h3 className="text-[11px] sm:text-xs lg:text-sm font-semibold line-clamp-1 text-foreground group-hover:text-primary transition-colors">
                          {channel.name}
                        </h3>
                        <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">{channel.category}</p>
                      </div>

                      {/* Hover play button */}
                      <div className="absolute bottom-12 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] sm:text-xs font-bold uppercase tracking-wide">
                          Assistir
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default TVPage;
