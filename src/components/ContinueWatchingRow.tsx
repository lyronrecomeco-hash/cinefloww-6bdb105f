import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Play, Clock, X, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toSlug } from "@/lib/slugify";

interface WatchItem {
  tmdb_id: number;
  content_type: string;
  season: number | null;
  episode: number | null;
  progress_seconds: number;
  duration_seconds: number;
  title: string;
  poster_path: string | null;
  id: string;
}

function getDeviceId(): string {
  let id = localStorage.getItem("cineflow_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("cineflow_device_id", id);
  }
  return id;
}

const formatTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}min`;
  return `${m}:${String(sec).padStart(2, "0")}`;
};

const ContinueWatchingRow = () => {
  const [items, setItems] = useState<WatchItem[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const load = async () => {
      const deviceId = getDeviceId();
      const { data: progress } = await supabase
        .from("watch_progress")
        .select("id, tmdb_id, content_type, season, episode, progress_seconds, duration_seconds")
        .eq("device_id", deviceId)
        .eq("completed", false)
        .gt("progress_seconds", 30)
        .order("updated_at", { ascending: false })
        .limit(20);

      if (!progress?.length) return;

      const tmdbIds = [...new Set(progress.map(p => p.tmdb_id))];
      const { data: contentData } = await supabase
        .from("content")
        .select("tmdb_id, title, poster_path, content_type")
        .in("tmdb_id", tmdbIds);

      const contentMap = new Map(contentData?.map(c => [c.tmdb_id, c]) || []);

      const seen = new Set<string>();
      const watchItems: WatchItem[] = [];
      for (const p of progress) {
        const key = `${p.tmdb_id}-${p.season ?? 0}-${p.episode ?? 0}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const content = contentMap.get(p.tmdb_id);
        if (!content) continue;

        const pct = p.duration_seconds > 0 ? p.progress_seconds / p.duration_seconds : 0;
        if (pct >= 0.9) continue;

        watchItems.push({
          tmdb_id: p.tmdb_id,
          content_type: p.content_type,
          season: p.season,
          episode: p.episode,
          progress_seconds: Number(p.progress_seconds),
          duration_seconds: Number(p.duration_seconds),
          title: content.title,
          poster_path: content.poster_path,
          id: p.id,
        });
      }

      setItems(watchItems);
    };

    load();
  }, []);

  const removeItem = async (item: WatchItem) => {
    // Mark as completed to hide
    await supabase.from("watch_progress").update({ completed: true }).eq("id", item.id);
    setItems(prev => prev.filter(i => i.id !== item.id));
  };

  if (!items.length) return null;

  return (
    <section className="mb-8 sm:mb-10 lg:mb-14">
      <div className="flex items-center justify-between px-3 sm:px-6 lg:px-12 mb-3 sm:mb-4 lg:mb-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
            <Clock className="w-4 h-4" />
          </div>
          <h2 className="font-display text-base sm:text-xl lg:text-2xl font-bold">Continuar Assistindo</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => scroll("left")}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center bg-white/15 border border-white/25 hover:bg-white/25 hover:border-white/40 hover:scale-105 active:scale-95 transition-all duration-200 text-foreground shadow-lg shadow-black/20"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center bg-white/15 border border-white/25 hover:bg-white/25 hover:border-white/40 hover:scale-105 active:scale-95 transition-all duration-200 text-foreground shadow-lg shadow-black/20"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-2.5 sm:gap-4 overflow-x-auto scrollbar-hide px-3 sm:px-6 lg:px-12 pb-2 snap-x snap-proximity overscroll-x-contain touch-auto"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {items.map((item) => {
          const pct = item.duration_seconds > 0 ? (item.progress_seconds / item.duration_seconds) * 100 : 0;
          const remaining = item.duration_seconds - item.progress_seconds;
          const typeRoute = item.content_type === "movie" ? "movie" : "tv";
          const params = new URLSearchParams({ title: item.title, audio: "legendado" });
          if (item.season) params.set("s", String(item.season));
          if (item.episode) params.set("e", String(item.episode));
          const slug = toSlug(item.title, item.tmdb_id);
          const watchUrl = `/player/${typeRoute === "movie" ? "movie" : "series"}/${slug}?${params.toString()}`;

          return (
            <div
              key={item.id}
              className="flex-shrink-0 w-[140px] sm:w-[160px] lg:w-[180px] group relative snap-start"
            >
              {/* Remove button */}
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeItem(item); }}
                className="absolute -top-1 -right-1 z-10 w-6 h-6 rounded-full bg-background/90 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/80 hover:border-destructive/50"
                title="Remover"
              >
                <X className="w-3 h-3" />
              </button>

              <Link to={watchUrl} className="block">
                <div className="relative rounded-xl sm:rounded-2xl overflow-hidden aspect-[2/3] bg-white/5 card-shine">
                  {item.poster_path ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w342${item.poster_path}`}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Play className="w-8 h-8 text-muted-foreground/30" />
                    </div>
                  )}
                  {/* Play overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/90 flex items-center justify-center shadow-lg shadow-primary/30">
                      <Play className="w-5 h-5 text-primary-foreground fill-current ml-0.5" />
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/10">
                    <div className="h-full bg-primary rounded-r-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  {/* Episode badge */}
                  {item.season && item.episode && (
                    <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-background/70 backdrop-blur-sm text-[9px] sm:text-[10px] font-semibold text-foreground border border-white/10">
                      T{item.season}E{item.episode}
                    </div>
                  )}
                  {/* Time indicator */}
                  <div className="absolute bottom-2.5 left-1.5 right-1.5 flex items-center justify-between">
                    <span className="text-[8px] sm:text-[9px] font-medium text-foreground/80 bg-background/60 backdrop-blur-sm px-1 py-0.5 rounded">
                      {formatTime(item.progress_seconds)}
                    </span>
                    <span className="text-[8px] sm:text-[9px] font-medium text-foreground/80 bg-background/60 backdrop-blur-sm px-1 py-0.5 rounded">
                      {formatTime(item.duration_seconds)}
                    </span>
                  </div>
                </div>
                <h3 className="font-display font-semibold text-xs sm:text-sm leading-tight line-clamp-1 mt-2 group-hover:text-primary transition-colors">
                  {item.title}
                </h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                  {remaining > 0 ? `${formatTime(remaining)} restantes` : ""}
                </p>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default ContinueWatchingRow;
