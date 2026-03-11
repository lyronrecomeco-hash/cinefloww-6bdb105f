import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, Lock, Unlock, ArrowLeft,
  Gauge, PictureInPicture2, RotateCcw, Settings, Wifi,
  WifiOff, Signal, ChevronRight
} from "lucide-react";
import { usePlayerEngine, QualityLevel } from "@/hooks/usePlayerEngine";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const PrototypePlayer = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tmdbId = params.get("tmdb");
  const contentType = params.get("type") || "movie";
  const season = params.get("s");
  const episode = params.get("e");
  const titleParam = params.get("title") || "";

  const {
    videoRef, playing, loading, error, currentTime, duration, buffered,
    qualities, activeQuality, changeQuality, networkSpeed, resumed,
    setError, retryWithBackoff,
  } = usePlayerEngine({ tmdbId, contentType, season, episode });

  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"main" | "quality" | "speed">("main");
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const [seekIndicator, setSeekIndicator] = useState<{ side: "left" | "right"; seconds: number } | null>(null);
  const [showResumeToast, setShowResumeToast] = useState(false);

  // Resume toast
  useEffect(() => {
    if (resumed) {
      setShowResumeToast(true);
      const t = setTimeout(() => setShowResumeToast(false), 4000);
      return () => clearTimeout(t);
    }
  }, [resumed]);

  // ── Auto-hide controls ──
  const resetHideTimer = useCallback(() => {
    if (locked) return;
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (playing) { setShowControls(false); setShowSettings(false); }
    }, 3500);
  }, [playing, locked]);

  // ── Keyboard ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (locked) return;
      const v = videoRef.current;
      if (!v) return;
      switch (e.key.toLowerCase()) {
        case " ": case "k": e.preventDefault(); playing ? v.pause() : v.play(); break;
        case "arrowleft": case "j": e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 10); flashSeek("left", 10); break;
        case "arrowright": case "l": e.preventDefault(); v.currentTime = Math.min(duration, v.currentTime + 10); flashSeek("right", 10); break;
        case "arrowup": e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1); setVolume(v.volume); break;
        case "arrowdown": e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1); setVolume(v.volume); break;
        case "m": v.muted = !v.muted; setMuted(v.muted); break;
        case "f": toggleFullscreen(); break;
      }
      resetHideTimer();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [playing, duration, locked, resetHideTimer]);

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
    if (videoRef.current && duration) videoRef.current.currentTime = pct * duration;
  };

  const onProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(pct * duration);
    setHoverX(e.clientX - rect.left);
  };

  const fmt = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}` : `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferPct = duration > 0 ? (buffered / duration) * 100 : 0;

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
      const v = videoRef.current;
      if (v) {
        if (side === "left") { v.currentTime = Math.max(0, v.currentTime - 10); flashSeek("left", 10); }
        else { v.currentTime = Math.min(duration, v.currentTime + 10); flashSeek("right", 10); }
      }
    } else {
      tapSide.current = side;
      tapTimer.current = setTimeout(() => {
        tapTimer.current = null;
        const v = videoRef.current;
        if (v) playing ? v.pause() : v.play();
      }, 250);
    }
    resetHideTimer();
  };

  const NetworkIcon = networkSpeed === "high" ? Signal : networkSpeed === "medium" ? Wifi : WifiOff;
  const qualityLabel = activeQuality === -1
    ? "Auto"
    : qualities.find(q => q.index === activeQuality)?.label || "Auto";

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center select-none overflow-hidden"
      onMouseMove={resetHideTimer}
    >
      {/* Video */}
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
        <div className={`absolute top-1/2 -translate-y-1/2 ${seekIndicator.side === "left" ? "left-12" : "right-12"} pointer-events-none z-30`}>
          <div className="flex flex-col items-center gap-1.5 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-xl flex items-center justify-center">
              <RotateCcw className={`w-7 h-7 text-white ${seekIndicator.side === "right" ? "scale-x-[-1]" : ""}`} />
            </div>
            <span className="text-xs font-bold text-white/90 tabular-nums">{seekIndicator.seconds}s</span>
          </div>
        </div>
      )}

      {/* Resume toast */}
      {showResumeToast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl bg-primary/90 backdrop-blur-md text-primary-foreground text-sm font-medium shadow-2xl animate-fade-in">
          Continuando de onde você parou — {fmt(currentTime)}
        </div>
      )}

      {/* Loading */}
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="relative">
            <div className="w-[72px] h-[72px] rounded-full border-[3px] border-white/5 border-t-primary animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/95 backdrop-blur-lg z-50">
          <div className="text-center space-y-6 p-8 max-w-sm">
            <div className="w-20 h-20 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto">
              <WifiOff className="w-8 h-8 text-destructive" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">{error}</p>
              <p className="text-xs text-muted-foreground mt-1.5">O player tentará reconectar automaticamente</p>
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={() => navigate(-1)} className="px-5 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm hover:brightness-110 transition-all">
                Voltar
              </button>
              <button onClick={() => { setError(null); retryWithBackoff(); }} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:brightness-110 transition-all">
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
              className="group p-6 rounded-2xl bg-black/30 backdrop-blur-2xl border border-white/10 text-white/50 hover:text-white hover:border-primary/30 transition-all duration-300"
            >
              <Lock className="w-8 h-8 group-hover:scale-110 transition-transform" />
            </button>
            <span className="text-[10px] text-white/25 font-medium tracking-[0.2em] uppercase">Toque para desbloquear</span>
          </div>
        </div>
      )}

      {/* Controls */}
      {!locked && (
        <div
          className={`absolute inset-0 transition-all duration-500 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          onClick={handleVideoAreaClick}
        >
          {/* Top gradient */}
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/80 via-black/30 to-transparent pointer-events-none" />

          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 px-4 sm:px-6 pt-4 sm:pt-5 flex items-center gap-3 z-20" onClick={e => e.stopPropagation()}>
            <button onClick={() => navigate(-1)} className="group w-10 h-10 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
              <ArrowLeft className="w-[18px] h-[18px]" />
            </button>
            <div className="flex-1 min-w-0">
              {titleParam && <p className="text-sm sm:text-base font-semibold text-white truncate">{titleParam}</p>}
              {season && episode && (
                <p className="text-[10px] text-white/35 font-medium">T{season} · E{episode}</p>
              )}
            </div>

            {/* Network indicator */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] text-white/40">
              <NetworkIcon className="w-3 h-3" />
              <span className="hidden sm:inline">{qualityLabel}</span>
            </div>

            <button
              onClick={() => setLocked(true)}
              className="w-10 h-10 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
            >
              <Unlock className="w-[18px] h-[18px]" />
            </button>
          </div>

          {/* Center play */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            {!loading && (
              <button
                onClick={(e) => { e.stopPropagation(); const v = videoRef.current; if (v) playing ? v.pause() : v.play(); }}
                className="pointer-events-auto w-[76px] h-[76px] sm:w-20 sm:h-20 rounded-full bg-white/10 backdrop-blur-2xl border border-white/15 flex items-center justify-center text-white hover:bg-white/15 hover:scale-105 active:scale-95 transition-all duration-200 shadow-[0_8px_40px_rgba(0,0,0,0.6)]"
              >
                {playing ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
              </button>
            )}
          </div>

          {/* Bottom gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />

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
                  className="absolute -top-10 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-black/95 backdrop-blur-md border border-white/10 text-[11px] font-mono text-white pointer-events-none shadow-lg"
                  style={{ left: hoverX }}
                >
                  {fmt(hoverTime)}
                </div>
              )}
              <div className="relative w-full h-1.5 group-hover/bar:h-3 rounded-full bg-white/10 transition-all duration-200 overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-white/[0.06] rounded-full transition-all" style={{ width: `${bufferPct}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full transition-all bg-gradient-to-r from-primary to-primary/80" style={{ width: `${progressPct}%` }} />
              </div>
              <div
                className="absolute top-1/2 -translate-y-1/2 w-[14px] h-[14px] rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.5)] border-2 border-white scale-0 group-hover/bar:scale-100 transition-transform duration-150"
                style={{ left: `calc(${progressPct}% - 7px)` }}
              />
            </div>

            {/* Actions row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button onClick={() => { const v = videoRef.current; if (v) playing ? v.pause() : v.play(); }}
                  className="w-10 h-10 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-all">
                  {playing ? <Pause className="w-[18px] h-[18px]" /> : <Play className="w-[18px] h-[18px] ml-0.5" />}
                </button>

                <button onClick={() => { const v = videoRef.current; if (v) { v.currentTime -= 10; flashSeek("left", 10); } }}
                  className="w-10 h-10 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                  <SkipBack className="w-[18px] h-[18px]" />
                </button>
                <button onClick={() => { const v = videoRef.current; if (v) { v.currentTime += 10; flashSeek("right", 10); } }}
                  className="w-10 h-10 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                  <SkipForward className="w-[18px] h-[18px]" />
                </button>

                {/* Volume */}
                <div className="flex items-center gap-1 group/vol">
                  <button onClick={() => { const v = videoRef.current; if (v) { v.muted = !v.muted; setMuted(v.muted); } }}
                    className="w-10 h-10 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                    {muted || volume === 0 ? <VolumeX className="w-[18px] h-[18px]" /> : <Volume2 className="w-[18px] h-[18px]" />}
                  </button>
                  <div className="w-0 group-hover/vol:w-24 overflow-hidden transition-all duration-300">
                    <input
                      type="range" min="0" max="1" step="0.02" value={muted ? 0 : volume}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setVolume(val);
                        if (videoRef.current) { videoRef.current.volume = val; videoRef.current.muted = val === 0; setMuted(val === 0); }
                      }}
                      className="w-full accent-primary h-1 cursor-pointer"
                    />
                  </div>
                </div>

                <span className="text-[11px] text-white/40 tabular-nums font-mono hidden sm:inline ml-2">
                  {fmt(currentTime)} <span className="text-white/20">/</span> {fmt(duration)}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Settings panel */}
                <div className="relative">
                  <button
                    onClick={() => { setShowSettings(!showSettings); setSettingsTab("main"); }}
                    className={`w-10 h-10 rounded-xl backdrop-blur-sm border flex items-center justify-center transition-all ${
                      showSettings ? "bg-white/15 border-white/20 text-white" : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <Settings className={`w-[18px] h-[18px] transition-transform duration-300 ${showSettings ? "rotate-90" : ""}`} />
                  </button>

                  {showSettings && (
                    <div className="absolute bottom-full mb-2 right-0 w-56 bg-black/95 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
                      {settingsTab === "main" && (
                        <div className="p-1.5">
                          <button
                            onClick={() => setSettingsTab("quality")}
                            className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm text-white/80 hover:bg-white/10 transition-all"
                          >
                            <div className="flex items-center gap-2.5">
                              <Signal className="w-4 h-4 text-white/40" />
                              <span>Qualidade</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-white/40">
                              <span>{qualityLabel}</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </div>
                          </button>
                          <button
                            onClick={() => setSettingsTab("speed")}
                            className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm text-white/80 hover:bg-white/10 transition-all"
                          >
                            <div className="flex items-center gap-2.5">
                              <Gauge className="w-4 h-4 text-white/40" />
                              <span>Velocidade</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-white/40">
                              <span>{speed}x</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </div>
                          </button>
                        </div>
                      )}

                      {settingsTab === "quality" && (
                        <div>
                          <button onClick={() => setSettingsTab("main")} className="w-full flex items-center gap-2 px-4 py-3 text-xs text-white/50 hover:bg-white/5 border-b border-white/5">
                            <ArrowLeft className="w-3.5 h-3.5" /> Qualidade
                          </button>
                          <div className="p-1.5 max-h-48 overflow-y-auto">
                            {qualities.map(q => (
                              <button
                                key={q.index}
                                onClick={() => { changeQuality(q.index); setShowSettings(false); }}
                                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm transition-all ${
                                  activeQuality === q.index ? "bg-primary/20 text-primary" : "text-white/70 hover:bg-white/10"
                                }`}
                              >
                                <span>{q.label}</span>
                                {q.bitrate > 0 && <span className="text-[10px] text-white/25">{Math.round(q.bitrate / 1000)}k</span>}
                              </button>
                            ))}
                            {qualities.length === 0 && (
                              <p className="text-xs text-white/30 text-center py-3">Nenhuma qualidade disponível</p>
                            )}
                          </div>
                        </div>
                      )}

                      {settingsTab === "speed" && (
                        <div>
                          <button onClick={() => setSettingsTab("main")} className="w-full flex items-center gap-2 px-4 py-3 text-xs text-white/50 hover:bg-white/5 border-b border-white/5">
                            <ArrowLeft className="w-3.5 h-3.5" /> Velocidade
                          </button>
                          <div className="p-1.5">
                            {SPEEDS.map(s => (
                              <button
                                key={s}
                                onClick={() => { setSpeed(s); if (videoRef.current) videoRef.current.playbackRate = s; setShowSettings(false); }}
                                className={`w-full px-3.5 py-2.5 rounded-lg text-sm text-left transition-all ${
                                  speed === s ? "bg-primary/20 text-primary font-medium" : "text-white/70 hover:bg-white/10"
                                }`}
                              >
                                {s}x {s === 1 && <span className="text-white/25 text-xs ml-1">Normal</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* PiP */}
                <button onClick={togglePiP}
                  className="w-10 h-10 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all hidden sm:flex">
                  <PictureInPicture2 className="w-[18px] h-[18px]" />
                </button>

                {/* Fullscreen */}
                <button onClick={toggleFullscreen}
                  className="w-10 h-10 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                  {fullscreen ? <Minimize className="w-[18px] h-[18px]" /> : <Maximize className="w-[18px] h-[18px]" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cinematic vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.25) 100%)"
      }} />
    </div>
  );
};

export default PrototypePlayer;
