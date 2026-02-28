import { useEffect, useState } from "react";
import { X, Calendar, Play } from "lucide-react";
import { TMDBMovie, TMDBMovieDetail, getMovieDetails, getSeriesDetails, getDisplayTitle, getYear, getMediaType, posterUrl } from "@/services/tmdb";
import TrailerModal from "./TrailerModal";

interface ComingSoonModalProps {
  movie: TMDBMovie;
  onClose: () => void;
}

const ComingSoonModal = ({ movie, onClose }: ComingSoonModalProps) => {
  const [detail, setDetail] = useState<TMDBMovieDetail | null>(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const type = getMediaType(movie);
  const title = getDisplayTitle(movie);

  useEffect(() => {
    const fetch = type === "movie" ? getMovieDetails : getSeriesDetails;
    fetch(movie.id).then(setDetail).catch(() => {});
  }, [movie.id, type]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const releaseDate = movie.release_date || movie.first_air_date;
  const formattedDate = releaseDate
    ? new Date(releaseDate + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : "Data não confirmada";

  const trailerKey = detail?.videos?.results?.find(
    (v: any) => v.type === "Trailer" && v.site === "YouTube"
  )?.key || detail?.videos?.results?.find(
    (v: any) => v.site === "YouTube"
  )?.key;

  const overview = detail?.overview || movie.overview || "Sinopse não disponível.";

  return (
    <>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
        <div
          className="relative glass-strong rounded-2xl border border-white/10 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with poster */}
          <div className="flex gap-4 p-4 sm:p-5 border-b border-white/10">
            <img
              src={posterUrl(movie.poster_path, "w342")}
              alt={title}
              className="w-24 sm:w-28 rounded-xl object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-base sm:text-lg font-bold leading-tight mb-1">{title}</h2>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                <span className="px-2 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-semibold uppercase">
                  {type === "movie" ? "Filme" : "Série"}
                </span>
                {movie.vote_average > 0 && (
                  <span className="text-primary font-semibold">★ {movie.vote_average.toFixed(1)}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 w-fit">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-primary">{formattedDate}</span>
              </div>
              {trailerKey && (
                <button
                  onClick={() => setShowTrailer(true)}
                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-xs font-semibold transition-colors"
                >
                  <Play className="w-3.5 h-3.5 fill-current" /> Assistir Trailer
                </button>
              )}
            </div>
            <button onClick={onClose} className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Synopsis */}
          <div className="p-4 sm:p-5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Sinopse</h3>
            <p className="text-sm leading-relaxed text-foreground/80">{overview}</p>
          </div>
        </div>
      </div>

      {showTrailer && trailerKey && (
        <TrailerModal videoKey={trailerKey} title={title} onClose={() => setShowTrailer(false)} />
      )}
    </>
  );
};

export default ComingSoonModal;
