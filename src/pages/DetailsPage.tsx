import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Play, Star, Clock, Calendar, Users, Clapperboard, Tv, List, Image as ImageIcon, Mic, Subtitles, Video, Globe, ChevronRight, X } from "lucide-react";
import Navbar from "@/components/Navbar";
import ContentRow from "@/components/ContentRow";
import SeasonsModal from "@/components/SeasonsModal";
import CastModal from "@/components/CastModal";
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
  const [audioTypes, setAudioTypes] = useState<string[]>([]);

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
      // Fetch audio types from DB
      const cType = type === "movie" ? "movie" : "series";
      supabase.from("content").select("audio_type").eq("tmdb_id", Number(id)).eq("content_type", cType).maybeSingle()
        .then(({ data: content }) => { if (content?.audio_type) setAudioTypes(content.audio_type); });
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
  const castPreview = cast.slice(0, 6);
  const similar = detail.similar?.results ?? [];
  const trailer = detail.videos?.results.find((v) => v.type === "Trailer" && v.site === "YouTube");
  const backdrops = detail.images?.backdrops?.slice(0, 8) ?? [];

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
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-4 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Link>

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
                onClick={() => {
                  if (audioTypes.length > 1) {
                    setShowAudioModal(true);
                  } else {
                    const imdb = detail.imdb_id || detail.external_ids?.imdb_id || null;
                    const params = new URLSearchParams({ title: getDisplayTitle(detail) });
                    if (imdb) params.set("imdb", imdb);
                    navigate(`/assistir/${type}/${id}?${params.toString()}`);
                  }
                }}
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
                    {castPreview.map((c) => c.name).join(", ")}
                  </p>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Cast Preview */}
        {castPreview.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-xl font-bold">Elenco Principal</h2>
              {cast.length > 6 && (
                <button onClick={() => setShowCast(true)} className="text-sm text-primary hover:underline">
                  Ver todos ({cast.length})
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
              {castPreview.map((person) => (
                <div key={person.id} className="text-center group cursor-pointer" onClick={() => setShowCast(true)}>
                  <div className="w-full aspect-[3/4] rounded-2xl overflow-hidden mb-2 bg-muted border border-white/5">
                    {person.profile_path ? (
                      <img
                        src={posterUrl(person.profile_path, "w185")}
                        alt={person.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-2xl font-display">
                        {person.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-semibold line-clamp-1">{person.name}</p>
                  <p className="text-[10px] text-muted-foreground line-clamp-1">{person.character}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gallery */}
        {backdrops.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center gap-2 mb-5">
              <ImageIcon className="w-4 h-4 text-primary" />
              <h2 className="font-display text-xl font-bold">Galeria</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {backdrops.map((img, i) => (
                <div key={i} className="aspect-video rounded-xl overflow-hidden border border-white/5 bg-muted">
                  <img
                    src={backdropUrl(img.file_path, "w780")}
                    alt={`Cena ${i + 1}`}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

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

      {/* Audio Selection Modal */}
      {showAudioModal && (() => {
        const AUDIO_OPTIONS = [
          { key: "dublado", icon: Mic, label: "Dublado PT-BR", description: "Áudio em português brasileiro" },
          { key: "legendado", icon: Subtitles, label: "Legendado", description: "Áudio original com legendas" },
          { key: "cam", icon: Video, label: "CAM", description: "Gravação de câmera" },
        ];
        const handleSelect = (audioKey: string) => {
          setShowAudioModal(false);
          const imdb = detail.imdb_id || detail.external_ids?.imdb_id || null;
          const params = new URLSearchParams({ title: getDisplayTitle(detail), audio: audioKey });
          if (imdb) params.set("imdb", imdb);
          navigate(`/assistir/${type}/${id}?${params.toString()}`);
        };
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowAudioModal(false)}>
            <div className="absolute inset-0 bg-background/90 backdrop-blur-xl" />
            <div className="relative w-full max-w-md glass-strong overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="font-display text-xl font-bold">{getDisplayTitle(detail)}</h2>
                    <p className="text-sm text-muted-foreground mt-1">Escolha o tipo de áudio</p>
                  </div>
                  <button onClick={() => setShowAudioModal(false)} className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-3">
                  {AUDIO_OPTIONS.filter(o => audioTypes.includes(o.key)).map(opt => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.key}
                        onClick={() => handleSelect(opt.key)}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl glass glass-hover transition-all duration-200"
                      >
                        <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-6 h-6 text-primary" />
                        </div>
                        <div className="text-left flex-1">
                          <p className="font-semibold text-sm">{opt.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 pt-4 border-t border-white/10">
                  <button
                    onClick={() => handleSelect("legendado")}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-muted-foreground hover:bg-white/10 transition-colors"
                  >
                    <Globe className="w-4 h-4" />
                    Pular seleção e assistir
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default DetailsPage;
