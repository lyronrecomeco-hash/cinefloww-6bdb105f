import { memo, useState } from "react";
import { Link } from "react-router-dom";
import { Star, Calendar } from "lucide-react";
import { TMDBMovie, posterUrl, getDisplayTitle, getYear, getMediaType } from "@/services/tmdb";
import { toSlug } from "@/lib/slugify";
import { Skeleton } from "@/components/ui/skeleton";

interface MovieCardProps {
  movie: TMDBMovie;
  comingSoon?: boolean;
}

const MovieCard = memo(({ movie, comingSoon }: MovieCardProps) => {
  const type = getMediaType(movie);
  const title = getDisplayTitle(movie);
  const link = type === "movie" ? `/filme/${toSlug(title, movie.id)}` : `/serie/${toSlug(title, movie.id)}`;
  const [imgLoaded, setImgLoaded] = useState(false);

  // Check if future release
  const releaseDate = movie.release_date || movie.first_air_date;
  const isFuture = comingSoon || (releaseDate && releaseDate > new Date().toISOString().split("T")[0]);

  const formattedDate = releaseDate ? new Date(releaseDate + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "";

  const Wrapper = isFuture ? "div" : Link;
  const wrapperProps = isFuture ? { className: "group flex-shrink-0 w-full block cursor-default" } : { to: link, className: "group flex-shrink-0 w-full block" };

  return (
    <Wrapper {...(wrapperProps as any)}>
      <div className="relative aspect-[2/3] rounded-lg sm:rounded-xl overflow-hidden mb-1.5 sm:mb-2 gpu-layer">
        {!imgLoaded && <Skeleton className="absolute inset-0 w-full h-full z-10" />}
        <img
          src={posterUrl(movie.poster_path)}
          alt={`${title} - Assistir grátis online em HD na LyneFlix`}
          className={`w-full h-full object-cover will-change-transform transition-transform duration-500 group-hover:scale-105 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
          loading="lazy"
          decoding="async"
          onLoad={() => setImgLoaded(true)}
          onError={(e) => {
            if (e.currentTarget.dataset.fallbackApplied === "1") return;
            e.currentTarget.dataset.fallbackApplied = "1";
            e.currentTarget.src = "/placeholder.svg";
            setImgLoaded(true);
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {movie.vote_average > 0 && (
          <div className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-[9px] sm:text-[10px] font-semibold border border-white/10">
            <Star className="w-2.5 h-2.5 text-primary fill-primary" />
            {movie.vote_average.toFixed(1)}
          </div>
        )}

        {isFuture ? (
          <div className="absolute bottom-1 left-1 sm:bottom-1.5 sm:left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/80 text-white text-[7px] sm:text-[8px] font-bold uppercase tracking-wider">
            <Calendar className="w-2.5 h-2.5" />
            {formattedDate || "Em Breve"}
          </div>
        ) : (
          <div className="absolute bottom-1 left-1 sm:bottom-1.5 sm:left-1.5 px-1.5 py-0.5 rounded bg-primary/80 text-primary-foreground text-[7px] sm:text-[9px] font-bold uppercase tracking-wider">
            {type === "tv" ? "Série" : "Filme"}
          </div>
        )}
      </div>

      <h3 className="font-medium text-[11px] sm:text-xs leading-tight line-clamp-1 group-hover:text-primary transition-colors">
        {title}
      </h3>
      <p className="text-muted-foreground text-[9px] sm:text-[10px] mt-0.5">{getYear(movie)}</p>
    </Wrapper>
  );
});

MovieCard.displayName = "MovieCard";

export default MovieCard;
