import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Hls from "hls.js";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipForward, SkipBack, Settings, Loader2, AlertTriangle,
  RefreshCw, ChevronRight, X, ArrowLeft, Mic, Subtitles,
  Video, Globe, Zap, PictureInPicture, Gauge, Captions,
} from "lucide-react";

interface VideoSource {
  url: string;
  quality: string;
  provider: string;
  type: "mp4" | "m3u8";
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const AUDIO_OPTIONS = [
  { key: "dublado", icon: Mic, label: "Dublado PT-BR", description: "Áudio em português brasileiro" },
  { key: "legendado", icon: Subtitles, label: "Legendado", description: "Áudio original com legendas" },
  { key: "cam", icon: Video, label: "CAM", description: "Gravação de câmera" },
];

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const formatTime = (s: number) => {
  if (!isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const PlayerPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const tmdbId = searchParams.get("id");
  const type = searchParams.get("type") || "movie";
  const title = searchParams.get("title") || "Reproduzindo...";
  const imdbId = searchParams.get("imdb") || null;
  const season = searchParams.get("s") ? Number(searchParams.get("s")) : undefined;
  const episode = searchParams.get("e") ? Number(searchParams.get("e")) : undefined;
  const audioParam = searchParams.get("audio");

  const subtitle = type === "tv" && season && episode ? `T${season} • E${episode}` : undefined;

  // State
  const [phase, setPhase] = useState<"audio-select" | "extracting" | "playing" | "error">(
    audioParam ? "extracting" : "audio-select"
  );
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [currentSourceIdx, setCurrentSourceIdx] = useState(0);
  const [selectedAudio, setSelectedAudio] = useState(audioParam || "");
  const [audioTypes, setAudioTypes] = useState<string[]>([]);
  const [extractionStatus, setExtractionStatus] = useState("Verificando cache...");
  const [dots, setDots] = useState("");

  // Player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout>>();
  const extractTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(true);
  const [playerError, setPlayerError] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"sources" | "speed" | "quality">("sources");
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const [hlsLevels, setHlsLevels] = useState<{ height: number; bitrate: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);

  const source = sources[currentSourceIdx];

  // ─── Load audio types ───
  useEffect(() => {
    if (!tmdbId) return;
    const cType = type === "movie" ? "movie" : "series";
    supabase
      .from("content")
      .select("audio_type")
      .eq("tmdb_id", Number(tmdbId))
      .eq("content_type", cType)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.audio_type?.length) setAudioTypes(data.audio_type);
        else setAudioTypes(["legendado"]);
      });
  }, [tmdbId, type]);

  // ─── Animated dots ───
  useEffect(() => {
    if (phase !== "extracting") return;
    const interval = setInterval(() => setDots(d => (d.length >= 3 ? "" : d + ".")), 500);
    return () => clearInterval(interval);
  }, [phase]);

  // ─── Auto-start if audio param ───
  useEffect(() => {
    if (audioParam && phase === "extracting") {
      startExtraction(audioParam);
    }
  }, [audioParam]);

  // ─── Block popups ───
  useEffect(() => {
    const orig = window.open;
    window.open = (() => null) as typeof window.open;
    return () => { window.open = orig; };
  }, []);

  // ─── Extraction ───
  const startExtraction = useCallback(async (audio: string) => {
    setSelectedAudio(audio);
    setPhase("extracting");
    setExtractionStatus("Verificando cache...");
    setSources([]);

    try {
      const { data, error } = await supabase.functions.invoke("extract-video", {
        body: {
          tmdb_id: Number(tmdbId),
          imdb_id: imdbId,
          content_type: type === "movie" ? "movie" : "series",
          audio_type: audio,
          season,
          episode,
        },
      });

      if (!error && data?.url) {
        setExtractionStatus(data.cached ? "Carregando do cache..." : "Fonte encontrada!");
        setSources([{
          url: data.url,
          quality: "auto",
          provider: "VidSrc",
          type: data.type === "mp4" ? "mp4" : "m3u8",
        }]);
        setTimeout(() => setPhase("playing"), 500);
        return;
      }

      setExtractionStatus("Extraindo via player...");
      startClientExtraction();
    } catch {
      setExtractionStatus("Extraindo via player...");
      startClientExtraction();
    }
  }, [tmdbId, imdbId, type, season, episode]);

  const startClientExtraction = useCallback(() => {
    const contentId = imdbId || tmdbId || "";
    const vidsrcUrl =
      type === "movie"
        ? `https://vidsrc.cc/v2/embed/movie/${contentId}`
        : `https://vidsrc.cc/v2/embed/tv/${contentId}/${season ?? 1}/${episode ?? 1}`;
    const proxyUrl = `${SUPABASE_URL}/functions/v1/proxy-player?url=${encodeURIComponent(vidsrcUrl)}`;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "__VIDEO_SOURCE__" && event.data.url) {
        const url = event.data.url as string;
        const isM3u8 = url.includes(".m3u8") || url.includes("/playlist") || url.includes("/master");
        const isMp4 = url.includes(".mp4");
        if (isM3u8 || isMp4) {
          setSources(prev => {
            if (prev.find(s => s.url === url)) return prev;
            const newSource: VideoSource = { url, quality: "auto", provider: "VidSrc", type: isM3u8 ? "m3u8" : "mp4" };
            if (prev.length === 0) {
              clearTimeout(extractTimeoutRef.current);
              setExtractionStatus("Fonte capturada!");
              setTimeout(() => setPhase("playing"), 600);
            }
            return [...prev, newSource];
          });
        }
      }
    };

    window.addEventListener("message", handler);

    // Create hidden iframe for interception
    const iframe = document.createElement("iframe");
    iframe.src = proxyUrl;
    iframe.className = "fixed w-0 h-0 opacity-0 pointer-events-none";
    iframe.sandbox.add("allow-scripts", "allow-same-origin", "allow-forms");
    iframe.allow = "autoplay; encrypted-media";
    document.body.appendChild(iframe);

    extractTimeoutRef.current = setTimeout(() => {
      setSources(prev => {
        if (prev.length === 0) setPhase("error");
        return prev;
      });
    }, 25000);

    return () => {
      window.removeEventListener("message", handler);
      clearTimeout(extractTimeoutRef.current);
      iframe.remove();
    };
  }, [tmdbId, imdbId, type, season, episode]);

  // ─── HLS / Video Attach ───
  const attachSource = useCallback((src: VideoSource) => {
    const video = videoRef.current;
    if (!video) return;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    setLoading(true);
    setPlayerError(false);
    setHlsLevels([]);
    setCurrentLevel(-1);

    if (src.type === "m3u8" && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false, xhrSetup: (xhr) => { xhr.withCredentials = false; } });
      hlsRef.current = hls;
      hls.loadSource(src.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        setLoading(false);
        setHlsLevels(data.levels.map(l => ({ height: l.height, bitrate: l.bitrate })));
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => setCurrentLevel(data.level));
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else { setPlayerError(true); setLoading(false); }
        }
      });
    } else if (src.type === "m3u8" && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src.url;
      video.addEventListener("loadedmetadata", () => { setLoading(false); video.play().catch(() => {}); }, { once: true });
    } else {
      video.src = src.url;
      video.addEventListener("loadeddata", () => { setLoading(false); video.play().catch(() => {}); }, { once: true });
    }
    video.addEventListener("error", () => { setPlayerError(true); setLoading(false); }, { once: true });
  }, []);

  useEffect(() => {
    if (phase === "playing" && source) attachSource(source);
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [phase, source, attachSource]);

  // ─── Video events ───
  useEffect(() => {
    if (phase !== "playing") return;
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) setBuffered(video.buffered.end(video.buffered.length - 1));
    };
    const onDur = () => setDuration(video.duration || 0);
    const onWait = () => setLoading(true);
    const onCan = () => setLoading(false);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("durationchange", onDur);
    video.addEventListener("waiting", onWait);
    video.addEventListener("canplay", onCan);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("durationchange", onDur);
      video.removeEventListener("waiting", onWait);
      video.removeEventListener("canplay", onCan);
    };
  }, [phase]);

  // ─── Controls visibility ───
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideControlsTimer.current);
    if (playing) hideControlsTimer.current = setTimeout(() => setShowControls(false), 3500);
  }, [playing]);

  useEffect(() => { if (phase === "playing") resetControlsTimer(); }, [playing, phase, resetControlsTimer]);

  // ─── Keyboard ───
  useEffect(() => {
    if (phase !== "playing") return;
    const handler = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;
      switch (e.key) {
        case " ": e.preventDefault(); playing ? video.pause() : video.play(); break;
        case "ArrowLeft": video.currentTime = Math.max(0, video.currentTime - 10); break;
        case "ArrowRight": video.currentTime = Math.min(duration, video.currentTime + 10); break;
        case "ArrowUp": e.preventDefault(); setVolume(v => { const nv = Math.min(1, v + 0.1); video.volume = nv; return nv; }); break;
        case "ArrowDown": e.preventDefault(); setVolume(v => { const nv = Math.max(0, v - 0.1); video.volume = nv; return nv; }); break;
        case "m": case "M": setMuted(m => { video.muted = !m; return !m; }); break;
        case "f": case "F": toggleFullscreen(); break;
        case "Escape": if (fullscreen) toggleFullscreen(); else goBack(); break;
      }
      resetControlsTimer();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, playing, duration, fullscreen, resetControlsTimer]);

  // ─── Actions ───
  const goBack = () => navigate(-1);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    playing ? video.pause() : video.play();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !muted;
    setMuted(!muted);
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) container.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
    else document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
  };

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {}
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    video.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  };

  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverTime(((e.clientX - rect.left) / rect.width) * duration);
    setHoverX(e.clientX - rect.left);
  };

  const changeSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
    setShowSettings(false);
  };

  const changeQuality = (level: number) => {
    if (hlsRef.current) hlsRef.current.currentLevel = level;
    setShowSettings(false);
  };

  const nextSource = () => {
    if (currentSourceIdx < sources.length - 1) setCurrentSourceIdx(i => i + 1);
  };

  // ═══════════════════════════════════════
  // RENDER: AUDIO SELECT
  // ═══════════════════════════════════════
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
                    <button key={opt.key} onClick={() => startExtraction(opt.key)}
                      className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.08] hover:border-primary/30 transition-all duration-200 group">
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
                <button onClick={() => startExtraction("legendado")}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-muted-foreground hover:bg-white/10 transition-colors">
                  <Globe className="w-4 h-4" /> Pular e assistir legendado
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // RENDER: EXTRACTING
  // ═══════════════════════════════════════
  if (phase === "extracting") {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-primary/10" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
            <div className="absolute inset-2 rounded-full border-4 border-transparent border-b-accent animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-bold mb-2 text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>}
          <p className="text-muted-foreground text-sm mb-1">{extractionStatus}{dots}</p>
          <p className="text-muted-foreground/50 text-xs">Preparando reprodução sem anúncios</p>
          <div className="mt-6 w-full max-w-xs mx-auto">
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-[extractProgress_25s_ease-out_forwards]" />
            </div>
          </div>
          <button onClick={goBack} className="mt-8 flex items-center gap-2 mx-auto text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
        </div>
        <style>{`@keyframes extractProgress { 0% { width: 5%; } 30% { width: 40%; } 60% { width: 65%; } 90% { width: 85%; } 100% { width: 95%; } }`}</style>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // RENDER: ERROR
  // ═══════════════════════════════════════
  if (phase === "error") {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-destructive/15 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-10 h-10 text-destructive" />
          </div>
          <h2 className="font-display text-2xl font-bold text-foreground mb-2">Falha na extração</h2>
          <p className="text-muted-foreground text-sm mb-8">Não foi possível extrair o vídeo. Tente novamente ou escolha outro áudio.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => startExtraction(selectedAudio || "legendado")}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
              <Zap className="w-4 h-4" /> Tentar novamente
            </button>
            <button onClick={() => { setPhase("audio-select"); setSources([]); }}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-foreground text-sm font-medium hover:bg-white/10 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Escolher áudio
            </button>
          </div>
          <button onClick={goBack} className="mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors">
            Voltar à página anterior
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // RENDER: PLAYING
  // ═══════════════════════════════════════
  return (
    <div ref={containerRef} className="fixed inset-0 z-[100] bg-black group"
      onMouseMove={resetControlsTimer} style={{ cursor: showControls ? "default" : "none" }}>
      <video ref={videoRef} className="w-full h-full object-contain" playsInline crossOrigin="anonymous"
        onClick={togglePlay} onDoubleClick={toggleFullscreen} />

      {/* Loading spinner */}
      {loading && !playerError && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
            <p className="text-white/60 text-sm font-medium">Carregando...</p>
          </div>
        </div>
      )}

      {/* Player error */}
      {playerError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
          <div className="text-center p-8 max-w-md">
            <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Fonte indisponível</h3>
            <p className="text-sm text-white/50 mb-1">{source?.provider} — {source?.quality}</p>
            <p className="text-xs text-white/30 mb-6">{currentSourceIdx + 1} de {sources.length} fontes</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <button onClick={() => attachSource(source)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors">
                <RefreshCw className="w-4 h-4" /> Tentar novamente
              </button>
              {currentSourceIdx < sources.length - 1 && (
                <button onClick={nextSource}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                  <ChevronRight className="w-4 h-4" /> Próxima fonte
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Big play button when paused */}
      {!playing && !loading && !playerError && (
        <button onClick={togglePlay} className="absolute inset-0 flex items-center justify-center z-5">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center hover:bg-white/25 hover:scale-110 transition-all duration-300 shadow-2xl">
            <Play className="w-9 h-9 sm:w-11 sm:h-11 text-white fill-white ml-1" />
          </div>
        </button>
      )}

      {/* ─── Controls Overlay ─── */}
      <div className={`absolute inset-0 z-10 transition-opacity duration-500 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          <div className="flex items-start justify-between p-4 sm:p-6">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button onClick={goBack} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors flex-shrink-0">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div className="min-w-0">
                <h2 className="text-white text-base sm:text-xl font-bold truncate drop-shadow-lg">{title}</h2>
                {subtitle && <p className="text-white/50 text-xs sm:text-sm truncate">{subtitle}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-20 pb-4 sm:pb-6 px-4 sm:px-6">
          {/* Progress bar */}
          <div className="relative h-1.5 rounded-full bg-white/15 cursor-pointer mb-4 group/progress hover:h-2 transition-all"
            onClick={seek} onMouseMove={handleProgressHover} onMouseLeave={() => setHoverTime(null)}>
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/20 transition-all" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary shadow-lg shadow-primary/50 opacity-0 group-hover/progress:opacity-100 transition-all scale-0 group-hover/progress:scale-100 ring-2 ring-white/30" />
            </div>
            {hoverTime !== null && (
              <div className="absolute -top-9 bg-black/95 text-white text-xs px-2.5 py-1.5 rounded-lg font-mono border border-white/10" style={{ left: `${hoverX}px`, transform: "translateX(-50%)" }}>
                {formatTime(hoverTime)}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            {/* Left controls */}
            <div className="flex items-center gap-0.5 sm:gap-1.5">
              <button onClick={togglePlay} className="p-2.5 hover:bg-white/10 rounded-xl transition-colors">
                {playing ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white fill-white" />}
              </button>
              <button onClick={() => { if (videoRef.current) videoRef.current.currentTime -= 10; }}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors hidden sm:flex">
                <SkipBack className="w-5 h-5 text-white" />
              </button>
              <button onClick={() => { if (videoRef.current) videoRef.current.currentTime += 10; }}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors hidden sm:flex">
                <SkipForward className="w-5 h-5 text-white" />
              </button>

              {/* Volume */}
              <div className="flex items-center gap-0.5 group/vol">
                <button onClick={toggleMute} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                  {muted || volume === 0 ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
                </button>
                <div className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-300">
                  <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
                    onChange={(e) => { const v = parseFloat(e.target.value); setVolume(v); if (videoRef.current) videoRef.current.volume = v; setMuted(v === 0); }}
                    className="w-full h-1 accent-primary cursor-pointer" />
                </div>
              </div>

              <span className="text-white/60 text-xs sm:text-sm ml-2 font-mono tabular-nums select-none">
                {formatTime(currentTime)} <span className="text-white/30">/</span> {formatTime(duration)}
              </span>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-0.5 sm:gap-1">
              {/* Speed badge */}
              {playbackSpeed !== 1 && (
                <span className="text-[10px] text-primary font-bold bg-primary/15 px-2 py-1 rounded-lg">{playbackSpeed}x</span>
              )}

              {/* Settings menu */}
              <div className="relative">
                <button onClick={() => setShowSettings(!showSettings)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                  <Settings className={`w-5 h-5 text-white transition-transform duration-300 ${showSettings ? "rotate-90" : ""}`} />
                </button>
                {showSettings && (
                  <div className="absolute bottom-full right-0 mb-3 w-64 bg-black/95 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                    {/* Tabs */}
                    <div className="flex border-b border-white/10">
                      {(["sources", "speed", "quality"] as const).map(tab => (
                        <button key={tab} onClick={() => setSettingsTab(tab)}
                          className={`flex-1 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${settingsTab === tab ? "text-primary border-b-2 border-primary" : "text-white/40 hover:text-white/60"}`}>
                          {tab === "sources" ? "Fontes" : tab === "speed" ? "Velocidade" : "Qualidade"}
                        </button>
                      ))}
                    </div>
                    <div className="p-2 max-h-52 overflow-y-auto scrollbar-hide">
                      {settingsTab === "sources" && sources.map((s, i) => (
                        <button key={i} onClick={() => { setCurrentSourceIdx(i); setShowSettings(false); }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-colors ${i === currentSourceIdx ? "bg-primary/15 text-primary" : "text-white/70 hover:bg-white/10"}`}>
                          <span className="font-medium">{s.provider}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-lg bg-white/10 font-mono">{s.type.toUpperCase()} • {s.quality}</span>
                        </button>
                      ))}
                      {settingsTab === "speed" && PLAYBACK_SPEEDS.map(speed => (
                        <button key={speed} onClick={() => changeSpeed(speed)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-colors ${playbackSpeed === speed ? "bg-primary/15 text-primary" : "text-white/70 hover:bg-white/10"}`}>
                          <span className="font-medium">{speed === 1 ? "Normal" : `${speed}x`}</span>
                          {playbackSpeed === speed && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </button>
                      ))}
                      {settingsTab === "quality" && (
                        <>
                          <button onClick={() => changeQuality(-1)}
                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-colors ${currentLevel === -1 ? "bg-primary/15 text-primary" : "text-white/70 hover:bg-white/10"}`}>
                            <span className="font-medium">Auto</span>
                            {currentLevel === -1 && <div className="w-2 h-2 rounded-full bg-primary" />}
                          </button>
                          {hlsLevels.map((l, i) => (
                            <button key={i} onClick={() => changeQuality(i)}
                              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-colors ${currentLevel === i ? "bg-primary/15 text-primary" : "text-white/70 hover:bg-white/10"}`}>
                              <span className="font-medium">{l.height}p</span>
                              <span className="text-[10px] text-white/30">{(l.bitrate / 1000).toFixed(0)} kbps</span>
                            </button>
                          ))}
                          {hlsLevels.length === 0 && source?.type === "mp4" && (
                            <p className="text-[11px] text-white/30 px-3 py-2">Qualidade única (MP4)</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* PiP */}
              <button onClick={togglePiP} className="p-2 hover:bg-white/10 rounded-xl transition-colors hidden sm:flex">
                <PictureInPicture className="w-5 h-5 text-white" />
              </button>

              {/* Fullscreen */}
              <button onClick={toggleFullscreen} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                {fullscreen ? <Minimize className="w-5 h-5 text-white" /> : <Maximize className="w-5 h-5 text-white" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerPage;
