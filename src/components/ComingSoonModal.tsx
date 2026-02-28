import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Calendar, Play } from "lucide-react";
import { TMDBMovie, TMDBMovieDetail, getMovieDetails, getSeriesDetails, getDisplayTitle, getYear, getMediaType, posterUrl, backdropUrl } from "@/services/tmdb";

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
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = "";
    };
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
  const backdrop = detail?.backdrop_path || movie.backdrop_path;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />
      <div
        className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-card animate-in fade-in zoom-in-95 duration-200 scrollbar-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner / Trailer area */}
        <div className="relative w-full aspect-video bg-black rounded-t-2xl overflow-hidden">
          {showTrailer && trailerKey ? (
            <iframe
              src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1`}
              className="absolute inset-0 w-full h-full"
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          ) : backdrop ? (
            <>
              <img
                src={backdropUrl(backdrop, "w1280")}
                alt={title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
              {trailerKey && (
                <button
                  onClick={() => setShowTrailer(true)}
                  className="absolute inset-0 flex items-center justify-center group"
                >
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary/90 flex items-center justify-center group-hover:bg-primary group-hover:scale-110 transition-all shadow-xl shadow-primary/30">
                    <Play className="w-6 h-6 sm:w-7 sm:h-7 fill-primary-foreground text-primary-foreground ml-0.5" />
                  </div>
                </button>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <img src={posterUrl(movie.poster_path, "w342")} alt={title} className="h-full object-cover" />
            </div>
          )}
        </div>

        {/* Close button */}
        <button onClick={onClose} className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black/80 transition-colors border border-white/10">
          <X className="w-4 h-4" />
        </button>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-4">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold leading-tight mb-2">{title}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-semibold uppercase">
                {type === "movie" ? "Filme" : "Série"}
              </span>
              {movie.vote_average > 0 && (
                <span className="text-primary text-xs font-semibold">★ {movie.vote_average.toFixed(1)}</span>
              )}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20">
                <Calendar className="w-3 h-3 text-primary" />
                <span className="text-[11px] font-semibold text-primary">{formattedDate}</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Sinopse</h3>
            <p className="text-sm leading-relaxed text-foreground/80">{overview}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ComingSoonModal;
