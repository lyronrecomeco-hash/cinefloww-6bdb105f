import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Mic, Subtitles, Video, Globe, ChevronRight, AlertTriangle } from "lucide-react";
import CustomPlayer from "@/components/CustomPlayer";
import LyneflixIntro from "@/components/LyneflixIntro";
import IframeInterceptor from "@/components/IframeInterceptor";
import { saveWatchProgress, getWatchProgress } from "@/lib/watchProgress";

interface VideoSource {
  url: string;
  quality: string;
  provider: string;
  type: "mp4" | "m3u8";
}

type Phase = "audio-select" | "loading" | "playing" | "iframe-intercept" | "unavailable";

const AUDIO_OPTIONS = [
  { key: "dublado", icon: Mic, label: "Dublado PT-BR", description: "Áudio em português brasileiro" },
  { key: "legendado", icon: Subtitles, label: "Legendado", description: "Áudio original com legendas" },
  { key: "cam", icon: Video, label: "CAM", description: "Gravação de câmera" },
];

const WatchPage = () => {
  const { type, id } = useParams<{ type: string; id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const title = searchParams.get("title") || "Carregando...";
  const imdbId = searchParams.get("imdb") || null;
  const audioParam = searchParams.get("audio");
  const season = searchParams.get("s") ? Number(searchParams.get("s")) : undefined;
  const episode = searchParams.get("e") ? Number(searchParams.get("e")) : undefined;

  const prefetched = (location.state as any)?.prefetchedSource;

  const [sources, setSources] = useState<VideoSource[]>([]);
  const [phase, setPhase] = useState<Phase>(
    prefetched?.url ? "loading" : (audioParam ? "loading" : "audio-select")
  );

  // Handle prefetched source - skip intro entirely
  useEffect(() => {
    if (prefetched?.url && sources.length === 0) {
      setSources([{
        url: prefetched.url,
        quality: "auto",
        provider: prefetched.provider || "banco",
        type: (prefetched.type === "mp4" ? "mp4" : "m3u8") as "mp4" | "m3u8",
      }]);
      setPhase("playing");
    }
  }, []);

  const [iframeProxyUrl, setIframeProxyUrl] = useState<string | null>(null);
  const [selectedAudio, setSelectedAudio] = useState(audioParam || "");
  const [audioTypes, setAudioTypes] = useState<string[]>([]);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [savedTime, setSavedTime] = useState(0);
  const resumeChecked = useRef(false);
  const videoStartTime = useRef(0);
  const lastSaveTime = useRef(0);
  const extractionStarted = useRef(false);
  const extractionResult = useRef<{ url: string; type: string; provider: string } | null>(null);
  const [introComplete, setIntroComplete] = useState(false);

  const tmdbId = Number(id);
  const isMovie = type === "movie";
  const ct = isMovie ? "movie" : "tv";
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Force landscape on mobile when playing
  useEffect(() => {
    if (isMobile && phase === "playing") {
      try {
        (screen.orientation as any)?.lock?.("landscape").catch(() => {});
      } catch {}
    }
    return () => {
      try { (screen.orientation as any)?.unlock?.(); } catch {}
    };
  }, [isMobile, phase]);

  // Check resume
  useEffect(() => {
    if (resumeChecked.current || !id) return;
    resumeChecked.current = true;
    getWatchProgress(tmdbId, ct, season, episode).then((p) => {
      if (p && p.progress_seconds > 30 && !p.completed && p.duration_seconds > 0) {
        if (p.progress_seconds / p.duration_seconds < 0.9) {
          setSavedTime(p.progress_seconds);
          setShowResumePrompt(true);
        }
      }
    });
  }, [tmdbId, ct, season, episode, id]);

  // Load audio types
  useEffect(() => {
    const cType = type === "movie" ? "movie" : "series";
    supabase
      .from("content")
      .select("audio_type")
      .eq("tmdb_id", Number(id))
      .eq("content_type", cType)
      .maybeSingle()
      .then(({ data }) => {
        const dbTypes = data?.audio_type?.length ? data.audio_type : [];
        const merged = new Set([...dbTypes, "dublado", "legendado"]);
        setAudioTypes([...merged]);
      });
  }, [id, type]);

  // START extraction IMMEDIATELY when we have audio (parallel with intro)
  const retryCount = useRef(0);
  const tryExtraction = useCallback(async (skipCache = false) => {
    if (extractionStarted.current && !skipCache) return;
    extractionStarted.current = true;

    const cType = isMovie ? "movie" : "series";
    const aType = selectedAudio || "legendado";

    // 1. FAST: Check client-side cache first (direct DB query)
    if (!skipCache) {
      try {
        let query = supabase
          .from("video_cache")
          .select("video_url, video_type, provider")
          .eq("tmdb_id", Number(id))
          .eq("content_type", cType)
          .eq("audio_type", aType)
          .gt("expires_at", new Date().toISOString());

        if (season) query = query.eq("season", season);
        else query = query.is("season", null);
        if (episode) query = query.eq("episode", episode);
        else query = query.is("episode", null);

        const { data: cachedRows } = await query.order("created_at", { ascending: false }).limit(5);
        const cached = cachedRows?.[0] || null;
        if (cached?.video_url) {
          console.log("[WatchPage] Cache hit - instant play!");
          if (cached.video_type === "iframe-proxy") {
            setIframeProxyUrl(cached.video_url);
            setPhase("iframe-intercept");
            return;
          }
          const result = { url: cached.video_url, type: cached.video_type || "m3u8", provider: cached.provider || "cache" };
          extractionResult.current = result;
          if (introComplete) {
            setSources([{ url: result.url, quality: "auto", provider: result.provider, type: result.type === "mp4" ? "mp4" : "m3u8" }]);
            setPhase("playing");
          }
          return;
        }
      } catch { /* cache miss, continue */ }
    } else {
      // Delete stale cache entry before re-extraction
      console.log("[WatchPage] Deleting stale cache, re-extracting...");
      let delQuery = supabase
        .from("video_cache")
        .delete()
        .eq("tmdb_id", Number(id))
        .eq("content_type", cType)
        .eq("audio_type", aType);
      if (season) delQuery = delQuery.eq("season", season);
      else delQuery = delQuery.is("season", null);
      if (episode) delQuery = delQuery.eq("episode", episode);
      else delQuery = delQuery.is("episode", null);
      await delQuery;
    }

    // 2. Call extract-video edge function
    try {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 25000));
      const extractPromise = supabase.functions.invoke("extract-video", {
        body: { tmdb_id: Number(id), imdb_id: imdbId, content_type: cType, audio_type: aType, season, episode },
      });

      const { data, error: fnError } = await Promise.race([extractPromise, timeoutPromise]) as any;

      if (!fnError && data?.url) {
        if (data.type === "iframe-proxy") {
          setIframeProxyUrl(data.url);
          setPhase("iframe-intercept");
          return;
        }
        const result = { url: data.url, type: data.type || "m3u8", provider: data.provider || "banco" };
        extractionResult.current = result;
        if (introComplete) {
          setSources([{ url: result.url, quality: "auto", provider: result.provider, type: result.type === "mp4" ? "mp4" : "m3u8" }]);
          setPhase("playing");
        }
        return;
      }
    } catch { /* timeout or error */ }

    if (introComplete) setPhase("unavailable");
    else extractionResult.current = null; // mark as failed
  }, [id, imdbId, isMovie, selectedAudio, season, episode, introComplete]);

  // Auto-retry on playback error: delete cache and re-extract
  const handlePlaybackError = useCallback(() => {
    if (retryCount.current < 2) {
      retryCount.current++;
      console.log(`[WatchPage] Playback failed, retry ${retryCount.current}/2`);
      extractionStarted.current = false;
      setSources([]);
      setPhase("loading");
      setIntroComplete(true); // skip intro on retry
      tryExtraction(true); // skip cache, force re-extract
    } else {
      setPhase("unavailable");
    }
  }, [tryExtraction]);

  // Start extraction as soon as we have audio selected
  useEffect(() => {
    if (phase === "loading" && selectedAudio) {
      extractionStarted.current = false;
      extractionResult.current = undefined as any;
      tryExtraction();
    }
  }, [phase, selectedAudio, tryExtraction]);

  // When intro completes, check if extraction already finished
  const handleIntroComplete = useCallback(() => {
    setIntroComplete(true);
    const result = extractionResult.current;
    if (result && result.url) {
      setSources([{ url: result.url, quality: "auto", provider: result.provider, type: result.type === "mp4" ? "mp4" : "m3u8" }]);
      setPhase("playing");
    } else if (result === null) {
      // extraction failed
      setPhase("unavailable");
    }
    // else: extraction still in progress, will resolve via tryExtraction callback
  }, []);

  useEffect(() => {
    if (audioParam) {
      setSelectedAudio(audioParam);
      setPhase("loading");
    }
  }, [audioParam]);

  const goBack = () => navigate(-1);
  const subtitle = type === "tv" && season && episode ? `T${season} • E${episode}` : undefined;

  const handleResumeChoice = (resume: boolean) => {
    setShowResumePrompt(false);
    if (resume) videoStartTime.current = savedTime;
  };

  const handleAudioSelect = (audio: string) => {
    localStorage.setItem("cineflow_audio_pref", audio);
    setSelectedAudio(audio);
    setPhase("loading");
  };

  // ===== AUDIO SELECT =====
  if (phase === "audio-select") {
    const available = AUDIO_OPTIONS.filter(o => audioTypes.includes(o.key));
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
        <div className="relative w-full max-w-md">
          <button onClick={goBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
          <div className="bg-card/50 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-6 sm:p-8">
              <div className="mb-6">
                <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground">{title}</h2>
                {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
                <p className="text-sm text-muted-foreground mt-2">Escolha o tipo de áudio</p>
              </div>
              <div className="space-y-3">
                {available.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button key={opt.key} onClick={() => handleAudioSelect(opt.key)} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.08] hover:border-primary/30 transition-all duration-200 group">
                      <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/25 transition-colors">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <div className="text-left flex-1">
                        <p className="font-semibold text-sm text-foreground">{opt.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 pt-5 border-t border-white/10">
                <button onClick={() => handleAudioSelect("legendado")} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-muted-foreground hover:bg-white/10 transition-colors">
                  <Globe className="w-4 h-4" /> Pular e assistir legendado
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== RESUME PROMPT =====
  if (showResumePrompt) {
    const formatTime = (s: number) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);
      if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
      return `${m}:${sec.toString().padStart(2, "0")}`;
    };
    return (
      <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-4">
        <div className="bg-card/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 max-w-sm w-full text-center">
          <h3 className="font-display text-lg font-bold mb-2">Continuar de onde parou?</h3>
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <p className="text-sm text-muted-foreground mb-4">Você parou em {formatTime(savedTime)}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => handleResumeChoice(false)} className="px-5 py-2.5 rounded-xl bg-white/10 text-sm font-medium hover:bg-white/20 transition-colors">Do início</button>
            <button onClick={() => handleResumeChoice(true)} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">Continuar</button>
          </div>
        </div>
      </div>
    );
  }

  // ===== IFRAME INTERCEPT =====
  if (phase === "iframe-intercept" && iframeProxyUrl) {
    return (
      <div className="fixed inset-0 z-[100] bg-black">
        <IframeInterceptor
          proxyUrl={iframeProxyUrl}
          onVideoFound={async (url, vType) => {
            setSources([{ url, quality: "auto", provider: "playerflix", type: vType }]);
            setPhase("playing");
          }}
          onError={handlePlaybackError}
          onClose={goBack}
          title={title}
        />
      </div>
    );
  }

  // ===== LOADING: Show intro while extraction runs in parallel =====
  if (phase === "loading") {
    return (
      <LyneflixIntro
        onComplete={handleIntroComplete}
        skip={false}
      />
    );
  }

  // ===== PLAYING =====
  if (phase === "playing" && sources.length > 0) {
    return (
      <div className="fixed inset-0 z-[100] bg-black">
        <CustomPlayer
          sources={sources}
          title={title}
          subtitle={subtitle}
          startTime={videoStartTime.current || undefined}
          onClose={goBack}
          onError={() => setPhase("unavailable")}
          onProgress={(currentTime, dur) => {
            const now = Date.now();
            if (currentTime > 5 && dur > 0 && now - lastSaveTime.current > 10000) {
              lastSaveTime.current = now;
              saveWatchProgress({
                tmdb_id: tmdbId,
                content_type: ct,
                season,
                episode,
                progress_seconds: currentTime,
                duration_seconds: dur,
                completed: currentTime / dur > 0.9,
              });
            }
          }}
        />
      </div>
    );
  }

  // ===== UNAVAILABLE =====
  return (
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-4">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
        <span className="text-[100px] sm:text-[140px] font-black tracking-wider text-white select-none">LYNEFLIX</span>
      </div>
      <div className="relative bg-card/80 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-5">
          <AlertTriangle className="w-7 h-7 text-primary" />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">Ops! Tivemos um probleminha</h3>
        <p className="text-sm text-white/50 mb-6 leading-relaxed">
          Nossa equipe está ajustando a infraestrutura. Clique abaixo para avisar e daremos prioridade máxima ao seu conteúdo!
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              const btn = document.getElementById("watch-report-btn");
              if (btn) { btn.textContent = "✓ Equipe avisada!"; btn.classList.add("bg-green-600"); }
            }}
            id="watch-report-btn"
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all duration-200"
          >
            <AlertTriangle className="w-4 h-4" /> Avisar a equipe
          </button>
          <button onClick={goBack} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
        </div>
      </div>
    </div>
  );
};

export default WatchPage;