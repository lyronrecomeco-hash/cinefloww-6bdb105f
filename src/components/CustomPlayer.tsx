import { useState, useEffect, useRef, useCallback } from "react";
import Hls from "hls.js";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipForward, SkipBack, Settings, Loader2, AlertTriangle,
  RefreshCw, ChevronRight, X,
} from "lucide-react";

interface VideoSource {
  url: string;
  quality: string;
  provider: string;
  type: "mp4" | "m3u8";
}

interface CustomPlayerProps {
  sources: VideoSource[];
  title: string;
  subtitle?: string;
  startTime?: number;
  onClose?: () => void;
  onError?: () => void;
  onProgress?: (currentTime: number, duration: number) => void;
}

const CustomPlayer = ({ sources, title, subtitle, startTime, onClose, onError, onProgress }: CustomPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout>>();
  const progressRef = useRef<HTMLDivElement>(null);

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
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);

  const source = sources[currentSourceIdx];

  const attachSource = useCallback((src: VideoSource) => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    setLoading(true);
    setError(false);

    // Remove crossOrigin for mp4 to avoid CORS issues with direct streams
    if (src.type === "mp4") {
      video.removeAttribute("crossorigin");
    } else {
      video.crossOrigin = "anonymous";
    }

    if (src.type === "m3u8" && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        startLevel: 0, // Start with lowest quality for instant playback
        abrEwmaDefaultEstimate: 3000000,
        abrBandWidthUpFactor: 0.8,
        abrBandWidthFactor: 0.9,
        maxBufferLength: 15, // Smaller initial buffer = faster start
        maxMaxBufferLength: 60,
        maxBufferSize: 30 * 1000 * 1000,
        maxBufferHole: 0.3,
        startFragPrefetch: true,
        testBandwidth: false, // Skip bandwidth test for faster start
        progressive: true,
        backBufferLength: 30,
        fragLoadingTimeOut: 12000,
        fragLoadingMaxRetry: 4,
        fragLoadingRetryDelay: 500,
        manifestLoadingTimeOut: 8000,
        manifestLoadingMaxRetry: 3,
        levelLoadingTimeOut: 8000,
        levelLoadingMaxRetry: 3,
        // Aggressive fast start
        highBufferWatchdogPeriod: 1,
        nudgeMaxRetry: 5,
        xhrSetup: (xhr) => { xhr.withCredentials = false; },
      });
      hlsRef.current = hls;
      hls.loadSource(src.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            console.warn("[HLS] Network error, retrying...");
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            console.warn("[HLS] Media error, recovering...");
            hls.recoverMediaError();
          } else {
            setError(true);
            setLoading(false);
          }
        }
      });
      hls.on(Hls.Events.FRAG_LOADED, () => { if (loading) setLoading(false); });
    } else if (src.type === "m3u8" && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src.url;
      video.addEventListener("loadedmetadata", () => { setLoading(false); video.play().catch(() => {}); }, { once: true });
    } else {
      video.preload = "auto";
      video.src = src.url;
      video.addEventListener("loadeddata", () => { setLoading(false); video.play().catch(() => {}); }, { once: true });
      video.addEventListener("canplay", () => { if (loading) { setLoading(false); video.play().catch(() => {}); } }, { once: true });
    }

    video.addEventListener("error", () => { setError(true); setLoading(false); }, { once: true });
  }, []);

  useEffect(() => {
    if (source) attachSource(source);
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [source, attachSource]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) setBuffered(video.buffered.end(video.buffered.length - 1));
      onProgress?.(video.currentTime, video.duration || 0);
    };
    const onDurationChange = () => {
      setDuration(video.duration || 0);
      // Seek to startTime once duration is known
      if (startTime && video.duration > 0 && video.currentTime < 5) {
        video.currentTime = startTime;
      }
    };
    const onWaiting = () => setLoading(true);
    const onCanPlay = () => setLoading(false);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
    };
  }, [startTime, onProgress]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideControlsTimer.current);
    if (playing) {
      hideControlsTimer.current = setTimeout(() => setShowControls(false), 3500);
    }
  }, [playing]);

  useEffect(() => { resetControlsTimer(); }, [playing, resetControlsTimer]);

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
        case "Escape": if (fullscreen) toggleFullscreen(); else onClose?.(); break;
      }
      resetControlsTimer();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [playing, duration, fullscreen, resetControlsTimer, onClose]);

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

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  const toggleFullscreen = () => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container) return;

    // iOS: use webkit fullscreen on video element
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

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
    }
  };

  // Listen for iOS webkit fullscreen events
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

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    video.currentTime = pct * duration;
  };

  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    setHoverTime(pct * duration);
    setHoverX(e.clientX - rect.left);
  };

  const nextSource = () => {
    if (currentSourceIdx < sources.length - 1) {
      setCurrentSourceIdx(i => i + 1);
    } else {
      onError?.();
    }
  };

  const formatTime = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black group"
      onMouseMove={resetControlsTimer}
      onClick={(e) => {
        // Click anywhere on the container to toggle play/pause
        // but not if clicking on controls
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('input') || target.closest('[data-controls]')) return;
        togglePlay();
      }}
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('input') || target.closest('[data-controls]')) return;
        toggleFullscreen();
      }}
      style={{ cursor: showControls ? "default" : "none" }}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
      />

      {/* Loading — premium minimal spinner */}
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/80">
          <div className="flex flex-col items-center gap-5">
            <div className="lyneflix-spinner" />
            <span className="lyneflix-text text-xl sm:text-2xl font-bold tracking-wider select-none">
              LYNEFLIX
            </span>
          </div>
        </div>
      )}

      {/* Error - Friendly modal */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
          <div className="lyneflix-loader mb-8 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-5">
            <span className="text-[120px] font-black tracking-wider select-none text-white">LYNEFLIX</span>
          </div>
          <div className="relative text-center p-8 max-w-sm bg-card/80 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-5">
              <Settings className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Ops! Tivemos um probleminha</h3>
            <p className="text-sm text-white/50 mb-6 leading-relaxed">
              Nossa equipe está mexendo na infraestrutura. Clique abaixo para avisar e daremos prioridade máxima!
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  // Send report to content_requests or similar
                  const msg = `Player error: ${title} (source: ${source?.provider})`;
                  navigator.clipboard?.writeText(msg).catch(() => {});
                  // Visual feedback
                  const btn = document.getElementById("report-btn");
                  if (btn) { btn.textContent = "✓ Equipe avisada!"; btn.classList.add("bg-green-600"); }
                }}
                id="report-btn"
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all duration-200"
              >
                <AlertTriangle className="w-4 h-4" /> Avisar a equipe
              </button>
              <div className="flex gap-2">
                <button onClick={() => attachSource(source)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors">
                  <RefreshCw className="w-4 h-4" /> Tentar de novo
                </button>
                {onClose && (
                  <button onClick={onClose} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 text-white/70 text-sm font-medium hover:bg-white/10 transition-colors">
                    Voltar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Center play on pause */}
      {!playing && !loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-5 pointer-events-none">
          <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Play className="w-9 h-9 text-white fill-white ml-1" />
          </div>
        </div>
      )}

      <div data-controls className={`absolute inset-0 z-10 transition-opacity duration-500 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        {/* Top gradient + title + close */}
        <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          <div className="flex items-start justify-between p-4 sm:p-6">
            <div className="min-w-0 flex-1">
              <h2 className="text-white text-lg sm:text-xl font-bold truncate drop-shadow-lg">{title}</h2>
              {subtitle && <p className="text-white/50 text-xs sm:text-sm mt-0.5 truncate">{subtitle}</p>}
            </div>
            {onClose && (
              <button onClick={onClose} className="ml-4 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors flex-shrink-0">
                <X className="w-5 h-5 text-white" />
              </button>
            )}
          </div>
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-16 pb-4 sm:pb-6 px-4 sm:px-6">
          {/* Progress bar */}
          <div
            ref={progressRef}
            className="relative h-1 rounded-full bg-white/20 cursor-pointer mb-4 group/progress hover:h-1.5 transition-all"
            onClick={seek}
            onMouseMove={handleProgressHover}
            onMouseLeave={() => setHoverTime(null)}
          >
            {/* Buffered */}
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/25 transition-all" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
            {/* Progress */}
            <div className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary shadow-lg shadow-primary/50 opacity-0 group-hover/progress:opacity-100 transition-opacity scale-0 group-hover/progress:scale-100" />
            </div>
            {/* Hover preview time */}
            {hoverTime !== null && (
              <div className="absolute -top-8 bg-black/90 text-white text-xs px-2 py-1 rounded-md font-mono" style={{ left: `${hoverX}px`, transform: "translateX(-50%)" }}>
                {formatTime(hoverTime)}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 sm:gap-2">
              <button onClick={togglePlay} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                {playing ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white fill-white" />}
              </button>
              <button onClick={() => { const v = videoRef.current; if (v) v.currentTime -= 10; }} className="p-2 hover:bg-white/10 rounded-lg transition-colors hidden sm:flex">
                <SkipBack className="w-5 h-5 text-white" />
              </button>
              <button onClick={() => { const v = videoRef.current; if (v) v.currentTime += 10; }} className="p-2 hover:bg-white/10 rounded-lg transition-colors hidden sm:flex">
                <SkipForward className="w-5 h-5 text-white" />
              </button>
              
              <div className="flex items-center gap-1 group/vol">
                <button onClick={toggleMute} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                  {muted || volume === 0 ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
                </button>
                <div className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-300">
                  <input
                    type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
                    onChange={(e) => { const v = parseFloat(e.target.value); setVolume(v); if (videoRef.current) videoRef.current.volume = v; setMuted(v === 0); }}
                    className="w-full h-1 accent-primary cursor-pointer"
                  />
                </div>
              </div>

              <span className="text-white/70 text-xs sm:text-sm ml-2 font-mono tabular-nums">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {/* Source selector */}
              {sources.length > 1 && (
                <div className="relative">
                  <button onClick={() => setShowSettings(!showSettings)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                    <Settings className="w-5 h-5 text-white" />
                  </button>
                  {showSettings && (
                    <div className="absolute bottom-full right-0 mb-2 w-56 bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl p-2 max-h-60 overflow-y-auto">
                      <p className="text-[10px] text-white/40 uppercase font-semibold px-3 mb-1 tracking-wider">Fontes ({sources.length})</p>
                      {sources.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => { setCurrentSourceIdx(i); setShowSettings(false); }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                            i === currentSourceIdx ? "bg-primary/20 text-primary" : "text-white/70 hover:bg-white/10"
                          }`}
                        >
                          <span className="font-medium">{s.provider}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 font-mono">{s.type.toUpperCase()} • {s.quality}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button onClick={toggleFullscreen} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                {fullscreen ? <Minimize className="w-5 h-5 text-white" /> : <Maximize className="w-5 h-5 text-white" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomPlayer;
