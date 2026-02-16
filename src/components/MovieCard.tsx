import { Link } from "react-router-dom";
import { Star, Ban } from "lucide-react";
import { TMDBMovie, posterUrl, getDisplayTitle, getYear, getMediaType } from "@/services/tmdb";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface MovieCardProps {
  movie: TMDBMovie;
}

const MovieCard = ({ movie }: MovieCardProps) => {
  const type = getMediaType(movie);
  const link = type === "movie" ? `/filme/${movie.id}` : `/serie/${movie.id}`;
  const [inactive, setInactive] = useState(false);

  useEffect(() => {
    const cType = type === "movie" ? "movie" : "series";
    supabase
      .from("content")
      .select("status")
      .eq("tmdb_id", movie.id)
      .eq("content_type", cType)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.status === "inactive") setInactive(true);
      });
  }, [movie.id, type]);

  const content = (
    <div className={`group flex-shrink-0 w-[160px] sm:w-[180px] lg:w-[200px] ${inactive ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="relative aspect-[2/3] rounded-2xl overflow-hidden mb-3 card-shine">
        <img
          src={posterUrl(movie.poster_path)}
          alt={getDisplayTitle(movie)}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {movie.vote_average > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-background/60 backdrop-blur-md text-xs font-semibold border border-white/10">
            <Star className="w-3 h-3 text-primary fill-primary" />
            {movie.vote_average.toFixed(1)}
          </div>
        )}

        {inactive ? (
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-destructive/20 backdrop-blur-md text-destructive text-[10px] font-semibold uppercase tracking-wider border border-destructive/30 flex items-center gap-1">
            <Ban className="w-3 h-3" /> Indisponível
          </div>
        ) : (
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-primary/20 backdrop-blur-md text-primary text-[10px] font-semibold uppercase tracking-wider border border-primary/30">
            {type === "tv" ? "Série" : "Filme"}
          </div>
        )}
      </div>

      <h3 className="font-display font-semibold text-sm leading-tight line-clamp-1 group-hover:text-primary transition-colors">
        {getDisplayTitle(movie)}
      </h3>
      <p className="text-muted-foreground text-xs mt-1">{getYear(movie)}</p>
    </div>
  );

  if (inactive) {
    return <div className="cursor-not-allowed">{content}</div>;
  }

  return <Link to={link}>{content}</Link>;
};

export default MovieCard;
