import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MobileBottomNav from "@/components/MobileBottomNav";
import { supabase } from "@/integrations/supabase/client";
import { Search, Tv2, Loader2, ChevronRight, Play, Copy, Check, Download, ExternalLink } from "lucide-react";

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

/** XOR obfuscation for stream URL (client-side only) */
function obfuscateUrl(url: string): string {
  const key = 0x5A;
  return btoa(url.split("").map(c => String.fromCharCode(c.charCodeAt(0) ^ key)).join(""));
}
function deobfuscateUrl(encoded: string): string {
  const key = 0x5A;
  try {
    return atob(encoded).split("").map(c => String.fromCharCode(c.charCodeAt(0) ^ key)).join("");
  } catch { return ""; }
}

const TVDownloadPage = () => {
  const [channels, setChannels] = useState<TVChannel[]>([]);
  const [categories, setCategories] = useState<TVCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Selected channel + resolved URL
  const [selectedChannel, setSelectedChannel] = useState<TVChannel | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [copied, setCopied] = useState(false);

  const channelStreamMap = useRef<Map<string, string>>(new Map());

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [chRes, catRes] = await Promise.all([
      supabase.from("tv_channels").select("id,name,image_url,stream_url,category,categories,active").order("sort_order").limit(2000),
      supabase.from("tv_categories").select("*").order("sort_order"),
    ]);
    const rawChannels = (chRes.data as TVChannel[]) || [];
    const map = new Map<string, string>();
    const cleanChannels = rawChannels.map(ch => {
      const cleanUrl = ch.stream_url.replace(/\/live\//gi, "/");
      map.set(ch.id, obfuscateUrl(cleanUrl));
      return { ...ch, stream_url: "protected" };
    });
    channelStreamMap.current = map;
    setChannels(cleanChannels);
    setCategories((catRes.data as TVCategory[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getRealStreamUrl = useCallback((channelId: string): string => {
    const obf = channelStreamMap.current.get(channelId);
    if (!obf) return "";
    return deobfuscateUrl(obf);
  }, []);

  const resolveStreamUrl = useCallback(async (channel: TVChannel): Promise<string | null> => {
    const streamUrl = getRealStreamUrl(channel.id);
    if (!streamUrl) return null;

    const isDirectStream = /\.(m3u8|mp4|ts)(\?|$)/i.test(streamUrl);
    if (isDirectStream) return streamUrl;

    try {
      const { data, error } = await supabase.functions.invoke("extract-tv", {
        body: { embed_url: streamUrl },
      });
      if (error || !data?.url) return streamUrl; // fallback to raw
      let cleanUrl = data.url.replace(/\\\//g, "/").replace(/\/live\//gi, "/");
      if (!cleanUrl.startsWith("http")) {
        try {
          const embedOrigin = new URL(streamUrl).origin;
          cleanUrl = cleanUrl.startsWith("/") ? embedOrigin + cleanUrl : embedOrigin + "/" + cleanUrl;
        } catch { /* ignore */ }
      }
      return cleanUrl;
    } catch {
      return streamUrl;
    }
  }, [getRealStreamUrl]);

  const handleSelectChannel = useCallback(async (channel: TVChannel) => {
    setSelectedChannel(channel);
    setResolvedUrl(null);
    setCopied(false);
    setResolving(true);
    window.scrollTo({ top: 0, behavior: "smooth" });

    const url = await resolveStreamUrl(channel);
    setResolvedUrl(url);
    setResolving(false);
  }, [resolveStreamUrl]);

  const handleCopy = useCallback(() => {
    if (!resolvedUrl) return;
    navigator.clipboard.writeText(resolvedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [resolvedUrl]);

  const handleOpenExternal = useCallback(() => {
    if (!resolvedUrl) return;
    window.open(resolvedUrl, "_blank");
  }, [resolvedUrl]);

  // Filter channels
  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();
    if (activeCategory === 0) {
      return channels.filter(ch => !search || ch.name.toLowerCase().includes(searchLower));
    }
    const selectedCatName = categories.find(c => c.id === activeCategory)?.name?.toLowerCase();
    return channels.filter((ch) => {
      const matchCat = ch.categories?.includes(activeCategory) ||
        (selectedCatName && ch.category?.toLowerCase() === selectedCatName);
      const matchSearch = !search || ch.name.toLowerCase().includes(searchLower);
      return matchCat && matchSearch;
    });
  }, [channels, activeCategory, search, categories]);

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

  const channelInitials = (name: string) => {
    return name.split(" ").slice(0, 2).map(w => w?.[0] || "").join("").toUpperCase();
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-16 sm:pt-20 lg:pt-24 pb-24 sm:pb-12">
        {/* ===== HEADER ===== */}
        <div className="mx-auto px-4 sm:px-6 mb-4">
          <div className="flex flex-col items-center text-center gap-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-red-500/20 to-primary/20 flex items-center justify-center border border-white/5">
                <Download className="w-5 h-5 text-primary" />
              </div>
              <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-2">
                TV <span className="text-gradient">LYNE</span> — Source
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {channels.length} canais — clique para obter a URL do stream
            </p>
          </div>
        </div>

        {/* ===== SELECTED CHANNEL SOURCE ===== */}
        {selectedChannel && (
          <div className="mx-auto px-4 sm:px-6 mb-6 max-w-5xl">
            <div className="relative w-full rounded-2xl overflow-hidden bg-black/40 border border-white/10 p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-4">
                {selectedChannel.image_url ? (
                  <img src={selectedChannel.image_url} alt="" className="w-10 h-10 object-contain opacity-80" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">{channelInitials(selectedChannel.name)}</span>
                  </div>
                )}
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-foreground">{selectedChannel.name}</h3>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">{selectedChannel.category}</p>
                </div>
              </div>

              {resolving ? (
                <div className="flex items-center gap-2 py-4 justify-center">
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  <span className="text-xs text-muted-foreground">Resolvendo URL do stream...</span>
                </div>
              ) : resolvedUrl ? (
                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={resolvedUrl}
                      className="w-full h-10 px-3 pr-20 rounded-xl bg-white/5 border border-white/10 text-xs text-foreground font-mono focus:outline-none select-all"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <div className="absolute right-1 top-1 flex gap-1">
                      <button
                        onClick={handleCopy}
                        className="h-8 px-3 rounded-lg bg-primary/90 text-primary-foreground text-xs font-medium hover:bg-primary transition-all flex items-center gap-1.5"
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? "Copiado!" : "Copiar"}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleOpenExternal}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-muted-foreground hover:bg-white/10 hover:text-foreground transition-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Abrir no navegador
                    </button>
                    <a
                      href={resolvedUrl}
                      download
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-muted-foreground hover:bg-white/10 hover:text-foreground transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download direto
                    </a>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-destructive">Não foi possível resolver a URL deste canal.</p>
              )}
            </div>
          </div>
        )}

        {/* ===== SEARCH + CATEGORIES ===== */}
        <div className="mx-auto px-4 sm:px-6 mb-5 max-w-5xl">
          <div className="flex justify-center mb-3">
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
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}>
            <button
              onClick={() => setActiveCategory(0)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
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
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
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

        {/* ===== CHANNEL LIST ===== */}
        <div className="mx-auto px-4 sm:px-6">
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                    {catChannels.map((channel) => {
                      const isSelected = selectedChannel?.id === channel.id;
                      const imgUrl = channel.image_url && channel.image_url.trim() !== "" ? channel.image_url : null;
                      return (
                        <button
                          key={channel.id}
                          onClick={() => handleSelectChannel(channel)}
                          className={`group relative glass rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.03] hover:shadow-xl text-left border ${
                            isSelected
                              ? "ring-2 ring-primary border-primary/40 shadow-lg shadow-primary/10"
                              : "border-white/5 hover:border-primary/20"
                          }`}
                        >
                          <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/90">
                            <span className="inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                            <span className="text-[7px] font-bold text-white uppercase tracking-wider">LIVE</span>
                          </div>

                          {isSelected && (
                            <div className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded-full bg-primary/90 backdrop-blur-sm">
                              <span className="text-[7px] font-bold text-primary-foreground uppercase tracking-wider">● SEL</span>
                            </div>
                          )}

                          <div className="aspect-video flex items-center justify-center p-4 sm:p-5 bg-gradient-to-br from-white/[0.03] to-transparent">
                            {imgUrl ? (
                              <img
                                src={imgUrl}
                                alt={channel.name}
                                className="w-full h-full object-contain max-h-16 sm:max-h-20 transition-transform duration-200 group-hover:scale-110"
                                loading="lazy"
                                decoding="async"
                                onError={(e) => {
                                  const img = e.target as HTMLImageElement;
                                  img.style.display = "none";
                                  const parent = img.parentElement;
                                  if (parent) {
                                    const fb = parent.querySelector("[data-fallback]") as HTMLElement;
                                    if (fb) fb.style.display = "flex";
                                  }
                                }}
                              />
                            ) : null}
                            <div
                              data-fallback
                              className="items-center justify-center"
                              style={{ display: imgUrl ? "none" : "flex" }}
                            >
                              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                                <span className="text-sm sm:text-base font-bold text-primary">{channelInitials(channel.name)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="px-2.5 sm:px-3 pb-3 pt-1">
                            <h3 className="text-xs sm:text-sm font-semibold line-clamp-1 text-foreground group-hover:text-primary transition-colors">
                              {channel.name}
                            </h3>
                            <div className="flex items-center justify-between mt-1">
                              <p className="text-[9px] sm:text-[10px] text-muted-foreground/60">{channel.category}</p>
                              <Play className="w-3.5 h-3.5 text-primary/60 group-hover:text-primary transition-colors" />
                            </div>
                          </div>

                          <div className="absolute inset-0 bg-gradient-to-t from-primary/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
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

export default TVDownloadPage;
