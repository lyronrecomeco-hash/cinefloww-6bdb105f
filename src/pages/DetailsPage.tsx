import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Play, Star, Clock, Calendar, Users, Clapperboard, Tv, List } from "lucide-react";
import Navbar from "@/components/Navbar";
import ContentRow from "@/components/ContentRow";
import SeasonsModal from "@/components/SeasonsModal";
import CastModal from "@/components/CastModal";
import AudioSelectModal from "@/components/AudioSelectModal";
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
  const { id } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<TMDBMovieDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSeasons, setShowSeasons] = useState(false);
  const [showCast, setShowCast] = useState(false);
  const [showAudioModal, setShowAudioModal] = useState(false);

  useEffect(() => {
    setLoading(true);
    setDetail(null);
    setShowSeasons(false);
    setShowCast(false);
    setShowAudioModal(false);
    const fetcher = type === "movie" ? getMovieDetails : getSeriesDetails;
    fetcher(Number(id)).then((data) => {
      setDetail(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id, type]);

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
  const director = detail.credits?.crew.find((c) => c.job === "Director");
  const cast = detail.credits?.cast ?? [];
  const similar = detail.similar?.results ?? [];
  const trailer = detail.videos?.results.find((v) => v.type === "Trailer" && v.site === "YouTube");

  const handleWatchClick = () => {
    // Both movies and series go through audio selection first
    setShowAudioModal(true);
  };

  const handleAudioSelect = (audio: string) => {
    setShowAudioModal(false);
    const params = new URLSearchParams({ title: getDisplayTitle(detail), audio });
    if (imdbId) params.set("imdb", imdbId);
    navigate(`/assistir/${type}/${id}?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Backdrop */}
      <div className="relative h-[50vh] sm:h-[55vh] min-h-[350px] w-full overflow-hidden">
        <img
          src={backdropUrl(detail.backdrop_path, "original")}
          alt={getDisplayTitle(detail)}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-background/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/40 to-transparent" />
      </div>

      {/* Main Content */}
      <div className="relative -mt-44 sm:-mt-52 z-10 px-4 sm:px-6 lg:px-12 pb-20">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-10">
          {/* Poster */}
          <div className="flex-shrink-0 mx-auto lg:mx-0">
            <div className="w-[160px] sm:w-[200px] lg:w-[240px] rounded-2xl overflow-hidden shadow-2xl shadow-background/80 border border-white/10">
              <img
                src={posterUrl(detail.poster_path)}
                alt={getDisplayTitle(detail)}
                className="w-full h-auto object-cover"
              />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 animate-fade-in">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-semibold uppercase tracking-wider border border-primary/30">
                {type === "tv" ? "Série" : "Filme"}
              </span>
              {detail.tagline && (
                <span className="text-muted-foreground text-xs italic hidden sm:inline">"{detail.tagline}"</span>
              )}
            </div>

            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold mb-3 leading-tight">
              {getDisplayTitle(detail)}
            </h1>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4">
              {detail.vote_average > 0 && (
                <div className="flex items-center gap-1.5">
                  <Star className="w-5 h-5 text-primary fill-primary" />
                  <span className="text-foreground font-bold text-lg">{detail.vote_average.toFixed(1)}</span>
                  <span className="text-muted-foreground text-xs">/10</span>
                </div>
              )}
              {detail.runtime && (
                <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                  <Clock className="w-4 h-4" />
                  {Math.floor(detail.runtime / 60)}h {detail.runtime % 60}min
                </div>
              )}
              <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                <Calendar className="w-4 h-4" />
                {getYear(detail)}
              </div>
              {detail.number_of_seasons && (
                <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                  <Tv className="w-4 h-4" />
                  {detail.number_of_seasons} Temp.
                </div>
              )}
            </div>

            {/* Genres */}
            <div className="flex flex-wrap gap-2 mb-4">
              {detail.genres.map((g) => (
                <span key={g.id} className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-secondary-foreground">
                  {g.name}
                </span>
              ))}
            </div>

            {/* Overview */}
            <p className="text-secondary-foreground/80 leading-relaxed mb-6 max-w-2xl text-sm sm:text-base">
              {detail.overview || "Sinopse não disponível."}
            </p>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <button
                onClick={handleWatchClick}
                className="flex items-center gap-2 px-7 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/25"
              >
                <Play className="w-5 h-5 fill-current" />
                Assistir Agora
              </button>
              {trailer && (
                <a
                  href={`https://www.youtube.com/watch?v=${trailer.key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-7 py-3 rounded-2xl glass glass-hover font-semibold text-sm"
                >
                  <Play className="w-4 h-4" />
                  Trailer
                </a>
              )}
              {type === "tv" && detail.seasons && detail.seasons.length > 0 && (
                <button
                  onClick={() => setShowSeasons(true)}
                  className="flex items-center gap-2 px-7 py-3 rounded-2xl glass glass-hover font-semibold text-sm"
                >
                  <List className="w-5 h-5" />
                  Temporadas
                </button>
              )}
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
              {director && (
                <div className="glass p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Clapperboard className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Diretor</span>
                  </div>
                  <p className="text-sm font-medium">{director.name}</p>
                </div>
              )}
              {cast.length > 0 && (
               <button onClick={() => setShowCast(true)} className="glass p-4 text-left hover:bg-white/[0.08] transition-colors group">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Users className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Elenco</span>
                    <span className="text-xs text-primary ml-auto opacity-0 group-hover:opacity-100 transition-opacity">Ver todos →</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-1">
                    {cast.slice(0, 6).map((c) => c.name).join(", ")}
                  </p>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Similar */}
        {similar.length > 0 && (
          <div className="mt-12">
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
    </div>
  );
};

export default DetailsPage;
