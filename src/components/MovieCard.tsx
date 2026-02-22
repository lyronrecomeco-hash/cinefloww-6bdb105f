import { memo } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { TMDBMovie, posterUrl, getDisplayTitle, getYear, getMediaType } from "@/services/tmdb";
import { toSlug } from "@/lib/slugify";

interface MovieCardProps {
  movie: TMDBMovie;
}

const MovieCard = memo(({ movie }: MovieCardProps) => {
  const type = getMediaType(movie);
  const title = getDisplayTitle(movie);
  const link = type === "movie" ? `/filme/${toSlug(title, movie.id)}` : `/serie/${toSlug(title, movie.id)}`;

  return (
    <Link to={link} className="group flex-shrink-0 w-full block">
      <div className="relative aspect-[2/3] rounded-xl sm:rounded-2xl overflow-hidden mb-2 sm:mb-3 card-shine">
        <img
          src={posterUrl(movie.poster_path)}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {movie.vote_average > 0 && (
          <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg bg-background/60 backdrop-blur-md text-[10px] sm:text-xs font-semibold border border-white/10">
            <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-primary fill-primary" />
            {movie.vote_average.toFixed(1)}
          </div>
        )}

        <div className="absolute bottom-1.5 left-1.5 sm:bottom-2 sm:left-2 px-1.5 sm:px-2 py-0.5 rounded-md bg-primary/20 backdrop-blur-md text-primary text-[8px] sm:text-[10px] font-semibold uppercase tracking-wider border border-primary/30">
          {type === "tv" ? "Série" : "Filme"}
        </div>
      </div>

      <h3 className="font-display font-semibold text-xs sm:text-sm leading-tight line-clamp-1 group-hover:text-primary transition-colors">
        {title}
      </h3>
      <p className="text-muted-foreground text-[10px] sm:text-xs mt-0.5 sm:mt-1">{getYear(movie)}</p>
    </Link>
  );
});

MovieCard.displayName = "MovieCard";

export default MovieCard;
