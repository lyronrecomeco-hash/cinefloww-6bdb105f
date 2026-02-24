import { memo, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { TMDBMovie, posterUrl, getDisplayTitle, getYear, getMediaType } from "@/services/tmdb";
import { toSlug } from "@/lib/slugify";
import { supabase } from "@/integrations/supabase/client";

interface MovieCardProps {
  movie: TMDBMovie;
  audioBadges?: string[] | null; // pre-fetched badges from parent
}

// Global cache to avoid re-fetching per card
const badgeCache = new Map<number, string[]>();

const MovieCard = memo(({ movie, audioBadges }: MovieCardProps) => {
  const type = getMediaType(movie);
  const title = getDisplayTitle(movie);
  const link = type === "movie" ? `/filme/${toSlug(title, movie.id)}` : `/serie/${toSlug(title, movie.id)}`;
  const [badges, setBadges] = useState<string[]>(audioBadges || badgeCache.get(movie.id) || []);

  useEffect(() => {
    if (audioBadges) { setBadges(audioBadges); return; }
    if (badgeCache.has(movie.id)) { setBadges(badgeCache.get(movie.id)!); return; }
    const cType = type === "movie" ? "movie" : "series";
    supabase
      .from("video_cache")
      .select("audio_type")
      .eq("tmdb_id", movie.id)
      .eq("content_type", cType)
      .gt("expires_at", new Date().toISOString())
      .then(({ data }) => {
        if (data) {
          const types = [...new Set(data.map(d => d.audio_type))];
          badgeCache.set(movie.id, types);
          setBadges(types);
        }
      });
  }, [movie.id, type, audioBadges]);

  const badgeColors: Record<string, string> = {
    dublado: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    legendado: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    cam: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  };
  const badgeLabels: Record<string, string> = { dublado: "DUB", legendado: "LEG", cam: "CAM" };

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

        {/* Audio badges */}
        {badges.length > 0 && (
          <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 flex gap-0.5">
            {badges.map(b => (
              <span key={b} className={`px-1 sm:px-1.5 py-0.5 rounded text-[7px] sm:text-[8px] font-bold uppercase border ${badgeColors[b] || "bg-white/10 text-white/70 border-white/20"}`}>
                {badgeLabels[b] || b}
              </span>
            ))}
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
