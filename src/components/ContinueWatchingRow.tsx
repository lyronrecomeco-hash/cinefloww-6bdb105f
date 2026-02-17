import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Play, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface WatchItem {
  tmdb_id: number;
  content_type: string;
  season: number | null;
  episode: number | null;
  progress_seconds: number;
  duration_seconds: number;
  title: string;
  poster_path: string | null;
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
  if (h > 0) return `${h}h${m}m`;
  return `${m}min`;
};

const ContinueWatchingRow = () => {
  const [items, setItems] = useState<WatchItem[]>([]);

  useEffect(() => {
    const load = async () => {
      const deviceId = getDeviceId();
      const { data: progress } = await supabase
        .from("watch_progress")
        .select("tmdb_id, content_type, season, episode, progress_seconds, duration_seconds")
        .eq("device_id", deviceId)
        .eq("completed", false)
        .gt("progress_seconds", 30)
        .order("updated_at", { ascending: false })
        .limit(20);

      if (!progress?.length) return;

      // Get content info for these tmdb_ids
      const tmdbIds = [...new Set(progress.map(p => p.tmdb_id))];
      const { data: contentData } = await supabase
        .from("content")
        .select("tmdb_id, title, poster_path, content_type")
        .in("tmdb_id", tmdbIds);

      const contentMap = new Map(contentData?.map(c => [c.tmdb_id, c]) || []);

      // Deduplicate - keep latest per tmdb_id (for movies) or per episode (for series)
      const seen = new Set<string>();
      const watchItems: WatchItem[] = [];
      for (const p of progress) {
        const key = `${p.tmdb_id}-${p.season ?? 0}-${p.episode ?? 0}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const content = contentMap.get(p.tmdb_id);
        if (!content) continue;

        const pct = p.duration_seconds > 0 ? p.progress_seconds / p.duration_seconds : 0;
        if (pct >= 0.9) continue; // Skip completed

        watchItems.push({
          tmdb_id: p.tmdb_id,
          content_type: p.content_type,
          season: p.season,
          episode: p.episode,
          progress_seconds: Number(p.progress_seconds),
          duration_seconds: Number(p.duration_seconds),
          title: content.title,
          poster_path: content.poster_path,
        });
      }

      setItems(watchItems);
    };

    load();
  }, []);

  if (!items.length) return null;

  return (
    <div className="px-3 sm:px-6 lg:px-12">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-primary" />
        <h2 className="font-display text-sm sm:text-base font-bold">Continuar Assistindo</h2>
      </div>
      <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {items.map((item, i) => {
          const pct = item.duration_seconds > 0 ? (item.progress_seconds / item.duration_seconds) * 100 : 0;
          const remaining = item.duration_seconds - item.progress_seconds;
          const typeRoute = item.content_type === "movie" ? "movie" : "tv";
          const params = new URLSearchParams({ title: item.title, audio: "legendado" });
          if (item.season) params.set("s", String(item.season));
          if (item.episode) params.set("e", String(item.episode));
          const watchUrl = `/assistir/${typeRoute}/${item.tmdb_id}?${params.toString()}`;

          return (
            <Link
              key={`${item.tmdb_id}-${item.season}-${item.episode}-${i}`}
              to={watchUrl}
              className="flex-shrink-0 w-[140px] sm:w-[160px] group"
            >
              <div className="relative rounded-xl overflow-hidden aspect-[2/3] bg-white/5">
                {item.poster_path ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w342${item.poster_path}`}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Play className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                )}
                {/* Play overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center">
                    <Play className="w-5 h-5 text-primary-foreground fill-current ml-0.5" />
                  </div>
                </div>
                {/* Progress bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                  <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                {/* Episode badge */}
                {item.season && item.episode && (
                  <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-medium text-white">
                    T{item.season}E{item.episode}
                  </div>
                )}
              </div>
              <p className="text-[11px] sm:text-xs font-medium mt-1.5 truncate">{item.title}</p>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground">
                {remaining > 0 ? `${formatTime(remaining)} restantes` : ""}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default ContinueWatchingRow;
