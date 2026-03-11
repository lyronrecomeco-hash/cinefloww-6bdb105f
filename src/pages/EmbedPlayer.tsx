/**
 * EmbedPlayer — Standalone player for iframe embedding.
 * Route: /embed?tmdb=X&type=movie|tv&title=Y&s=1&e=1
 * This is PrototypePlayer stripped to essentials for external embed use.
 */
import { useSearchParams } from "react-router-dom";
import { usePlayerEngine } from "@/hooks/usePlayerEngine";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, RotateCcw, Settings2, Gauge, ChevronUp, RefreshCw
} from "lucide-react";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const EmbedPlayer = () => {
  const [params] = useSearchParams();
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

  const [showControls, setShowControls] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);
  const [showQuality, setShowQuality] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (state.playing) { setShowControls(false); setShowSpeed(false); setShowQuality(false); }
    }, 3000);
  }, [state.playing]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case " ": case "k": e.preventDefault(); controls.togglePlay(); break;
        case "arrowleft": e.preventDefault(); controls.seekRelative(-10); break;
        case "arrowright": e.preventDefault(); controls.seekRelative(10); break;
        case "f": toggleFullscreen(); break;
        case "m": controls.toggleMute(); break;
      }
      resetHideTimer();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [state.playing, resetHideTimer, controls]);

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) { await document.exitFullscreen(); setFullscreen(false); }
    else { await el.requestFullscreen(); setFullscreen(true); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
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

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center select-none overflow-hidden"
      onMouseMove={resetHideTimer}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        preload="auto"
        // @ts-ignore
        referrerPolicy="no-referrer"
      />

      {/* Loading */}
      {state.loading && !state.error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 rounded-full border-[3px] border-white/10 border-t-[#e50914] animate-spin" />
        </div>
      )}

      {/* Stall */}
      {state.isStalled && !state.error && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/80 backdrop-blur-md border border-white/10">
            <RefreshCw className="w-3 h-3 text-[#e50914] animate-spin" />
            <span className="text-[10px] text-white/60">Reconectando...</span>
          </div>
        </div>
      )}

      {/* Error */}
      {state.error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90">
          <div className="text-center space-y-4 p-6">
            <span className="text-2xl">⚠️</span>
            <p className="text-sm text-white">{state.error}</p>
            <button onClick={() => controls.retryLoad()} className="px-4 py-2 rounded-lg bg-[#e50914] text-white text-sm font-medium hover:brightness-110 transition-all">
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Controls */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={() => controls.togglePlay()}
      >
        <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />

        {/* Title */}
        <div className="absolute top-0 left-0 right-0 px-4 pt-3 z-20" onClick={e => e.stopPropagation()}>
          {title && <p className="text-xs sm:text-sm font-medium text-white/80 truncate">{title}</p>}
          {season && episode && <p className="text-[9px] text-white/40">T{season} · E{episode}</p>}
        </div>

        {/* Center play */}
        {!state.loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <button
              onClick={e => { e.stopPropagation(); controls.togglePlay(); }}
              className="pointer-events-auto w-16 h-16 rounded-full bg-white/10 backdrop-blur-xl border border-white/15 flex items-center justify-center text-white hover:bg-white/15 transition-all"
            >
              {state.playing ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-0.5" />}
            </button>
          </div>
        )}

        {/* Bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-3 space-y-2 z-20" onClick={e => e.stopPropagation()}>
          {/* Progress */}
          <div className="group/bar cursor-pointer relative" onClick={seek} onMouseMove={onProgressHover} onMouseLeave={() => setHoverTime(null)}>
            {hoverTime !== null && (
              <div className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded bg-black/90 text-[10px] font-mono text-white pointer-events-none" style={{ left: hoverX }}>
                {fmt(hoverTime)}
              </div>
            )}
            <div className="relative w-full h-1 group-hover/bar:h-2 rounded-full bg-white/15 transition-all overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-white/10 rounded-full" style={{ width: `${bufferPct}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-[#e50914]" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <button onClick={controls.togglePlay} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-all">
                {state.playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <button onClick={() => controls.seekRelative(-10)} className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white transition-all">
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => controls.seekRelative(10)} className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white transition-all">
                <SkipForward className="w-3.5 h-3.5" />
              </button>
              <button onClick={controls.toggleMute} className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white transition-all">
                {state.muted || state.volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
              <span className="text-[10px] text-white/40 tabular-nums font-mono ml-1">
                {fmt(state.currentTime)} / {fmt(state.duration)}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {/* Quality */}
              {state.qualities.length > 1 && (
                <div className="relative">
                  <button onClick={() => { setShowQuality(!showQuality); setShowSpeed(false); }} className="h-7 px-2 flex items-center gap-1 text-[10px] text-white/50 hover:text-white transition-all">
                    <Settings2 className="w-3 h-3" />
                  </button>
                  {showQuality && (
                    <div className="absolute bottom-full mb-1 right-0 bg-black/95 backdrop-blur-xl border border-white/10 rounded-lg p-0.5 min-w-[110px] shadow-2xl max-h-48 overflow-y-auto">
                      <button onClick={() => { controls.setQuality(-1); setShowQuality(false); }} className={`w-full px-2.5 py-1.5 rounded text-[10px] text-left ${state.currentQuality === -1 ? "text-[#e50914]" : "text-white/60 hover:text-white"}`}>
                        Auto
                      </button>
                      {[...state.qualities].sort((a, b) => b.height - a.height).map(q => (
                        <button key={q.index} onClick={() => { controls.setQuality(q.index); setShowQuality(false); }} className={`w-full px-2.5 py-1.5 rounded text-[10px] text-left ${state.currentQuality === q.index ? "text-[#e50914]" : "text-white/60 hover:text-white"}`}>
                          {q.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Speed */}
              <div className="relative">
                <button onClick={() => { setShowSpeed(!showSpeed); setShowQuality(false); }} className={`h-7 px-2 flex items-center gap-1 text-[10px] transition-all ${state.speed !== 1 ? "text-[#e50914]" : "text-white/50 hover:text-white"}`}>
                  <Gauge className="w-3 h-3" />{state.speed}x
                </button>
                {showSpeed && (
                  <div className="absolute bottom-full mb-1 right-0 bg-black/95 backdrop-blur-xl border border-white/10 rounded-lg p-0.5 min-w-[80px] shadow-2xl">
                    {SPEEDS.map(s => (
                      <button key={s} onClick={() => { controls.setSpeed(s); setShowSpeed(false); }} className={`w-full px-2.5 py-1.5 rounded text-[10px] text-left ${state.speed === s ? "text-[#e50914]" : "text-white/60 hover:text-white"}`}>
                        {s}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={toggleFullscreen} className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white transition-all">
                {fullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Branding watermark */}
      <div className="absolute bottom-1 right-2 pointer-events-none z-30 opacity-30">
        <span className="text-[8px] font-bold text-white tracking-widest">LYNEPLAY</span>
      </div>
    </div>
  );
};

export default EmbedPlayer;
