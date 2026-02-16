import { useState, useEffect } from "react";
import { X, Play, MonitorPlay } from "lucide-react";

interface PlayerModalProps {
  tmdbId: number;
  imdbId?: string | null;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  title: string;
  onClose: () => void;
}

const players = [
  { id: "megaembed", name: "MegaEmbed", icon: MonitorPlay },
  { id: "embedmovies", name: "EmbedMovies", icon: Play },
];

function getPlayerUrl(playerId: string, tmdbId: number, imdbId: string | null | undefined, type: "movie" | "tv", season?: number, episode?: number): string {
  if (playerId === "megaembed") {
    if (type === "movie") return `https://megaembed.com/embed/${tmdbId}`;
    return `https://megaembed.com/embed/${tmdbId}/${season ?? 1}/${episode ?? 1}`;
  }
  // embedmovies
  if (type === "movie") {
    const id = imdbId || `${tmdbId}`;
    return `https://playerflixapi.com/filme/${id}`;
  }
  return `https://playerflixapi.com/serie/${tmdbId}/${season ?? 1}/${episode ?? 1}`;
}

const PlayerModal = ({ tmdbId, imdbId, type, season, episode, title, onClose }: PlayerModalProps) => {
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const playerUrl = selectedPlayer
    ? getPlayerUrl(selectedPlayer, tmdbId, imdbId, type, season, episode)
    : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/90 backdrop-blur-xl" />
      <div
        className="relative w-full max-w-5xl max-h-[90vh] glass-strong overflow-hidden animate-scale-in flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10">
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-lg sm:text-xl font-bold truncate">{title}</h2>
            {type === "tv" && season && episode && (
              <p className="text-xs text-muted-foreground mt-0.5">T{season} • E{episode}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors ml-3"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!selectedPlayer ? (
          /* Player Selection */
          <div className="p-6 sm:p-10">
            <p className="text-muted-foreground text-sm text-center mb-6">Escolha o player para assistir</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md mx-auto">
              {players.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlayer(p.id)}
                  className="flex items-center gap-4 p-5 rounded-2xl glass glass-hover group transition-all duration-300 hover:scale-[1.02]"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
                    <p.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-sm">{p.name}</p>
                    <p className="text-xs text-muted-foreground">Player {p.id === "megaembed" ? "principal" : "alternativo"}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Player iframe */
          <div className="flex-1 flex flex-col">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5">
              <button
                onClick={() => setSelectedPlayer(null)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Trocar player
              </button>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-primary font-medium">
                {players.find(p => p.id === selectedPlayer)?.name}
              </span>
            </div>
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              <iframe
                src={playerUrl!}
                className="absolute inset-0 w-full h-full"
                allowFullScreen
                allow="autoplay; encrypted-media"
                title={title}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerModal;
