import { useEffect, useState, useCallback } from "react";

import { toast } from "sonner";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Play, Star, Clock, Calendar, Users, Tv, List, MessageSquare, Flag, Share2, BookmarkPlus, BookmarkCheck, TimerIcon } from "lucide-react";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ContentRow from "@/components/ContentRow";
import SeasonsModal from "@/components/SeasonsModal";
import CastModal from "@/components/CastModal";
import AudioSelectModal from "@/components/AudioSelectModal";
import TrailerModal from "@/components/TrailerModal";
import RequestModal from "@/components/RequestModal";
import ReportModal from "@/components/ReportModal";
// DetailAutoWarning disabled
import LoginRequiredModal from "@/components/LoginRequiredModal";
import WatchTogetherButton from "@/components/watch-together/WatchTogetherButton";
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
  const [showReport, setShowReport] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [inMyList, setInMyList] = useState(false);
  const [hasVideo, setHasVideo] = useState<boolean | null>(null); // null = loading
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  // Load active profile
  useEffect(() => {
    const stored = localStorage.getItem("lyneflix_active_profile");
    if (stored) {
      try { setActiveProfileId(JSON.parse(stored).id); } catch {}
    }
  }, []);

  useEffect(() => {
    if (detail && activeProfileId) {
      supabase
        .from("my_list")
        .select("id")
        .eq("profile_id", activeProfileId)
        .eq("tmdb_id", detail.id)
        .eq("content_type", type)
        .maybeSingle()
        .then(({ data }) => setInMyList(!!data));
    }
  }, [detail, type, activeProfileId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    setShowSeasons(false);
    setShowCast(false);
    setShowAudioModal(false);
    setShowTrailer(false);
    setHasVideo(null);

    if (!id || id === 0) {
      setLoading(false);
      return;
    }

    const fetcher = type === "movie" ? getMovieDetails : getSeriesDetails;
    fetcher(id).then((data) => {
      if (cancelled) return;
      // Ensure genres is always an array
      if (!data.genres) data.genres = [];
      setDetail(data);
      setLoading(false);
      // Track view (non-blocking)
      supabase.from("content_views").insert({
        tmdb_id: id,
        content_type: type === "movie" ? "movie" : "tv",
      }).then(() => {});
      // Check if video exists in cache
      const cType = type === "movie" ? "movie" : "series";
      supabase
        .from("video_cache_safe")
        .select("id")
        .eq("tmdb_id", id)
        .eq("content_type", cType)
        .limit(1)
        .then(({ data: cacheData }) => {
          if (!cancelled) setHasVideo(!!(cacheData && cacheData.length > 0));
        });
    }).catch((err) => {
      console.error("[DetailsPage] fetch error:", err);
      if (!cancelled) setLoading(false);
    });

    // Check for resolved reports for this visitor
    const vid = localStorage.getItem("_cf_vid");
    if (vid) {
      supabase
        .from("content_reports" as any)
        .select("id, title")
        .eq("tmdb_id", id)
        .eq("visitor_id", vid)
        .eq("status", "resolved")
        .then(({ data: resolvedReports }: any) => {
          if (cancelled) return;
          if (resolvedReports?.length) {
            toast.success(
              `🎉 O problema reportado em "${resolvedReports[0].title}" foi resolvido! A equipe LyneFlix agradece.`,
              { duration: 8000 }
            );
            resolvedReports.forEach((r: any) => {
              supabase.from("content_reports" as any).update({ status: "notified" } as any).eq("id", r.id).then(() => {});
            });
          }
        });
    }
    return () => { cancelled = true; };
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

  const imdbId = detail?.imdb_id || detail?.external_ids?.imdb_id || null;
  const cast = detail?.credits?.cast ?? [];
  const similar = detail?.similar?.results ?? [];
  const trailer = detail?.videos?.results?.find((v) => v.type === "Trailer" && v.site === "YouTube");

  const handleWatchClick = () => {
    // If user has a saved audio preference, skip the modal entirely
    const savedPref = localStorage.getItem("cineflow_audio_pref");
    if (savedPref) {
      handleAudioSelect(savedPref);
      return;
    }
    setShowAudioModal(true);
  };

  // Prefetch: check if video is cached (existence only, no URL exposed)
  const prefetchSource = async (audio: string) => {
    const cType = type === "movie" ? "movie" : "series";
    try {
      // Only select metadata, NOT video_url — URL stays server-side
      const { data } = await supabase
        .from("video_cache")
        .select("video_type, provider")
        .eq("tmdb_id", id)
        .eq("content_type", cType)
        .eq("audio_type", audio)
        .is("season", null)
        .is("episode", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (data) {
        return { url: "__cached__", type: data.video_type, provider: data.provider };
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

      {/* Auto warning disabled */}

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
              {(detail.genres || []).map((g) => (
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
              {hasVideo === false ? (
                <div className="flex items-center gap-2 px-5 sm:px-7 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 font-semibold text-xs sm:text-sm cursor-not-allowed select-none">
                  <TimerIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                  Disponível em breve
                </div>
              ) : (
                <button
                  onClick={handleWatchClick}
                  disabled={hasVideo === null}
                  className="flex items-center gap-2 px-5 sm:px-7 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-primary text-primary-foreground font-semibold text-xs sm:text-sm hover:bg-primary/90 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/25 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                  Assistir Agora
                </button>
              )}
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
              <button
                onClick={async () => {
                  // Check if logged in
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session || !activeProfileId) {
                    setShowLoginModal(true);
                    return;
                  }
                  if (inMyList) {
                    await supabase
                      .from("my_list")
                      .delete()
                      .eq("profile_id", activeProfileId)
                      .eq("tmdb_id", detail.id)
                      .eq("content_type", type);
                    setInMyList(false);
                  } else {
                    const { error } = await supabase.from("my_list").upsert(
                      {
                        profile_id: activeProfileId,
                        tmdb_id: detail.id,
                        content_type: type,
                        title: getDisplayTitle(detail),
                        poster_path: detail.poster_path,
                      },
                      { onConflict: "profile_id,tmdb_id,content_type" }
                    );
                    if (!error) setInMyList(true);
                  }
                }}
                className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl glass glass-hover font-semibold text-xs sm:text-sm ${inMyList ? "text-primary" : ""}`}
                title={inMyList ? "Remover da lista" : "Adicionar à lista"}
              >
                {inMyList ? <BookmarkCheck className="w-4 h-4 sm:w-5 sm:h-5" /> : <BookmarkPlus className="w-4 h-4 sm:w-5 sm:h-5" />}
                {inMyList ? "Na Lista" : "Minha Lista"}
              </button>
              <button
                onClick={() => {
                  const shareUrl = window.location.href;
                  const shareText = `🎬 Tô assistindo "${getDisplayTitle(detail)}" na LyneFlix e tá incrível! Vem conferir 👉`;
                  if (navigator.share) {
                    navigator.share({ title: `${getDisplayTitle(detail)} — LyneFlix`, text: shareText, url: shareUrl }).catch(() => {});
                  } else {
                    navigator.clipboard.writeText(`${shareText} ${shareUrl}`).then(() => {
                      toast.success("Link copiado! Compartilhe com seus amigos 🚀");
                    });
                  }
                }}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl glass glass-hover flex items-center justify-center"
                title="Compartilhar"
              >
                <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button
                onClick={() => setShowReport(true)}
                className="flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl glass glass-hover font-semibold text-xs sm:text-sm text-destructive/80 hover:text-destructive"
                title="Reportar problema"
              >
                <Flag className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Reportar
              </button>
              <WatchTogetherButton
                profileId={activeProfileId}
                tmdbId={detail.id}
                contentType={type}
                title={getDisplayTitle(detail)}
                posterPath={detail.poster_path || undefined}
                onRoomJoined={(code, mode) => {
                  const playerSlug = toSlug(getDisplayTitle(detail), detail.id);
                  const cType = type === "tv" ? "series" : "movie";
                  const params = new URLSearchParams({ title: getDisplayTitle(detail), room: code });
                  if (imdbId) params.set("imdb", imdbId);
                  if (mode) params.set("roomMode", mode);
                  navigate(`/player/${cType}/${playerSlug}?${params.toString()}`);
                }}
              />
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

      <Footer />

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
      {showReport && (
        <ReportModal
          tmdbId={detail.id}
          contentType={type}
          title={getDisplayTitle(detail)}
          onClose={() => setShowReport(false)}
        />
      )}
      {showLoginModal && <LoginRequiredModal onClose={() => setShowLoginModal(false)} />}
    </div>
  );
};

export default DetailsPage;
