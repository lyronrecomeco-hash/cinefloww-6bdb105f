import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Radio, Search, Tv2, Maximize, Minimize, Loader2, Signal, ChevronRight } from "lucide-react";
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

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const openPlayer = useCallback((channel: TVChannel) => {
    const streamUrl = channel.stream_url.replace(/\/live\//gi, "/");
    navigate(`/player?url=${encodeURIComponent(streamUrl)}&title=${encodeURIComponent(channel.name)}&type=m3u8`);
  }, [navigate]);

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
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }, []);

  // Filter channels
  const filtered = channels.filter((ch) => {
    const matchCat = activeCategory === 0 || ch.categories?.includes(activeCategory);
    const matchSearch = !search || ch.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  // Group by category
  const grouped = filtered.reduce<Record<string, TVChannel[]>>((acc, ch) => {
    const cat = ch.category || "Outros";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ch);
    return acc;
  }, {});

  const catOrder = categories.reduce<Record<string, number>>((m, c) => { m[c.name] = c.sort_order; return m; }, {});
  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => (catOrder[a] ?? 999) - (catOrder[b] ?? 999));

  const bbbChannels = channels.filter(c => c.categories?.includes(8) || c.category === "BBB 2026");

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

      <div className="pt-20 sm:pt-24 lg:pt-28 px-0 sm:px-6 lg:px-12 pb-20">
        {/* ===== FEATURED PLAYER ===== */}
        {playerChannel && (
          <div className="mb-6 sm:mb-8">
            <div
              ref={playerContainerRef}
              className="relative w-full aspect-video bg-black rounded-none sm:rounded-2xl overflow-hidden shadow-2xl shadow-black/50"
            >
              {playerLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  <p className="text-xs text-muted-foreground animate-pulse">Carregando stream...</p>
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

              {/* Overlay */}
              <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 sm:px-6 py-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none z-10">
                <div className="flex items-center gap-3 pointer-events-auto">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/90 backdrop-blur-sm">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                    </span>
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">AO VIVO</span>
                  </div>
                  <span className="text-sm font-semibold text-white drop-shadow-lg">{playerChannel.name}</span>
                </div>
                <button
                  onClick={toggleFullscreen}
                  className="pointer-events-auto w-9 h-9 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all border border-white/10"
                >
                  {isFullscreen ? <Minimize className="w-4 h-4 text-white" /> : <Maximize className="w-4 h-4 text-white" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== BBB CAMERAS ===== */}
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
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 sm:mb-8">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-red-500/20 to-primary/20 flex items-center justify-center border border-white/5">
                <Tv2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold flex items-center gap-2">
                  TV <span className="text-gradient">LYNE</span>
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                  </span>
                </h1>
                <p className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1.5">
                  <Signal className="w-3 h-3" />
                  {channels.length} canais ao vivo
                </p>
              </div>
            </div>

            <div className="relative w-full sm:w-72">
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
          <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-6 sm:mb-8 pb-1">
            <button
              onClick={() => setActiveCategory(0)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
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
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                  activeCategory === cat.id
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                    : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* ===== CHANNELS GRID ===== */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground px-3">
            <Tv2 className="w-14 h-14 mb-4 opacity-20" />
            <p className="text-sm font-medium">Nenhum canal encontrado</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Tente outro termo de busca</p>
          </div>
        ) : (
          <div className="space-y-8 sm:space-y-10 px-3 sm:px-0">
            {sortedGroups.map(([catName, catChannels]) => (
              <div key={catName}>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-1 h-6 rounded-full bg-gradient-to-b from-primary to-primary/40" />
                  <h2 className="text-sm sm:text-base font-bold tracking-tight">{catName}</h2>
                  <span className="text-[10px] text-muted-foreground/50 ml-1">({catChannels.length})</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 ml-auto" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                  {catChannels.map((channel) => (
                    <button
                      key={channel.id}
                      onClick={() => handleWatch(channel)}
                      className={`group relative glass rounded-xl sm:rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.04] hover:shadow-2xl hover:shadow-primary/10 text-left border border-white/5 hover:border-primary/20 ${
                        playerChannel?.id === channel.id ? "ring-2 ring-primary border-primary/30" : ""
                      }`}
                    >
                      {/* Live badge */}
                      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/90 backdrop-blur-sm">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                        </span>
                        <span className="text-[7px] sm:text-[8px] font-bold text-white uppercase tracking-wider">LIVE</span>
                      </div>

                      {/* Now playing indicator */}
                      {playerChannel?.id === channel.id && (
                        <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded-full bg-primary/90 backdrop-blur-sm">
                          <span className="text-[7px] font-bold text-primary-foreground uppercase tracking-wider">▶ NOW</span>
                        </div>
                      )}

                      {/* Channel image */}
                      <div className="aspect-video flex items-center justify-center p-4 sm:p-5 bg-gradient-to-br from-white/[0.03] to-transparent">
                        {channel.image_url ? (
                          <img
                            src={channel.image_url}
                            alt={channel.name}
                            className="w-full h-full object-contain max-h-14 sm:max-h-16 lg:max-h-20 transition-transform duration-300 group-hover:scale-110"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                              (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                            }}
                          />
                        ) : null}
                        <div className={`${channel.image_url ? "hidden" : ""} flex items-center justify-center`}>
                          <Radio className="w-7 h-7 sm:w-8 sm:h-8 text-muted-foreground/40" />
                        </div>
                      </div>

                      {/* Channel info */}
                      <div className="px-2.5 sm:px-3 pb-3 pt-1">
                        <h3 className="text-[11px] sm:text-xs font-semibold line-clamp-1 text-foreground group-hover:text-primary transition-colors">
                          {channel.name}
                        </h3>
                        <p className="text-[9px] sm:text-[10px] text-muted-foreground/60 mt-0.5">{channel.category}</p>
                      </div>

                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                      <div className="absolute bottom-10 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                        <div className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] sm:text-xs font-bold uppercase tracking-wide shadow-lg shadow-primary/30">
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
