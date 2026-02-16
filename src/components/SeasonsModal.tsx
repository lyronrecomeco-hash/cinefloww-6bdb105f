import { useState, useEffect } from "react";
import { X, Clock, Star, ChevronDown, Play } from "lucide-react";
import { TMDBSeason, TMDBEpisode, getSeasonDetails, posterUrl } from "@/services/tmdb";
import PlayerModal from "@/components/PlayerModal";

interface SeasonsModalProps {
  seriesId: number;
  seriesTitle: string;
  seasons: { season_number: number; name: string; episode_count: number; poster_path: string | null; air_date: string | null }[];
  imdbId?: string | null;
  onClose: () => void;
}

const SeasonsModal = ({ seriesId, seriesTitle, seasons, imdbId, onClose }: SeasonsModalProps) => {
  const validSeasons = seasons.filter((s) => s.season_number > 0);
  const [selectedSeason, setSelectedSeason] = useState(validSeasons[0]?.season_number ?? 1);
  const [seasonData, setSeasonData] = useState<TMDBSeason | null>(null);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [playEpisode, setPlayEpisode] = useState<{ season: number; episode: number } | null>(null);

  useEffect(() => {
    setLoading(true);
    getSeasonDetails(seriesId, selectedSeason).then((data) => {
      setSeasonData(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [seriesId, selectedSeason]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-background/80 backdrop-blur-xl" />
        <div
          className="relative w-full max-w-4xl max-h-[85vh] glass-strong overflow-hidden animate-scale-in flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 sm:p-6 border-b border-white/10">
            <h2 className="font-display text-xl sm:text-2xl font-bold">Temporadas & Episódios</h2>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Season Selector */}
          <div className="px-5 sm:px-6 py-4 border-b border-white/5">
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors w-full sm:w-auto sm:min-w-[240px]"
              >
                <span className="font-medium text-sm">
                  Temporada {selectedSeason} — {validSeasons.find(s => s.season_number === selectedSeason)?.episode_count} eps
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute top-full mt-2 left-0 w-full sm:w-[280px] glass-strong z-10 p-2 max-h-60 overflow-y-auto scrollbar-hide">
                  {validSeasons.map((season) => (
                    <button
                      key={season.season_number}
                      onClick={() => { setSelectedSeason(season.season_number); setDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                        selectedSeason === season.season_number
                          ? "bg-primary/20 text-primary"
                          : "hover:bg-white/5 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className="font-medium">{season.name}</span>
                      <span className="text-xs ml-2 opacity-60">{season.episode_count} episódios</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Episodes */}
          <div className="flex-1 overflow-y-auto scrollbar-hide p-5 sm:p-6 space-y-3">
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : seasonData?.episodes.length ? (
              seasonData.episodes.map((ep) => (
                <EpisodeCard
                  key={ep.id}
                  episode={ep}
                  onPlay={() => setPlayEpisode({ season: ep.season_number, episode: ep.episode_number })}
                />
              ))
            ) : (
              <p className="text-muted-foreground text-center py-10">Nenhum episódio encontrado.</p>
            )}
          </div>
        </div>
      </div>

      {playEpisode && (
        <PlayerModal
          tmdbId={seriesId}
          imdbId={imdbId}
          type="tv"
          season={playEpisode.season}
          episode={playEpisode.episode}
          title={seriesTitle}
          onClose={() => setPlayEpisode(null)}
        />
      )}
    </>
  );
};

const EpisodeCard = ({ episode, onPlay }: { episode: TMDBEpisode; onPlay: () => void }) => (
  <div className="flex gap-4 p-3 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all group">
    {/* Thumbnail */}
    <div className="flex-shrink-0 w-28 sm:w-36 aspect-video rounded-xl overflow-hidden bg-muted relative cursor-pointer" onClick={onPlay}>
      {episode.still_path ? (
        <img src={posterUrl(episode.still_path, "w300")} alt={episode.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">Sem imagem</div>
      )}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-background/40">
        <div className="w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center">
          <Play className="w-4 h-4 fill-primary-foreground text-primary-foreground ml-0.5" />
        </div>
      </div>
    </div>

    {/* Info */}
    <div className="flex-1 min-w-0 py-0.5">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h4 className="font-display font-semibold text-sm line-clamp-1">
          <span className="text-muted-foreground mr-1.5">E{episode.episode_number}</span>
          {episode.name}
        </h4>
        {episode.vote_average > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
            <Star className="w-3 h-3 text-primary fill-primary" />
            {episode.vote_average.toFixed(1)}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
        {episode.runtime && (
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{episode.runtime}min</span>
        )}
        {episode.air_date && <span>{new Date(episode.air_date).toLocaleDateString("pt-BR")}</span>}
      </div>
      {episode.overview && (
        <p className="text-muted-foreground text-xs leading-relaxed line-clamp-2">{episode.overview}</p>
      )}
    </div>
  </div>
);

export default SeasonsModal;
