import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Radio, Search, Tv2 } from "lucide-react";

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
  const [channels, setChannels] = useState<TVChannel[]>([]);
  const [categories, setCategories] = useState<TVCategory[]>([]);
  const [epgMap, setEpgMap] = useState<Record<string, EPGEntry["epg"]>>({});
  const [activeCategory, setActiveCategory] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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

  // Fetch EPG data
  const fetchEpg = useCallback(async () => {
    try {
      const resp = await fetch("https://embedtv.best/api/epgs");
      if (resp.ok) {
        const data: EPGEntry[] = await resp.json();
        const map: Record<string, EPGEntry["epg"]> = {};
        for (const entry of data) {
          map[entry.id] = entry.epg;
        }
        setEpgMap(map);
      }
    } catch {
      // EPG is optional, fail silently
    }
  }, []);

  useEffect(() => { fetchData(); fetchEpg(); }, [fetchData, fetchEpg]);

  // Refresh EPG every 5 minutes
  useEffect(() => {
    const interval = setInterval(fetchEpg, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchEpg]);

  const filtered = channels.filter((ch) => {
    const matchCat = activeCategory === 0 || ch.categories?.includes(activeCategory);
    const matchSearch = !search || ch.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleWatch = (_channel: TVChannel) => {
    // Player temporariamente indisponível
  };

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
                  className="group relative glass glass-hover rounded-xl sm:rounded-2xl overflow-hidden cursor-default transition-all duration-300 text-left opacity-70"
                >
                  {/* Indisponível indicator */}
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-muted/90 backdrop-blur-sm">
                    <span className="text-[8px] sm:text-[9px] font-bold text-muted-foreground uppercase tracking-wider">INDISPONÍVEL</span>
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

                  {/* Indisponível overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-background/40 backdrop-blur-sm">
                    <span className="text-xs text-muted-foreground font-medium">Em breve</span>
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
