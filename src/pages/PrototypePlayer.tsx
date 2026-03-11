import { useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, Lock, Unlock, ArrowLeft,
  Gauge, PictureInPicture2, RotateCcw, Settings2,
  Wifi, WifiOff, RefreshCw, ChevronUp
} from "lucide-react";
import { usePlayerEngine } from "@/hooks/usePlayerEngine";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const PrototypePlayer = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const title = params.get("title") || "";
  const season = params.get("s");
  const episode = params.get("e");

  const { videoRef, state, controls } = usePlayerEngine({
    tmdbId: params.get("tmdb"),
    contentType: params.get("type") || "movie",
    season,
    episode,
  });

  const [locked, setLocked] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);
  const [showQuality, setShowQuality] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const [seekIndicator, setSeekIndicator] = useState<{ side: "left" | "right"; seconds: number } | null>(null);

  // ── Auto-hide controls ──
  const resetHideTimer = useCallback(() => {
    if (locked) return;
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (state.playing) { setShowControls(false); setShowSpeed(false); setShowQuality(false); }
    }, 3000);
  }, [state.playing, locked]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (locked) return;
      switch (e.key.toLowerCase()) {
        case " ": case "k": e.preventDefault(); controls.togglePlay(); break;
        case "arrowleft": case "j": e.preventDefault(); controls.seekRelative(-10); flashSeek("left", 10); break;
        case "arrowright": e.preventDefault(); controls.seekRelative(10); flashSeek("right", 10); break;
        case "arrowup": e.preventDefault(); controls.setVolume(Math.min(1, state.volume + 0.1)); break;
        case "arrowdown": e.preventDefault(); controls.setVolume(Math.max(0, state.volume - 0.1)); break;
        case "m": controls.toggleMute(); break;
        case "f": toggleFullscreen(); break;
        case "l": setLocked(prev => !prev); break;
      }
      resetHideTimer();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [state.playing, state.volume, locked, resetHideTimer, controls]);

  const flashSeek = (side: "left" | "right", seconds: number) => {
    setSeekIndicator({ side, seconds });
    setTimeout(() => setSeekIndicator(null), 600);
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) { await document.exitFullscreen(); setFullscreen(false); }
    else { await el.requestFullscreen(); setFullscreen(true); }
  };

  const togglePiP = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await v.requestPictureInPicture();
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (locked) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (state.duration) controls.seekTo(pct * state.duration);
  };

  const onProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(pct * state.duration);
    setHoverX(e.clientX - rect.left);
  };

  const fmt = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}` : `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progressPct = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
  const bufferPct = state.duration > 0 ? (state.buffered / state.duration) * 100 : 0;

  // ── Double-tap seek (mobile) ──
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapSide = useRef<"left" | "right" | null>(null);

  const handleVideoAreaClick = (e: React.MouseEvent) => {
    if (locked) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const side = x < rect.width / 2 ? "left" : "right";

    if (tapTimer.current && tapSide.current === side) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      if (side === "left") { controls.seekRelative(-10); flashSeek("left", 10); }
      else { controls.seekRelative(10); flashSeek("right", 10); }
    } else {
      tapSide.current = side;
      tapTimer.current = setTimeout(() => {
        tapTimer.current = null;
        controls.togglePlay();
      }, 250);
    }
    resetHideTimer();
  };

  // Quality label helper
  const qualityLabel = state.currentQuality === -1
    ? `Auto${state.qualities.length > 0 && state.qualities[state.currentQuality] ? ` (${state.qualities[state.currentQuality].label})` : ""}`
    : state.qualities[state.currentQuality]?.label || "Auto";

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center select-none overflow-hidden"
      onMouseMove={resetHideTimer}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        preload="auto"
        // @ts-ignore
        referrerPolicy="no-referrer"
      />

      {/* Seek flash indicators */}
      {seekIndicator && (
        <div className={`absolute top-1/2 -translate-y-1/2 ${seekIndicator.side === "left" ? "left-12" : "right-12"} pointer-events-none animate-fade-in`}>
          <div className="flex flex-col items-center gap-1 text-white/90">
            <RotateCcw className={`w-8 h-8 ${seekIndicator.side === "right" ? "scale-x-[-1]" : ""}`} />
            <span className="text-xs font-bold">{seekIndicator.seconds}s</span>
          </div>
        </div>
      )}

      {/* Loading */}
      {state.loading && !state.error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-[3px] border-white/10 border-t-primary animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Play className="w-5 h-5 text-white/40" />
            </div>
          </div>
        </div>
      )}

      {/* Stall recovery indicator */}
      {state.isStalled && !state.error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-black/80 backdrop-blur-md border border-white/10">
            <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
            <span className="text-xs text-white/70">Reconectando...</span>
          </div>
        </div>
      )}

      {/* Retry counter */}
      {state.retryCount > 0 && state.loading && !state.error && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <span className="text-[10px] text-white/40 font-mono">Tentativa {state.retryCount}/5</span>
        </div>
      )}

      {/* Error */}
      {state.error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm">
          <div className="text-center space-y-5 p-8 max-w-sm">
            <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
              <span className="text-3xl">⚠️</span>
            </div>
            <p className="text-base font-semibold text-white">{state.error}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => navigate(-1)} className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/80 text-sm hover:bg-white/10 transition-all">
                Voltar
              </button>
              <button onClick={() => controls.retryLoad()} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:brightness-110 transition-all">
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lock overlay */}
      {locked && (
        <div className="absolute inset-0 z-50" onClick={e => e.stopPropagation()}>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3">
            <button
              onClick={() => setLocked(false)}
              className="group p-5 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 text-white/60 hover:text-white hover:border-primary/30 hover:bg-black/60 transition-all duration-300"
            >
              <Lock className="w-7 h-7 group-hover:scale-110 transition-transform" />
            </button>
            <span className="text-[11px] text-white/30 font-medium tracking-wider uppercase">Toque para desbloquear</span>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      {!locked && (
        <div
          className={`absolute inset-0 transition-all duration-500 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          onClick={handleVideoAreaClick}
        >
          {/* Top gradient */}
          <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-black/80 via-black/30 to-transparent pointer-events-none" />

          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 px-4 sm:px-6 pt-4 sm:pt-5 flex items-center gap-3 z-20" onClick={e => e.stopPropagation()}>
            <button onClick={() => navigate(-1)} className="group flex items-center gap-2 text-white/70 hover:text-white transition-all">
              <div className="w-9 h-9 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center group-hover:bg-white/10 transition-all">
                <ArrowLeft className="w-4 h-4" />
              </div>
            </button>
            <div className="flex-1 min-w-0">
              {title && <p className="text-sm sm:text-base font-semibold text-white truncate">{title}</p>}
              {season && episode && (
                <p className="text-[10px] text-white/40 font-medium">Temporada {season} · Episódio {episode}</p>
              )}
            </div>

            {/* Network speed badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
              {state.networkSpeed > 0 ? <Wifi className="w-3 h-3 text-green-400/70" /> : <WifiOff className="w-3 h-3 text-white/30" />}
              <span className="text-[10px] text-white/40 font-mono">{state.networkSpeed > 0 ? `${state.networkSpeed} Mbps` : "—"}</span>
            </div>

            <button
              onClick={() => setLocked(true)}
              className="w-9 h-9 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
              title="Bloquear tela (L)"
            >
              <Unlock className="w-4 h-4" />
            </button>
          </div>

          {/* Center play/pause */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            {!state.loading && (
              <button
                onClick={(e) => { e.stopPropagation(); controls.togglePlay(); }}
                className="pointer-events-auto w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-full bg-white/10 backdrop-blur-2xl border border-white/15 flex items-center justify-center text-white hover:bg-white/15 hover:scale-105 active:scale-95 transition-all duration-200 shadow-[0_0_60px_rgba(0,0,0,0.5)]"
              >
                {state.playing ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
              </button>
            )}
          </div>

          {/* Bottom gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-36 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

          {/* Bottom controls */}
          <div className="absolute bottom-0 left-0 right-0 px-4 sm:px-6 pb-4 sm:pb-6 space-y-3 z-20" onClick={e => e.stopPropagation()}>
            {/* Progress bar */}
            <div
              className="group/bar cursor-pointer relative"
              onClick={seek}
              onMouseMove={onProgressHover}
              onMouseLeave={() => setHoverTime(null)}
            >
              {hoverTime !== null && (
                <div
                  className="absolute -top-9 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-black/90 backdrop-blur-sm border border-white/10 text-[11px] font-mono text-white pointer-events-none"
                  style={{ left: hoverX }}
                >
                  {fmt(hoverTime)}
                </div>
              )}
              <div className="relative w-full h-1.5 group-hover/bar:h-2.5 rounded-full bg-white/15 transition-all duration-200 overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-white/10 rounded-full transition-all" style={{ width: `${bufferPct}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full transition-all bg-gradient-to-r from-primary via-primary to-primary/80" style={{ width: `${progressPct}%` }} />
              </div>
              <div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary shadow-[0_0_12px_rgba(var(--primary),0.5)] border-2 border-white scale-0 group-hover/bar:scale-100 transition-transform duration-150"
                style={{ left: `calc(${progressPct}% - 8px)` }}
              />
            </div>

            {/* Actions row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <button onClick={controls.togglePlay}
                  className="w-9 h-9 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-all">
                  {state.playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                <button onClick={() => { controls.seekRelative(-10); flashSeek("left", 10); }}
                  className="w-9 h-9 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                  <SkipBack className="w-4 h-4" />
                </button>
                <button onClick={() => { controls.seekRelative(10); flashSeek("right", 10); }}
                  className="w-9 h-9 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                  <SkipForward className="w-4 h-4" />
                </button>

                {/* Volume */}
                <div className="flex items-center gap-1.5 group/vol">
                  <button onClick={controls.toggleMute}
                    className="w-9 h-9 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                    {state.muted || state.volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <div className="w-0 group-hover/vol:w-24 overflow-hidden transition-all duration-300">
                    <input
                      type="range" min="0" max="1" step="0.02" value={state.muted ? 0 : state.volume}
                      onChange={(e) => controls.setVolume(parseFloat(e.target.value))}
                      className="w-full accent-primary h-1 cursor-pointer"
                    />
                  </div>
                </div>

                <span className="text-[11px] text-white/50 tabular-nums font-mono hidden sm:inline ml-1">
                  {fmt(state.currentTime)} <span className="text-white/25">/</span> {fmt(state.duration)}
                </span>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Quality selector */}
                {state.qualities.length > 1 && (
                  <div className="relative">
                    <button
                      onClick={() => { setShowQuality(!showQuality); setShowSpeed(false); }}
                      className="h-9 px-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center gap-1.5 text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-all"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{state.currentQuality === -1 ? "Auto" : state.qualities[state.currentQuality]?.label}</span>
                    </button>
                    {showQuality && (
                      <div className="absolute bottom-full mb-2 right-0 bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl p-1 min-w-[130px] shadow-2xl max-h-64 overflow-y-auto">
                        <button
                          onClick={() => { controls.setQuality(-1); setShowQuality(false); }}
                          className={`w-full px-3 py-2 rounded-lg text-xs text-left font-medium transition-all flex items-center justify-between ${
                            state.currentQuality === -1 ? "bg-primary/20 text-primary" : "text-white/60 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          Auto (ABR)
                          {state.currentQuality === -1 && <ChevronUp className="w-3 h-3" />}
                        </button>
                        {state.qualities.sort((a, b) => b.height - a.height).map(q => (
                          <button
                            key={q.index}
                            onClick={() => { controls.setQuality(q.index); setShowQuality(false); }}
                            className={`w-full px-3 py-2 rounded-lg text-xs text-left font-medium transition-all flex items-center justify-between ${
                              state.currentQuality === q.index ? "bg-primary/20 text-primary" : "text-white/60 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            {q.label}
                            <span className="text-white/20 text-[10px]">{Math.round(q.bitrate / 1000)}k</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Speed */}
                <div className="relative">
                  <button
                    onClick={() => { setShowSpeed(!showSpeed); setShowQuality(false); }}
                    className={`h-9 px-3 rounded-xl backdrop-blur-sm border flex items-center gap-1.5 text-xs font-medium transition-all ${
                      state.speed !== 1
                        ? "bg-primary/15 border-primary/30 text-primary"
                        : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <Gauge className="w-3.5 h-3.5" />
                    {state.speed}x
                  </button>
                  {showSpeed && (
                    <div className="absolute bottom-full mb-2 right-0 bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl p-1 min-w-[100px] shadow-2xl">
                      {SPEEDS.map(s => (
                        <button
                          key={s}
                          onClick={() => { controls.setSpeed(s); setShowSpeed(false); }}
                          className={`w-full px-3 py-2 rounded-lg text-xs text-left font-medium transition-all ${
                            state.speed === s ? "bg-primary/20 text-primary" : "text-white/60 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          {s}x {s === 1 && <span className="text-white/30 ml-1">Normal</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* PiP */}
                <button onClick={togglePiP}
                  className="w-9 h-9 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all hidden sm:flex"
                  title="Picture-in-Picture">
                  <PictureInPicture2 className="w-4 h-4" />
                </button>

                {/* Fullscreen */}
                <button onClick={toggleFullscreen}
                  className="w-9 h-9 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
                  title="Tela cheia (F)">
                  {fullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cinematic vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.3) 100%)"
      }} />
    </div>
  );
};

export default PrototypePlayer;
