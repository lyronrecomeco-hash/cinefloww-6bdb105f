import { Play, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { TMDBMovie, backdropUrl, getDisplayTitle, getYear, getMediaType } from "@/services/tmdb";
import { toSlug } from "@/lib/slugify";

interface HeroSectionProps {
  movie: TMDBMovie;
}

const HeroSection = ({ movie }: HeroSectionProps) => {
  const type = getMediaType(movie);
  const title = getDisplayTitle(movie);
  const link = type === "movie" ? `/filme/${toSlug(title, movie.id)}` : `/serie/${toSlug(title, movie.id)}`;

  return (
    <section className="relative h-[85vh] min-h-[600px] w-full overflow-hidden">
      <div className="absolute inset-0">
        <img
          src={backdropUrl(movie.backdrop_path, "original")}
          alt={getDisplayTitle(movie)}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
        <div className="absolute inset-0 bg-background/20" />
      </div>

      <div className="relative h-full flex items-end pb-20 lg:pb-28 px-4 sm:px-6 lg:px-12">
        <div className="max-w-2xl animate-fade-in">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-semibold uppercase tracking-wider border border-primary/30">
              Em destaque
            </span>
            <span className="text-muted-foreground text-sm">{getYear(movie)}</span>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl lg:text-7xl font-bold mb-4 leading-tight">
            {getDisplayTitle(movie)}
          </h1>

          {movie.vote_average > 0 && (
            <div className="flex items-center gap-4 mb-5 text-sm text-muted-foreground">
              <span className="text-primary font-semibold text-base">★ {movie.vote_average.toFixed(1)}</span>
            </div>
          )}

          <p className="text-secondary-foreground/80 text-sm sm:text-base leading-relaxed mb-8 line-clamp-3 max-w-xl">
            {movie.overview}
          </p>

          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-6 py-3 sm:px-8 sm:py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm sm:text-base hover:bg-primary/90 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/25">
              <Play className="w-5 h-5 fill-current" />
              Assistir
            </button>
            <Link
              to={link}
              className="flex items-center gap-2 px-6 py-3 sm:px-8 sm:py-3.5 rounded-2xl glass glass-hover font-semibold text-sm sm:text-base"
            >
              <Info className="w-5 h-5" />
              Detalhes
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
