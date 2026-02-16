import { useState, useEffect, useCallback } from "react";
import { Play, Info, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { TMDBMovie, backdropUrl, getDisplayTitle, getYear, getMediaType } from "@/services/tmdb";

interface HeroSliderProps {
  movies: TMDBMovie[];
}

const HeroSlider = ({ movies }: HeroSliderProps) => {
  const items = movies.slice(0, 6);
  const [current, setCurrent] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const goTo = useCallback((index: number) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrent(index);
    setTimeout(() => setIsTransitioning(false), 700);
  }, [isTransitioning]);

  const next = useCallback(() => goTo((current + 1) % items.length), [current, items.length, goTo]);
  const prev = useCallback(() => goTo((current - 1 + items.length) % items.length), [current, items.length, goTo]);

  useEffect(() => {
    const timer = setInterval(next, 7000);
    return () => clearInterval(timer);
  }, [next]);

  if (!items.length) return null;

  const movie = items[current];
  const type = getMediaType(movie);
  const link = type === "movie" ? `/filme/${movie.id}` : `/serie/${movie.id}`;

  return (
    <section className="relative h-[70vh] lg:h-[75vh] min-h-[500px] max-h-[750px] w-full overflow-hidden">
      {/* Slides */}
      {items.map((item, i) => (
        <div
          key={item.id}
          className={`absolute inset-0 transition-opacity duration-700 ${
            i === current ? "opacity-100 z-10" : "opacity-0 z-0"
          }`}
        >
          <img
            src={backdropUrl(item.backdrop_path, "original")}
            alt={getDisplayTitle(item)}
            className="w-full h-full object-cover"
          />
        </div>
      ))}

      {/* Overlays */}
      <div className="absolute inset-0 z-20 bg-gradient-to-r from-background via-background/70 to-transparent" />
      <div className="absolute inset-0 z-20 bg-gradient-to-t from-background via-background/20 to-transparent" />

      {/* Content */}
      <div className="relative z-30 h-full flex items-end pb-16 lg:pb-24 px-4 sm:px-6 lg:px-12">
        <div className="max-w-2xl" key={movie.id}>
          <div className={`transition-all duration-500 ${isTransitioning ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}>
            <div className="flex items-center gap-3 mb-3">
              <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-semibold uppercase tracking-wider border border-primary/30">
                {type === "movie" ? "Filme" : "Série"}
              </span>
              <span className="text-muted-foreground text-sm">{getYear(movie)}</span>
            </div>

            <h1 className="font-display text-3xl sm:text-4xl lg:text-6xl font-bold mb-3 leading-tight">
              {getDisplayTitle(movie)}
            </h1>

            {movie.vote_average > 0 && (
              <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
                <span className="text-primary font-semibold text-base">★ {movie.vote_average.toFixed(1)}</span>
              </div>
            )}

            <p className="text-secondary-foreground/80 text-sm sm:text-base leading-relaxed mb-6 line-clamp-2 max-w-xl">
              {movie.overview}
            </p>

            <div className="flex items-center gap-3">
              <Link
                to={link}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/25"
              >
                <Play className="w-5 h-5 fill-current" />
                Assistir
              </Link>
              <Link
                to={link}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl glass glass-hover font-semibold text-sm"
              >
                <Info className="w-5 h-5" />
                Detalhes
              </Link>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="absolute bottom-16 lg:bottom-24 right-4 sm:right-6 lg:right-12 flex items-center gap-3">
          <button
            onClick={prev}
            className="w-10 h-10 rounded-xl glass flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5">
            {items.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === current ? "w-8 bg-primary" : "w-1.5 bg-white/30 hover:bg-white/50"
                }`}
              />
            ))}
          </div>
          <button
            onClick={next}
            className="w-10 h-10 rounded-xl glass flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default HeroSlider;
