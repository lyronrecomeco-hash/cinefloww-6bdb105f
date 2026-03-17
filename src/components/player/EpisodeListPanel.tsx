import { useState, useEffect, memo } from "react";
import { X, Play, Check, Loader2 } from "lucide-react";
import { getSeasonDetails, posterUrl, TMDBEpisode } from "@/services/tmdb";
import { getEpisodeProgress } from "@/lib/watchProgress";

interface EpisodeListPanelProps {
  tmdbId: number;
  currentSeason: number;
  currentEpisode: number;
  title: string;
  audioParam: string;
  imdbId: string | null;
  onNavigate: (season: number, episode: number) => void;
  onClose: () => void;
}

const EpisodeListPanel = memo(({
  tmdbId,
  currentSeason,
  currentEpisode,
  title,
  audioParam,
  imdbId,
  onNavigate,
  onClose,
}: EpisodeListPanelProps) => {
  const [episodes, setEpisodes] = useState<TMDBEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [progressMap, setProgressMap] = useState<Map<string, { progress: number; duration: number; completed: boolean }>>(new Map());

  useEffect(() => {
    setLoading(true);
    getSeasonDetails(tmdbId, currentSeason)
      .then((data) => setEpisodes(data.episodes || []))
      .catch(() => setEpisodes([]))
      .finally(() => setLoading(false));
  }, [tmdbId, currentSeason]);

  useEffect(() => {
    Promise.all([
      getEpisodeProgress(tmdbId, "tv"),
      getEpisodeProgress(tmdbId, "series"),
    ]).then(([tvMap, seriesMap]) => {
      const merged = new Map(tvMap);
      seriesMap.forEach((v, k) => {
        const existing = merged.get(k);
        if (!existing || v.progress > existing.progress) merged.set(k, v);
      });
      setProgressMap(merged);
    });
  }, [tmdbId]);

  return (
    <div className="absolute top-0 right-0 bottom-0 w-[320px] sm:w-[360px] z-[70] flex flex-col animate-in slide-in-from-right duration-300"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Backdrop blur */}
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl rounded-l-2xl border-l border-white/10" />

      {/* Content */}
      <div className="relative flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="min-w-0">
            <p className="text-xs text-white/40 font-medium uppercase tracking-wider">Temporada {currentSeason}</p>
            <p className="text-sm font-semibold text-white truncate">{title}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Episodes list */}
        <div className="flex-1 overflow-y-auto scrollbar-hide p-2 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          ) : episodes.length === 0 ? (
            <p className="text-xs text-white/30 text-center py-8">Nenhum episódio encontrado</p>
          ) : (
            episodes.map((ep) => {
              const isCurrent = ep.episode_number === currentEpisode;
              const key = `${ep.season_number}-${ep.episode_number}`;
              const prog = progressMap.get(key);
              const progressPct = prog && prog.duration > 0
                ? Math.min(100, (prog.progress / prog.duration) * 100)
                : 0;
              const isWatched = prog?.completed;

              return (
                <button
                  key={ep.id}
                  onClick={() => {
                    if (!isCurrent) onNavigate(ep.season_number, ep.episode_number);
                  }}
                  disabled={isCurrent}
                  className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-all group ${
                    isCurrent
                      ? "bg-primary/15 border border-primary/30 opacity-60 cursor-default"
                      : isWatched
                      ? "opacity-40 hover:opacity-70 hover:bg-white/5 cursor-pointer"
                      : "hover:bg-white/5 cursor-pointer"
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="flex-shrink-0 w-24 aspect-video rounded-lg overflow-hidden bg-white/5 relative">
                    {ep.still_path ? (
                      <img
                        src={posterUrl(ep.still_path, "w185")}
                        alt={ep.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/20 text-[9px]">
                        Sem img
                      </div>
                    )}

                    {/* Play overlay */}
                    {!isCurrent && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                        <Play className="w-5 h-5 fill-white text-white" />
                      </div>
                    )}

                    {/* Current playing indicator */}
                    {isCurrent && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <div className="flex items-center gap-0.5">
                          <div className="w-0.5 h-3 bg-primary rounded-full animate-pulse" />
                          <div className="w-0.5 h-4 bg-primary rounded-full animate-pulse" style={{ animationDelay: "0.15s" }} />
                          <div className="w-0.5 h-2.5 bg-primary rounded-full animate-pulse" style={{ animationDelay: "0.3s" }} />
                        </div>
                      </div>
                    )}

                    {/* Progress bar */}
                    {progressPct > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
                        <div className="h-full bg-primary" style={{ width: `${progressPct}%` }} />
                      </div>
                    )}

                    {/* Watched check */}
                    {isWatched && !isCurrent && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-primary-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-white line-clamp-1">
                      <span className="text-white/40 mr-1">E{ep.episode_number}</span>
                      {ep.name}
                    </p>
                    {ep.overview && (
                      <p className="text-[10px] text-white/30 line-clamp-2 mt-0.5 leading-relaxed">
                        {ep.overview}
                      </p>
                    )}
                    {(ep.runtime ?? 0) > 0 && (
                      <p className="text-[9px] text-white/20 mt-0.5">{ep.runtime}min</p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
});

EpisodeListPanel.displayName = "EpisodeListPanel";

export default EpisodeListPanel;
