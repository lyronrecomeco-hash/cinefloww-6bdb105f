import { Link } from "react-router-dom";
import { Star, Ban } from "lucide-react";
import { TMDBMovie, posterUrl, getDisplayTitle, getYear, getMediaType } from "@/services/tmdb";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toSlug } from "@/lib/slugify";

interface MovieCardProps {
  movie: TMDBMovie;
}

const MovieCard = ({ movie }: MovieCardProps) => {
  const type = getMediaType(movie);
  const title = getDisplayTitle(movie);
  const link = type === "movie" ? `/filme/${toSlug(title, movie.id)}` : `/serie/${toSlug(title, movie.id)}`;
  const [inactive, setInactive] = useState(false);
  const [audioTypes, setAudioTypes] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const cType = type === "movie" ? "movie" : "series";
    const withTimeout = <T,>(p: PromiseLike<T>, ms: number): Promise<T | null> =>
      Promise.race([Promise.resolve(p), new Promise<null>((r) => setTimeout(() => r(null), ms))]);

    // Check content status (non-blocking, 4s timeout)
    withTimeout(
      supabase.from("content").select("status").eq("tmdb_id", movie.id).eq("content_type", cType).maybeSingle(),
      4000
    ).then((result) => {
      if (!cancelled && result && (result as any).data?.status === "inactive") setInactive(true);
    }).catch(() => {});

    // Get audio types (non-blocking, 4s timeout)
    withTimeout(
      supabase.from("video_cache").select("audio_type").eq("tmdb_id", movie.id).eq("content_type", cType),
      4000
    ).then((result) => {
      if (!cancelled && result) {
        const data = (result as any).data;
        if (data && data.length > 0) {
          const types = [...new Set(data.map((r: any) => r.audio_type))] as string[];
          setAudioTypes(types);
        }
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [movie.id, type]);

  // Determine badge: CAM takes priority warning, then DUB, then LEG
  const getAudioBadge = () => {
    if (audioTypes.includes("cam")) return { label: "CAM", className: "bg-orange-500/20 text-orange-400 border-orange-500/30" };
    if (audioTypes.includes("dublado")) return { label: "DUB", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" };
    if (audioTypes.includes("legendado")) return { label: "LEG", className: "bg-sky-500/20 text-sky-400 border-sky-500/30" };
    return null;
  };

  const audioBadge = getAudioBadge();

  const content = (
    <div className={`group flex-shrink-0 w-full ${inactive ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="relative aspect-[2/3] rounded-xl sm:rounded-2xl overflow-hidden mb-2 sm:mb-3 card-shine">
        <img
          src={posterUrl(movie.poster_path)}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Audio badge - top left */}
        {audioBadge && (
          <div className={`absolute top-1.5 left-1.5 sm:top-2 sm:left-2 px-1.5 sm:px-2 py-0.5 rounded-md backdrop-blur-md text-[8px] sm:text-[10px] font-bold uppercase tracking-wider border ${audioBadge.className}`}>
            {audioBadge.label}
          </div>
        )}

        {movie.vote_average > 0 && (
          <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg bg-background/60 backdrop-blur-md text-[10px] sm:text-xs font-semibold border border-white/10">
            <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-primary fill-primary" />
            {movie.vote_average.toFixed(1)}
          </div>
        )}

        {inactive ? (
          <div className="absolute bottom-1.5 left-1.5 sm:bottom-2 sm:left-2 px-1.5 sm:px-2 py-0.5 rounded-md bg-destructive/20 backdrop-blur-md text-destructive text-[8px] sm:text-[10px] font-semibold uppercase tracking-wider border border-destructive/30 flex items-center gap-1">
            <Ban className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Indisponível
          </div>
        ) : (
          <div className="absolute bottom-1.5 left-1.5 sm:bottom-2 sm:left-2 px-1.5 sm:px-2 py-0.5 rounded-md bg-primary/20 backdrop-blur-md text-primary text-[8px] sm:text-[10px] font-semibold uppercase tracking-wider border border-primary/30">
            {type === "tv" ? "Série" : "Filme"}
          </div>
        )}
      </div>

      <h3 className="font-display font-semibold text-xs sm:text-sm leading-tight line-clamp-1 group-hover:text-primary transition-colors">
        {title}
      </h3>
      <p className="text-muted-foreground text-[10px] sm:text-xs mt-0.5 sm:mt-1">{getYear(movie)}</p>
    </div>
  );

  if (inactive) {
    return <div className="cursor-not-allowed">{content}</div>;
  }

  return <Link to={link}>{content}</Link>;
};

export default MovieCard;
