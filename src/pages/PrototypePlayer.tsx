import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { 
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, Lock, Unlock, ArrowLeft,
  Settings, ChevronUp, ChevronDown, Loader2
} from "lucide-react";
import Hls from "hls.js";
import { supabase } from "@/integrations/supabase/client";
import { signVideoUrl } from "@/lib/videoUrl";

const PrototypePlayer = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // State
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(params.get("title") || "");
  const [showSettings, setShowSettings] = useState(false);
  const [speed, setSpeed] = useState(1);

  const tmdbId = params.get("tmdb");
  const contentType = params.get("type") || "movie";
  const season = params.get("s");
  const episode = params.get("e");

  // Auto-hide controls
  const resetHideTimer = useCallback(() => {
    if (locked) return;
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 3500);
  }, [playing, locked]);

  // Load video
  useEffect(() => {
    if (!tmdbId) {
      setError("Nenhum conteúdo especificado");
      setLoading(false);
      return;
    }

    const loadVideo = async () => {
      setLoading(true);
      setError(null);
      try {
        const body: any = { tmdb_id: Number(tmdbId), content_type: contentType };
        if (season) body.season = Number(season);
        if (episode) body.episode = Number(episode);

        const { data, error: fnErr } = await supabase.functions.invoke("extract-video", { body });
        if (fnErr) throw fnErr;
        if (!data?.url) throw new Error("Conteúdo não encontrado");

        const finalUrl = await signVideoUrl(data.url);
        const video = videoRef.current!;

        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

        if (data.type === "m3u8" && Hls.isSupported()) {
          const hls = new Hls({
            maxBufferLength: 60,
            maxMaxBufferLength: 600,
            fragLoadingTimeOut: 15000,
            manifestLoadingTimeOut: 15000,
            fragLoadingMaxRetry: 10,
          });
          hls.loadSource(finalUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => { video.muted = true; setMuted(true); video.play().catch(() => {}); });
          });
          hls.on(Hls.Events.ERROR, (_, d) => {
            if (d.fatal) setError("Erro ao carregar stream");
          });
          hlsRef.current = hls;
        } else {
          video.src = finalUrl;
          video.load();
          video.onloadedmetadata = () => {
            video.play().catch(() => { video.muted = true; setMuted(true); video.play().catch(() => {}); });
          };
        }
      } catch (err: any) {
        setError(err?.message || "Falha ao carregar vídeo");
      }
    };

    loadVideo();

    return () => {
      if (hlsRef.current) hlsRef.current.destroy();
    };
  }, [tmdbId, contentType, season, episode]);

  // Video events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => { setPlaying(true); setLoading(false); };
    const onPause = () => setPlaying(false);
    const onTime = () => {
      setCurrent(video.currentTime);
      if (video.buffered.length > 0) setBuffered(video.buffered.end(video.buffered.length - 1));
    };
    const onDuration = () => setDuration(video.duration || 0);
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);
    const onError = () => setError("Erro de reprodução");

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("durationchange", onDuration);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onError);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("durationchange", onDuration);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onError);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (locked) return;
      const video = videoRef.current;
      if (!video) return;
      switch (e.key) {
        case " ": case "k": e.preventDefault(); playing ? video.pause() : video.play(); break;
        case "ArrowLeft": e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 10); break;
        case "ArrowRight": e.preventDefault(); video.currentTime = Math.min(duration, video.currentTime + 10); break;
        case "m": video.muted = !video.muted; setMuted(video.muted); break;
        case "f": toggleFullscreen(); break;
        case "l": setLocked(prev => !prev); break;
      }
      resetHideTimer();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [playing, duration, locked, resetHideTimer]);

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      setFullscreen(false);
    } else {
      await el.requestFullscreen();
      setFullscreen(true);
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (locked) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const video = videoRef.current;
    if (video && duration) video.currentTime = pct * duration;
  };

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}` : `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const changeSpeed = (newSpeed: number) => {
    setSpeed(newSpeed);
    if (videoRef.current) videoRef.current.playbackRate = newSpeed;
    setShowSettings(false);
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center select-none"
      onMouseMove={resetHideTimer}
      onClick={() => {
        if (locked) return;
        resetHideTimer();
      }}
    >
      {/* Video */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        preload="auto"
        referrerPolicy="no-referrer"
      />

      {/* Loading overlay */}
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <span className="text-sm text-white/70">Carregando...</span>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center space-y-4 p-6 max-w-md">
            <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto">
              <span className="text-2xl">⚠️</span>
            </div>
            <p className="text-lg font-semibold text-white">{error}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition-colors">
                Voltar
              </button>
              <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors">
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lock indicator */}
      {locked && (
        <div className="absolute inset-0 z-50" onClick={(e) => { e.stopPropagation(); }}>
          <button
            onClick={() => setLocked(false)}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-4 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white/80 hover:text-white hover:bg-black/70 transition-all"
          >
            <Lock className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* Controls overlay */}
      {!locked && (
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          {/* Top gradient */}
          <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/70 to-transparent" />

          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 px-4 sm:px-6 pt-4 sm:pt-5 flex items-center justify-between z-10">
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-white/80 hover:text-white transition-colors group">
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
              <span className="text-sm font-medium hidden sm:inline">Voltar</span>
            </button>
            <div className="text-center flex-1 mx-4">
              {title && <p className="text-sm sm:text-base font-semibold text-white truncate">{title}</p>}
              {season && episode && (
                <p className="text-[10px] sm:text-xs text-white/50">T{season} E{episode}</p>
              )}
            </div>
            <button onClick={() => setLocked(true)} className="p-2 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-all" title="Bloquear tela">
              <Unlock className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>

          {/* Center play/pause */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <button
              onClick={(e) => {
                e.stopPropagation();
                const video = videoRef.current;
                if (video) playing ? video.pause() : video.play();
              }}
              className="pointer-events-auto w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white hover:bg-white/20 hover:scale-110 transition-all shadow-2xl"
            >
              {playing ? <Pause className="w-7 h-7 sm:w-8 sm:h-8" /> : <Play className="w-7 h-7 sm:w-8 sm:h-8 ml-1" />}
            </button>
          </div>

          {/* Skip buttons */}
          <div className="absolute inset-0 flex items-center justify-between px-4 sm:px-8 pointer-events-none">
            <button
              onClick={(e) => { e.stopPropagation(); if (videoRef.current) videoRef.current.currentTime -= 10; }}
              className="pointer-events-auto p-3 rounded-full bg-black/30 backdrop-blur-sm text-white/60 hover:text-white hover:bg-black/50 transition-all"
            >
              <SkipBack className="w-5 h-5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); if (videoRef.current) videoRef.current.currentTime += 10; }}
              className="pointer-events-auto p-3 rounded-full bg-black/30 backdrop-blur-sm text-white/60 hover:text-white hover:bg-black/50 transition-all"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          {/* Bottom gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/80 to-transparent" />

          {/* Bottom controls */}
          <div className="absolute bottom-0 left-0 right-0 px-4 sm:px-6 pb-4 sm:pb-6 space-y-2 z-10">
            {/* Progress bar */}
            <div className="group cursor-pointer" onClick={seek}>
              <div className="relative w-full h-1 group-hover:h-2 rounded-full bg-white/20 transition-all overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-white/15 rounded-full" style={{ width: `${bufferPct}%` }} />
                <div className="absolute inset-y-0 left-0 bg-primary rounded-full shadow-lg shadow-primary/30" style={{ width: `${progressPct}%` }} />
              </div>
              {/* Thumb */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `${progressPct}%`, marginLeft: "-6px", marginTop: "-2px" }}
              />
            </div>

            {/* Time + actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => { const v = videoRef.current; if (v) playing ? v.pause() : v.play(); }}
                  className="text-white hover:text-primary transition-colors">
                  {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </button>

                {/* Volume */}
                <div className="flex items-center gap-1.5 group/vol">
                  <button onClick={() => { const v = videoRef.current; if (v) { v.muted = !v.muted; setMuted(v.muted); } }}
                    className="text-white/70 hover:text-white transition-colors">
                    {muted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
                  </button>
                  <input
                    type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setVolume(val);
                      if (videoRef.current) { videoRef.current.volume = val; videoRef.current.muted = val === 0; setMuted(val === 0); }
                    }}
                    className="w-0 group-hover/vol:w-20 transition-all opacity-0 group-hover/vol:opacity-100 accent-primary h-1"
                  />
                </div>

                <span className="text-xs text-white/60 tabular-nums hidden sm:inline">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Speed */}
                <div className="relative">
                  <button onClick={() => setShowSettings(!showSettings)}
                    className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-white text-xs font-medium transition-colors">
                    {speed}x
                  </button>
                  {showSettings && (
                    <div className="absolute bottom-full mb-2 right-0 bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl p-1.5 space-y-0.5 min-w-[80px]">
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map(s => (
                        <button key={s} onClick={() => changeSpeed(s)}
                          className={`w-full px-3 py-1.5 rounded-lg text-xs text-left transition-colors ${speed === s ? "bg-primary/20 text-primary" : "text-white/70 hover:bg-white/10 hover:text-white"}`}>
                          {s}x
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Fullscreen */}
                <button onClick={toggleFullscreen}
                  className="text-white/70 hover:text-white transition-colors">
                  {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrototypePlayer;
