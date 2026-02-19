import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Play, Star, Clock, Calendar, Users, Tv, List, MessageSquare } from "lucide-react";
import Navbar from "@/components/Navbar";
import ContentRow from "@/components/ContentRow";
import SeasonsModal from "@/components/SeasonsModal";
import CastModal from "@/components/CastModal";
import AudioSelectModal from "@/components/AudioSelectModal";
import TrailerModal from "@/components/TrailerModal";
import RequestModal from "@/components/RequestModal";
import { fromSlug } from "@/lib/slugify";
import { toSlug } from "@/lib/slugify";
import {
  TMDBMovieDetail,
  getMovieDetails,
  getSeriesDetails,
  posterUrl,
  backdropUrl,
  getDisplayTitle,
  getYear,
} from "@/services/tmdb";

interface DetailsPageProps {
  type: "movie" | "tv";
}

const DetailsPage = ({ type }: DetailsPageProps) => {
  const { id: slug } = useParams();
  const id = fromSlug(slug || "0");
  const navigate = useNavigate();
  const [detail, setDetail] = useState<TMDBMovieDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSeasons, setShowSeasons] = useState(false);
  const [showCast, setShowCast] = useState(false);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [showRequest, setShowRequest] = useState(false);

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    setShowSeasons(false);
    setShowCast(false);
    setShowAudioModal(false);
    setShowTrailer(false);
    const fetcher = type === "movie" ? getMovieDetails : getSeriesDetails;
    fetcher(id).then((data) => {
      setDetail(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [slug, type]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Navbar />
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold mb-2">Conteúdo não encontrado</h1>
          <Link to="/" className="text-primary hover:underline text-sm">Voltar ao início</Link>
        </div>
      </div>
    );
  }

  const imdbId = detail.imdb_id || detail.external_ids?.imdb_id || null;
  const cast = detail.credits?.cast ?? [];
  const similar = detail.similar?.results ?? [];
  const trailer = detail.videos?.results.find((v) => v.type === "Trailer" && v.site === "YouTube");

  const handleWatchClick = () => {
    // If user has a saved audio preference, skip the modal entirely
    const savedPref = localStorage.getItem("cineflow_audio_pref");
    if (savedPref) {
      handleAudioSelect(savedPref);
      return;
    }
    setShowAudioModal(true);
  };

  // Prefetch video source for faster playback
  const prefetchSource = async (audio: string) => {
    const cType = type === "movie" ? "movie" : "series";
    try {
      const { data } = await supabase
        .from("video_cache")
        .select("video_url, video_type, provider")
        .eq("tmdb_id", id)
        .eq("content_type", cType)
        .eq("audio_type", audio)
        .is("season", null)
        .is("episode", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (data?.video_url) {
        return { url: data.video_url, type: data.video_type, provider: data.provider };
      }
    } catch {}
    return null;
  };

  const handleAudioSelect = async (audio: string) => {
    setShowAudioModal(false);
    const params = new URLSearchParams({ title: getDisplayTitle(detail), audio });
    if (imdbId) params.set("imdb", imdbId);
    
    // Try to prefetch cached source for instant playback
    const cached = await prefetchSource(audio);
    const playerSlug = toSlug(getDisplayTitle(detail), detail.id);
    navigate(`/player/${type === "tv" ? "series" : "movie"}/${playerSlug}?${params.toString()}`, {
      state: cached ? { prefetchedSource: cached } : undefined,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Backdrop */}
      <div className="relative h-[40vh] sm:h-[50vh] lg:h-[55vh] min-h-[280px] w-full overflow-hidden">
        <img
          src={backdropUrl(detail.backdrop_path, "original")}
          alt={getDisplayTitle(detail)}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-background/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/40 to-transparent" />
      </div>

      {/* Main Content */}
      <div className="relative -mt-32 sm:-mt-44 lg:-mt-52 z-10 px-3 sm:px-6 lg:px-12 pb-20">
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 lg:gap-10">
          {/* Poster */}
          <div className="flex-shrink-0 mx-auto sm:mx-0">
            <div className="w-[130px] sm:w-[180px] lg:w-[240px] rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl shadow-background/80 border border-white/10">
              <img
                src={posterUrl(detail.poster_path)}
                alt={getDisplayTitle(detail)}
                className="w-full h-auto object-cover"
              />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 animate-fade-in text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-2 sm:mb-3">
              <span className="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-primary/20 text-primary text-[10px] sm:text-xs font-semibold uppercase tracking-wider border border-primary/30">
                {type === "tv" ? "Série" : "Filme"}
              </span>
              {detail.tagline && (
                <span className="text-muted-foreground text-xs italic hidden sm:inline">"{detail.tagline}"</span>
              )}
            </div>

            <h1 className="font-display text-2xl sm:text-3xl lg:text-5xl font-bold mb-2 sm:mb-3 leading-tight">
              {getDisplayTitle(detail)}
            </h1>

            {/* Meta */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 sm:gap-x-5 gap-y-1.5 sm:gap-y-2 mb-3 sm:mb-4">
              {detail.vote_average > 0 && (
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 sm:w-5 sm:h-5 text-primary fill-primary" />
                  <span className="text-foreground font-bold text-base sm:text-lg">{detail.vote_average.toFixed(1)}</span>
                  <span className="text-muted-foreground text-[10px] sm:text-xs">/10</span>
                </div>
              )}
              {detail.runtime && (
                <div className="flex items-center gap-1 text-muted-foreground text-xs sm:text-sm">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  {Math.floor(detail.runtime / 60)}h {detail.runtime % 60}min
                </div>
              )}
              <div className="flex items-center gap-1 text-muted-foreground text-xs sm:text-sm">
                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {getYear(detail)}
              </div>
              {detail.number_of_seasons && (
                <div className="flex items-center gap-1 text-muted-foreground text-xs sm:text-sm">
                  <Tv className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  {detail.number_of_seasons} Temp.
                </div>
              )}
            </div>

            {/* Genres */}
            <div className="flex flex-wrap justify-center sm:justify-start gap-1.5 sm:gap-2 mb-3 sm:mb-4">
              {detail.genres.map((g) => (
                <span key={g.id} className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl bg-white/5 border border-white/10 text-[10px] sm:text-xs font-medium text-secondary-foreground">
                  {g.name}
                </span>
              ))}
            </div>

            {/* Overview */}
            <p className="text-secondary-foreground/80 leading-relaxed mb-4 sm:mb-6 max-w-2xl text-xs sm:text-sm lg:text-base line-clamp-4 sm:line-clamp-none">
              {detail.overview || "Sinopse não disponível."}
            </p>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3 mb-4 sm:mb-6">
              <button
                onClick={handleWatchClick}
                className="flex items-center gap-2 px-5 sm:px-7 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-primary text-primary-foreground font-semibold text-xs sm:text-sm hover:bg-primary/90 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/25"
              >
                <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                Assistir Agora
              </button>
              {trailer && (
                <button
                  onClick={() => setShowTrailer(true)}
                  className="flex items-center gap-2 px-5 sm:px-7 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl glass glass-hover font-semibold text-xs sm:text-sm"
                >
                  <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Trailer
                </button>
              )}
              {type === "tv" && detail.seasons && detail.seasons.length > 0 && (
                <button
                  onClick={() => setShowSeasons(true)}
                  className="flex items-center gap-2 px-5 sm:px-7 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl glass glass-hover font-semibold text-xs sm:text-sm"
                >
                  <List className="w-4 h-4 sm:w-5 sm:h-5" />
                  Temporadas
                </button>
              )}
            </div>

            {/* Cast - Netflix style */}
            {cast.length > 0 && (
              <button onClick={() => setShowCast(true)} className="glass p-3 sm:p-4 text-left hover:bg-white/[0.08] transition-colors group max-w-2xl w-full">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
                  </div>
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">Elenco</span>
                  <span className="text-[10px] sm:text-xs text-primary ml-auto opacity-0 group-hover:opacity-100 transition-opacity">Ver todos →</span>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-1">
                  {cast.slice(0, 8).map((c) => c.name).join(", ")}
                </p>
              </button>
            )}
          </div>
        </div>

        {/* Similar */}
        {similar.length > 0 && (
          <div className="mt-8 sm:mt-12">
            <ContentRow title="Títulos Semelhantes" movies={similar} />
          </div>
        )}
      </div>

      {/* Modals */}
      {showSeasons && detail.seasons && (
        <SeasonsModal
          seriesId={detail.id}
          seriesTitle={getDisplayTitle(detail)}
          seasons={detail.seasons}
          imdbId={imdbId}
          onClose={() => setShowSeasons(false)}
        />
      )}
      {showCast && <CastModal cast={cast} onClose={() => setShowCast(false)} />}
      {showAudioModal && (
        <AudioSelectModal
          tmdbId={detail.id}
          type={type}
          title={getDisplayTitle(detail)}
          subtitle={type === "tv" ? `${detail.number_of_seasons} Temporadas` : undefined}
          onSelect={handleAudioSelect}
          onClose={() => setShowAudioModal(false)}
        />
      )}
      {showTrailer && trailer && (
        <TrailerModal
          videoKey={trailer.key}
          title={getDisplayTitle(detail)}
          onClose={() => setShowTrailer(false)}
        />
      )}
      {showRequest && <RequestModal onClose={() => setShowRequest(false)} />}
    </div>
  );
};

export default DetailsPage;
