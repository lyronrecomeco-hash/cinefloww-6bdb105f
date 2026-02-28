import { useRef, forwardRef, memo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import MovieCard from "./MovieCard";
import MovieCardSkeleton from "./MovieCardSkeleton";
import { TMDBMovie } from "@/services/tmdb";

interface ContentRowProps {
  title: string;
  movies: TMDBMovie[];
  icon?: React.ReactNode;
  loading?: boolean;
}

const SKELETON_COUNT = 8;

const ContentRow = memo(forwardRef<HTMLElement, ContentRowProps>(({ title, movies, icon, loading }, ref) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  if (!loading && movies.length === 0) return null;

  return (
    <section className="mb-8 sm:mb-10 lg:mb-14 gpu-layer" style={{ contain: "layout style" }}>
      <div className="flex items-center justify-between px-3 sm:px-6 lg:px-12 mb-3 sm:mb-4 lg:mb-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-1 h-5 sm:h-6 rounded-full bg-primary" />
          <h2 className="font-display text-base sm:text-xl lg:text-2xl font-bold">{title}</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => scroll("left")}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center bg-white/15 border border-white/25 hover:bg-white/25 hover:border-white/40 hover:scale-105 active:scale-95 transition-all duration-200 text-foreground shadow-lg shadow-black/20"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center bg-white/15 border border-white/25 hover:bg-white/25 hover:border-white/40 hover:scale-105 active:scale-95 transition-all duration-200 text-foreground shadow-lg shadow-black/20"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-2.5 sm:gap-4 overflow-x-auto scrollbar-hide px-3 sm:px-6 lg:px-12 pb-2 overscroll-x-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {loading
          ? Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <div key={`sk-${i}`} className="flex-shrink-0 w-[120px] sm:w-[160px] lg:w-[180px]">
                <MovieCardSkeleton />
              </div>
            ))
          : movies.map((movie, idx) => (
              <div key={`${movie.id}-${idx}`} className="flex-shrink-0 w-[120px] sm:w-[160px] lg:w-[180px]">
                <MovieCard movie={movie} />
              </div>
            ))}
      </div>
    </section>
  );
}));

ContentRow.displayName = "ContentRow";

export default ContentRow;
