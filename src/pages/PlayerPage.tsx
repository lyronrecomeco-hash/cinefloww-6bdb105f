import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate, useParams } from "react-router-dom";
import Hls from "hls.js";
import { supabase } from "@/integrations/supabase/client";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipForward, SkipBack, Settings, AlertTriangle,
  RefreshCw, ChevronRight, ArrowLeft, PictureInPicture,
} from "lucide-react";
import { saveWatchProgress, getWatchProgress } from "@/lib/watchProgress";

interface VideoSource {
  url: string;
  quality: string;
  provider: string;
  type: "mp4" | "m3u8";
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const formatTime = (s: number) => {
  if (!isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const DEMO_SOURCES: VideoSource[] = [
  { url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", quality: "auto", provider: "Demo HLS", type: "m3u8" },
  { url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", quality: "720p", provider: "Demo MP4", type: "mp4" },
];

const PlayerPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const params = useParams<{ type?: string; id?: string }>();

  const title = searchParams.get("title") || "CineFlow Player";
  const subtitle = searchParams.get("subtitle") || undefined;
  const videoUrl = searchParams.get("url");
  const videoType = (searchParams.get("type") as "mp4" | "m3u8") || "m3u8";
  const tmdbId = params.id ? Number(params.id) : (searchParams.get("tmdb") ? Number(searchParams.get("tmdb")) : undefined);
  const contentType = params.type || searchParams.get("ct") || "movie";
  const season = searchParams.get("s") ? Number(searchParams.get("s")) : undefined;
  const episode = searchParams.get("e") ? Number(searchParams.get("e")) : undefined;
  const nextEpUrl = searchParams.get("next") || null;

  const [bankSources, setBankSources] = useState<VideoSource[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankTitle, setBankTitle] = useState(title);

  // If accessed via /player/:type/:id, fetch from video_cache
  useEffect(() => {
    if (!params.id || !params.type) return;
    setBankLoading(true);
    const load = async () => {
      const cType = params.type === "movie" ? "movie" : "series";
      // Get video from cache
      const { data: cached } = await supabase
        .from("video_cache")
        .select("video_url, video_type, provider")
        .eq("tmdb_id", Number(params.id))
        .eq("content_type", cType)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .maybeSingle();

      if (cached) {
        setBankSources([{
          url: cached.video_url,
          quality: "auto",
          provider: cached.provider || "banco",
          type: (cached.video_type === "mp4" ? "mp4" : "m3u8") as "mp4" | "m3u8",
        }]);
      }

      // Get title from content table
      const { data: content } = await supabase
        .from("content")
        .select("title")
        .eq("tmdb_id", Number(params.id))
        .eq("content_type", cType)
        .maybeSingle();

      if (content?.title) setBankTitle(content.title);
      setBankLoading(false);
    };
    load();
  }, [params.id, params.type]);

  const sources: VideoSource[] = bankSources.length > 0
    ? bankSources
    : videoUrl
      ? [{ url: videoUrl, quality: "auto", provider: "Stream", type: videoType }]
      : DEMO_SOURCES;

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout>>();
  const progressSaveTimer = useRef<ReturnType<typeof setInterval>>();
  const resumeChecked = useRef(false);

  const [currentSourceIdx, setCurrentSourceIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"sources" | "speed" | "quality">("sources");
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const [hlsLevels, setHlsLevels] = useState<{ height: number; bitrate: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [savedTime, setSavedTime] = useState(0);

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const source = sources[currentSourceIdx];

  // Auto-fullscreen on mobile
  useEffect(() => {
    if (isMobile && containerRef.current && !document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setFullscreen(true)).catch(() => {});
    }
  }, [isMobile]);

  // Save progress periodically
  useEffect(() => {
    if (!tmdbId) return;
    progressSaveTimer.current = setInterval(() => {
      const v = videoRef.current;
      if (v && v.currentTime > 5 && v.duration > 0) {
        saveWatchProgress({
          tmdb_id: tmdbId,
          content_type: contentType,
          season,
          episode,
          progress_seconds: v.currentTime,
          duration_seconds: v.duration,
          completed: v.currentTime / v.duration > 0.9,
        });
      }
    }, 10000);
    return () => clearInterval(progressSaveTimer.current);
  }, [tmdbId, contentType, season, episode]);

  // Check resume on load
  useEffect(() => {
    if (!tmdbId || resumeChecked.current) return;
    resumeChecked.current = true;
    getWatchProgress(tmdbId, contentType, season, episode).then((p) => {
      if (p && p.progress_seconds > 30 && !p.completed && p.duration_seconds > 0) {
        const pct = p.progress_seconds / p.duration_seconds;
        if (pct < 0.9) {
          setSavedTime(p.progress_seconds);
          setShowResumePrompt(true);
        }
      }
    });
  }, [tmdbId, contentType, season, episode]);

  const handleResume = (resume: boolean) => {
    setShowResumePrompt(false);
    if (resume && videoRef.current) {
      videoRef.current.currentTime = savedTime;
    }
  };

  // HLS / Video Attach
  const attachSource = useCallback((src: VideoSource) => {
    const video = videoRef.current;
    if (!video) return;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    setLoading(true);
    setError(false);
    setHlsLevels([]);
    setCurrentLevel(-1);

    // Remove crossOrigin for mp4 to avoid CORS issues
    if (src.type === "mp4") {
      video.removeAttribute("crossorigin");
    } else {
      video.crossOrigin = "anonymous";
    }

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
          else { setError(true); setLoading(false); }
        }
      });
    } else if (src.type === "m3u8" && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src.url;
      video.addEventListener("loadedmetadata", () => { setLoading(false); video.play().catch(() => {}); }, { once: true });
    } else {
      video.src = src.url;
      video.addEventListener("loadeddata", () => { setLoading(false); video.play().catch(() => {}); }, { once: true });
    }
    video.addEventListener("error", () => { setError(true); setLoading(false); }, { once: true });
  }, []);

  useEffect(() => {
    if (source) attachSource(source);
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [source, attachSource]);

  // Video events
  useEffect(() => {
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
  }, []);

  // Controls visibility
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideControlsTimer.current);
    if (playing) hideControlsTimer.current = setTimeout(() => setShowControls(false), 3500);
  }, [playing]);

  useEffect(() => { resetControlsTimer(); }, [playing, resetControlsTimer]);

  // Keyboard
  useEffect(() => {
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
  }, [playing, duration, fullscreen, resetControlsTimer]);

  const goBack = () => {
    // Save progress before leaving
    const v = videoRef.current;
    if (v && tmdbId && v.currentTime > 5) {
      saveWatchProgress({
        tmdb_id: tmdbId,
        content_type: contentType,
        season,
        episode,
        progress_seconds: v.currentTime,
        duration_seconds: v.duration || 0,
        completed: v.duration > 0 && v.currentTime / v.duration > 0.9,
      });
    }
    navigate(-1);
  };

  const togglePlay = () => { const v = videoRef.current; if (v) playing ? v.pause() : v.play(); };
  const toggleMute = () => { const v = videoRef.current; if (v) { v.muted = !muted; setMuted(!muted); } };

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  const toggleFullscreen = () => {
    const c = containerRef.current;
    const video = videoRef.current;
    if (!c) return;

    if (isIOS && video) {
      try {
        if ((video as any).webkitDisplayingFullscreen) {
          (video as any).webkitExitFullscreen?.();
        } else {
          (video as any).webkitEnterFullscreen?.();
        }
      } catch {}
      return;
    }

    if (!document.fullscreenElement) c.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
    else document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isIOS) return;
    const onBegin = () => setFullscreen(true);
    const onEnd = () => setFullscreen(false);
    video.addEventListener("webkitbeginfullscreen", onBegin);
    video.addEventListener("webkitendfullscreen", onEnd);
    return () => {
      video.removeEventListener("webkitbeginfullscreen", onBegin);
      video.removeEventListener("webkitendfullscreen", onEnd);
    };
  }, [isIOS]);

  const togglePiP = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {}
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
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

  const goNextEpisode = () => {
    if (nextEpUrl) {
      const v = videoRef.current;
      if (v && tmdbId) {
        saveWatchProgress({
          tmdb_id: tmdbId, content_type: contentType, season, episode,
          progress_seconds: v.currentTime, duration_seconds: v.duration || 0, completed: true,
        });
      }
      navigate(nextEpUrl, { replace: true });
    }
  };

  return (
    <div ref={containerRef} className="fixed inset-0 z-[100] bg-black group"
      onMouseMove={resetControlsTimer} onTouchStart={resetControlsTimer}
      style={{ cursor: showControls ? "default" : "none" }}>
      <video ref={videoRef} className="w-full h-full object-contain" playsInline
        onClick={togglePlay} onDoubleClick={toggleFullscreen} />

      {/* Resume prompt */}
      {showResumePrompt && (
        <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/70">
          <div className="bg-card/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 max-w-sm mx-4 text-center">
            <h3 className="font-display text-lg font-bold mb-2">Continuar de onde parou?</h3>
            <p className="text-sm text-muted-foreground mb-4">Você parou em {formatTime(savedTime)}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => handleResume(false)} className="px-5 py-2.5 rounded-xl bg-white/10 text-sm font-medium hover:bg-white/20 transition-colors">
                Começar do início
              </button>
              <button onClick={() => handleResume(true)} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
            <p className="text-white/60 text-sm font-medium">Carregando...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
          <div className="text-center p-6 sm:p-8 max-w-md mx-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 sm:w-8 sm:h-8 text-destructive" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white mb-2">Fonte indisponível</h3>
            <p className="text-sm text-white/50 mb-1">{source?.provider} — {source?.quality}</p>
            <p className="text-xs text-white/30 mb-6">{currentSourceIdx + 1} de {sources.length} fontes</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <button onClick={() => attachSource(source)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors">
                <RefreshCw className="w-4 h-4" /> Tentar novamente
              </button>
              {currentSourceIdx < sources.length - 1 && (
                <button onClick={nextSource} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                  <ChevronRight className="w-4 h-4" /> Próxima fonte
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Big play button */}
      {!playing && !loading && !error && !showResumePrompt && (
        <button onClick={togglePlay} className="absolute inset-0 flex items-center justify-center z-5">
          <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center hover:bg-white/25 hover:scale-110 transition-all duration-300 shadow-2xl">
            <Play className="w-7 h-7 sm:w-9 sm:h-9 lg:w-11 lg:h-11 text-white fill-white ml-1" />
          </div>
        </button>
      )}

      {/* Controls */}
      <div className={`absolute inset-0 z-10 transition-opacity duration-500 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        {/* Top */}
        <div className="absolute top-0 left-0 right-0 h-24 sm:h-28 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          <div className="flex items-start justify-between p-3 sm:p-4 lg:p-6">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <button onClick={goBack} className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors flex-shrink-0">
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </button>
              <div className="min-w-0">
                <h2 className="text-white text-sm sm:text-base lg:text-xl font-bold truncate drop-shadow-lg">{title}</h2>
                {subtitle && <p className="text-white/50 text-[10px] sm:text-xs lg:text-sm truncate">{subtitle}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-16 sm:pt-20 pb-3 sm:pb-4 lg:pb-6 px-3 sm:px-4 lg:px-6">
          {/* Progress */}
          <div className="relative h-1 sm:h-1.5 rounded-full bg-white/15 cursor-pointer mb-3 sm:mb-4 group/progress hover:h-2 transition-all"
            onClick={seek} onMouseMove={handleProgressHover} onMouseLeave={() => setHoverTime(null)}>
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/20 transition-all" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-primary shadow-lg shadow-primary/50 opacity-0 group-hover/progress:opacity-100 transition-all scale-0 group-hover/progress:scale-100 ring-2 ring-white/30" />
            </div>
            {hoverTime !== null && (
              <div className="absolute -top-8 sm:-top-9 bg-black/95 text-white text-[10px] sm:text-xs px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg font-mono border border-white/10" style={{ left: `${hoverX}px`, transform: "translateX(-50%)" }}>
                {formatTime(hoverTime)}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-0.5 sm:gap-1.5">
              <button onClick={togglePlay} className="p-2 sm:p-2.5 hover:bg-white/10 rounded-xl transition-colors">
                {playing ? <Pause className="w-5 h-5 sm:w-6 sm:h-6 text-white" /> : <Play className="w-5 h-5 sm:w-6 sm:h-6 text-white fill-white" />}
              </button>
              <button onClick={() => { if (videoRef.current) videoRef.current.currentTime -= 10; }} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-xl transition-colors">
                <SkipBack className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </button>
              <button onClick={() => { if (videoRef.current) videoRef.current.currentTime += 10; }} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-xl transition-colors">
                <SkipForward className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </button>
              {!isMobile && (
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
              )}
              <span className="text-white/60 text-[10px] sm:text-xs lg:text-sm ml-1 sm:ml-2 font-mono tabular-nums select-none">
                {formatTime(currentTime)} <span className="text-white/30">/</span> {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-0.5 sm:gap-1">
              {/* Next episode button */}
              {nextEpUrl && (
                <button onClick={goNextEpisode} className="flex items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-[10px] sm:text-xs font-medium text-white">
                  <SkipForward className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Próximo</span>
                </button>
              )}
              {playbackSpeed !== 1 && (
                <span className="text-[10px] text-primary font-bold bg-primary/15 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg">{playbackSpeed}x</span>
              )}
              <div className="relative">
                <button onClick={() => setShowSettings(!showSettings)} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-xl transition-colors">
                  <Settings className={`w-4 h-4 sm:w-5 sm:h-5 text-white transition-transform duration-300 ${showSettings ? "rotate-90" : ""}`} />
                </button>
                {showSettings && (
                  <div className="absolute bottom-full right-0 mb-2 sm:mb-3 w-52 sm:w-64 bg-black/95 backdrop-blur-2xl border border-white/10 rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl">
                    <div className="flex border-b border-white/10">
                      {(["sources", "speed", "quality"] as const).map(tab => (
                        <button key={tab} onClick={() => setSettingsTab(tab)}
                          className={`flex-1 py-2 sm:py-2.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider transition-colors ${settingsTab === tab ? "text-primary border-b-2 border-primary" : "text-white/40 hover:text-white/60"}`}>
                          {tab === "sources" ? "Fontes" : tab === "speed" ? "Velocidade" : "Qualidade"}
                        </button>
                      ))}
                    </div>
                    <div className="p-1.5 sm:p-2 max-h-48 sm:max-h-52 overflow-y-auto scrollbar-hide">
                      {settingsTab === "sources" && sources.map((s, i) => (
                        <button key={i} onClick={() => { setCurrentSourceIdx(i); setShowSettings(false); }}
                          className={`w-full flex items-center justify-between px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs transition-colors ${i === currentSourceIdx ? "bg-primary/15 text-primary" : "text-white/70 hover:bg-white/10"}`}>
                          <span className="font-medium">{s.provider}</span>
                          <span className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-lg bg-white/10 font-mono">{s.type.toUpperCase()} • {s.quality}</span>
                        </button>
                      ))}
                      {settingsTab === "speed" && PLAYBACK_SPEEDS.map(speed => (
                        <button key={speed} onClick={() => changeSpeed(speed)}
                          className={`w-full flex items-center justify-between px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs transition-colors ${playbackSpeed === speed ? "bg-primary/15 text-primary" : "text-white/70 hover:bg-white/10"}`}>
                          <span className="font-medium">{speed === 1 ? "Normal" : `${speed}x`}</span>
                          {playbackSpeed === speed && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </button>
                      ))}
                      {settingsTab === "quality" && (
                        <>
                          <button onClick={() => changeQuality(-1)}
                            className={`w-full flex items-center justify-between px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs transition-colors ${currentLevel === -1 ? "bg-primary/15 text-primary" : "text-white/70 hover:bg-white/10"}`}>
                            <span className="font-medium">Auto</span>
                            {currentLevel === -1 && <div className="w-2 h-2 rounded-full bg-primary" />}
                          </button>
                          {hlsLevels.map((l, i) => (
                            <button key={i} onClick={() => changeQuality(i)}
                              className={`w-full flex items-center justify-between px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs transition-colors ${currentLevel === i ? "bg-primary/15 text-primary" : "text-white/70 hover:bg-white/10"}`}>
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
              {!isMobile && (
                <button onClick={togglePiP} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-xl transition-colors">
                  <PictureInPicture className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </button>
              )}
              <button onClick={toggleFullscreen} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-xl transition-colors">
                {fullscreen ? <Minimize className="w-4 h-4 sm:w-5 sm:h-5 text-white" /> : <Maximize className="w-4 h-4 sm:w-5 sm:h-5 text-white" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerPage;
