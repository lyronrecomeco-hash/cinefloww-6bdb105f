/**
 * UniversalEmbed — Public embed player accepting direct video sources.
 * Route: /embed/v2?src=URL&type=m3u8|mp4&poster=URL&title=X&subtitle=X&autoplay=1&muted=0&startAt=120
 * Also accepts: ?p=BASE64_PAYLOAD (encoded payload mode)
 *
 * This is the public, white-label embed — NO TMDB, NO catalog dependency.
 */
import { useSearchParams } from "react-router-dom";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import Hls from "hls.js";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, Settings2, Gauge, ChevronUp, RefreshCw,
  Wifi, WifiOff
} from "lucide-react";

/* ── Types ── */
interface Track {
  kind?: string;
  src: string;
  srclang: string;
  label: string;
  default?: boolean;
}

interface Quality {
  label: string;
  src: string;
}

interface EmbedConfig {
  src: string;
  type: string; // m3u8 | mp4 | dash
  poster?: string;
  title?: string;
  subtitle?: string;
  autoplay?: boolean;
  muted?: boolean;
  controls?: boolean;
  preload?: string;
  startAt?: number;
  tracks?: Track[];
  qualities?: Quality[];
  primaryColor?: string;
  logo?: string;
  watermark?: string;
  nextUrl?: string;
  nextTitle?: string;
}

/* ── Parse config from URL ── */
function parseConfig(params: URLSearchParams): EmbedConfig | null {
  // Mode 1: Encoded payload
  const payload = params.get("p");
  if (payload) {
    try {
      const decoded = JSON.parse(atob(payload));
      return {
        src: decoded.src || "",
        type: decoded.type || "mp4",
        poster: decoded.poster,
        title: decoded.title,
        subtitle: decoded.subtitle,
        autoplay: decoded.autoplay !== false,
        muted: decoded.muted === true,
        controls: decoded.controls !== false,
        preload: decoded.preload || "auto",
        startAt: decoded.startAt ? Number(decoded.startAt) : undefined,
        tracks: decoded.tracks || [],
        qualities: decoded.qualities || [],
        primaryColor: decoded.primaryColor,
        logo: decoded.logo,
        watermark: decoded.watermark,
        nextUrl: decoded.next?.url,
        nextTitle: decoded.next?.title,
      };
    } catch {
      return null;
    }
  }

  // Mode 2: Direct query params
  const src = params.get("src");
  if (!src) return null;

  let tracks: Track[] = [];
  const tracksRaw = params.get("tracks");
  if (tracksRaw) {
    try { tracks = JSON.parse(tracksRaw); } catch {}
  }

  let qualities: Quality[] = [];
  const qualitiesRaw = params.get("qualities");
  if (qualitiesRaw) {
    try { qualities = JSON.parse(qualitiesRaw); } catch {}
  }

  return {
    src,
    type: params.get("type") || "mp4",
    poster: params.get("poster") || undefined,
    title: params.get("title") || undefined,
    subtitle: params.get("subtitle") || undefined,
    autoplay: params.get("autoplay") !== "0",
    muted: params.get("muted") === "1",
    controls: params.get("controls") !== "0",
    preload: params.get("preload") || "auto",
    startAt: params.get("startAt") ? Number(params.get("startAt")) : undefined,
    tracks,
    qualities,
    primaryColor: params.get("primaryColor") || undefined,
    logo: params.get("logo") || undefined,
    watermark: params.get("watermark") || undefined,
  };
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const UniversalEmbed = () => {
  const [params] = useSearchParams();
  const config = useMemo(() => parseConfig(params), [params]);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(config?.muted ?? false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);
  const [showQuality, setShowQuality] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const [currentQualityIdx, setCurrentQualityIdx] = useState(-1);
  const [hlsQualities, setHlsQualities] = useState<{ index: number; height: number; bitrate: number; label: string }[]>([]);
  const [networkSpeed, setNetworkSpeed] = useState(0);

  // ── Source attachment ──
  useEffect(() => {
    if (!config?.src) return;
    const video = videoRef.current;
    if (!video) return;

    const cleanup = () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };

    cleanup();
    setLoading(true);
    setError(null);

    const isHls = config.type === "m3u8" || config.src.includes(".m3u8");

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        startLevel: 0,
        abrEwmaDefaultEstimate: 2_000_000,
        maxBufferLength: 10,
        maxMaxBufferLength: 120,
        maxBufferSize: 60 * 1000 * 1000,
        maxBufferHole: 0.5,
        lowLatencyMode: false,
        backBufferLength: 0,
        startFragPrefetch: true,
        fragLoadingTimeOut: 10000,
        fragLoadingMaxRetry: 6,
        manifestLoadingTimeOut: 8000,
        manifestLoadingMaxRetry: 3,
      });
      hlsRef.current = hls;
      hls.loadSource(config.src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        const levels = hls.levels.map((l, i) => ({
          index: i,
          height: l.height,
          bitrate: l.bitrate,
          label: `${l.height}p`,
        }));
        setHlsQualities(levels);
        if (config.autoplay) {
          video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
        }
      });

      hls.on(Hls.Events.FRAG_LOADED, (_, data) => {
        const bytes = data.frag.stats?.total || 0;
        const ms = data.frag.stats?.loading?.end && data.frag.stats?.loading?.start
          ? data.frag.stats.loading.end - data.frag.stats.loading.start : 0;
        if (bytes > 0 && ms > 0) {
          const mbps = Math.round(((bytes * 8) / (ms / 1000)) / 1_000_000 * 10) / 10;
          setNetworkSpeed(mbps);
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else setError("Erro ao carregar o stream.");
        }
      });
    } else if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari native HLS
      video.src = config.src;
      video.addEventListener("loadedmetadata", () => {
        setLoading(false);
        if (config.autoplay) video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
      }, { once: true });
    } else {
      // MP4 / direct
      video.src = config.src;
      video.addEventListener("loadedmetadata", () => {
        setLoading(false);
        if (config.autoplay) video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
      }, { once: true });
    }

    // StartAt
    if (config.startAt) {
      const onCanPlay = () => { video.currentTime = config.startAt!; };
      video.addEventListener("canplay", onCanPlay, { once: true });
    }

    video.addEventListener("error", () => setError("Erro ao reproduzir o vídeo."));

    return cleanup;
  }, [config?.src, config?.type]);

  // ── Video event listeners ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTimeUpdate = () => { setCurrentTime(video.currentTime); setDuration(video.duration || 0); };
    const onProgress = () => {
      if (video.buffered.length > 0) setBuffered(video.buffered.end(video.buffered.length - 1));
    };
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("progress", onProgress);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("progress", onProgress);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
    };
  }, []);

  // ── Controls ──
  const togglePlay = () => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); };
  const seekTo = (t: number) => { if (videoRef.current) videoRef.current.currentTime = t; };
  const seekRelative = (d: number) => { if (videoRef.current) videoRef.current.currentTime += d; };
  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setMuted(videoRef.current.muted);
  };
  const changeVolume = (v: number) => {
    if (!videoRef.current) return;
    videoRef.current.volume = v;
    setVolume(v);
    if (v > 0 && videoRef.current.muted) { videoRef.current.muted = false; setMuted(false); }
  };
  const changeSpeed = (s: number) => { if (videoRef.current) { videoRef.current.playbackRate = s; setSpeed(s); } };
  const setQuality = (idx: number) => {
    if (hlsRef.current) { hlsRef.current.currentLevel = idx; setCurrentQualityIdx(idx); }
    // MP4 quality switch
    if (config?.qualities && config.qualities[idx]) {
      const v = videoRef.current;
      if (!v) return;
      const t = v.currentTime;
      const wasPlaying = !v.paused;
      v.src = config.qualities[idx].src;
      v.currentTime = t;
      if (wasPlaying) v.play();
      setCurrentQualityIdx(idx);
    }
  };

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (playing) { setShowControls(false); setShowSpeed(false); setShowQuality(false); }
    }, 3000);
  }, [playing]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case " ": case "k": e.preventDefault(); togglePlay(); break;
        case "arrowleft": e.preventDefault(); seekRelative(-10); break;
        case "arrowright": e.preventDefault(); seekRelative(10); break;
        case "f": toggleFullscreen(); break;
        case "m": toggleMute(); break;
      }
      resetHideTimer();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [playing, resetHideTimer]);

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) { await document.exitFullscreen(); setFullscreen(false); }
    else { await el.requestFullscreen(); setFullscreen(true); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (duration) seekTo(pct * duration);
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

  // All available qualities (HLS auto-detected + manual)
  const allQualities = hlsQualities.length > 0
    ? hlsQualities
    : (config?.qualities || []).map((q, i) => ({ index: i, height: 0, bitrate: 0, label: q.label }));

  // Custom primary color
  const accentStyle = config?.primaryColor ? { "--embed-accent": config.primaryColor } as React.CSSProperties : {};

  if (!config) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center space-y-4 p-8 max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto">
            <Play className="w-7 h-7 text-white/30" />
          </div>
          <p className="text-sm text-white/60">Nenhuma fonte de vídeo fornecida.</p>
          <p className="text-xs text-white/30 font-mono">Parâmetros: src, type, poster, title</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center select-none overflow-hidden"
      onMouseMove={resetHideTimer}
      style={{ cursor: showControls ? "default" : "none", ...accentStyle }}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        muted={muted}
        preload={config.preload || "auto"}
        poster={config.poster}
        // @ts-ignore
        referrerPolicy="no-referrer"
      >
        {/* Subtitle tracks */}
        {config.tracks?.map((t, i) => (
          <track key={i} kind={t.kind || "subtitles"} src={t.src} srcLang={t.srclang} label={t.label} default={t.default} />
        ))}
      </video>

      {/* Loading */}
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-[3px] border-white/10 border-t-primary animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Play className="w-5 h-5 text-white/40" />
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm">
          <div className="text-center space-y-5 p-8 max-w-sm">
            <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
              <span className="text-3xl">⚠️</span>
            </div>
            <p className="text-base font-semibold text-white">{error}</p>
            <button
              onClick={() => { setError(null); setLoading(true); if (videoRef.current) { videoRef.current.load(); videoRef.current.play(); } }}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:brightness-110 transition-all"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      {config.controls !== false && (
        <div
          className={`absolute inset-0 transition-all duration-500 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          onClick={togglePlay}
        >
          {/* Top gradient */}
          <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-black/80 via-black/30 to-transparent pointer-events-none" />

          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 px-4 sm:px-6 pt-4 sm:pt-5 flex items-center gap-3 z-20" onClick={e => e.stopPropagation()}>
            {config.logo && <img src={config.logo} alt="" className="h-6 object-contain" />}
            <div className="flex-1 min-w-0">
              {config.title && <p className="text-sm sm:text-base font-semibold text-white truncate">{config.title}</p>}
              {config.subtitle && <p className="text-[10px] text-white/40 font-medium">{config.subtitle}</p>}
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
              {networkSpeed > 0 ? <Wifi className="w-3 h-3 text-green-400/70" /> : <WifiOff className="w-3 h-3 text-white/30" />}
              <span className="text-[10px] text-white/40 font-mono">{networkSpeed > 0 ? `${networkSpeed} Mbps` : "—"}</span>
            </div>
          </div>

          {/* Center play/pause */}
          {!loading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <button
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                className="pointer-events-auto w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-full bg-white/10 backdrop-blur-2xl border border-white/15 flex items-center justify-center text-white hover:bg-white/15 hover:scale-105 active:scale-95 transition-all duration-200 shadow-[0_0_60px_rgba(0,0,0,0.5)]"
              >
                {playing ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
              </button>
            </div>
          )}

          {/* Bottom gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-36 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

          {/* Bottom controls */}
          <div className="absolute bottom-0 left-0 right-0 px-4 sm:px-6 pb-4 sm:pb-6 space-y-3 z-20" onClick={e => e.stopPropagation()}>
            {/* Progress bar */}
            <div className="group/bar cursor-pointer relative" onClick={seek} onMouseMove={onProgressHover} onMouseLeave={() => setHoverTime(null)}>
              {hoverTime !== null && (
                <div className="absolute -top-9 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-black/90 backdrop-blur-sm border border-white/10 text-[11px] font-mono text-white pointer-events-none" style={{ left: hoverX }}>
                  {fmt(hoverTime)}
                </div>
              )}
              <div className="relative w-full h-1.5 group-hover/bar:h-2.5 rounded-full bg-white/15 transition-all duration-200 overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-white/10 rounded-full transition-all" style={{ width: `${bufferPct}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full transition-all bg-gradient-to-r from-primary via-primary to-primary/80" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary shadow-lg border-2 border-white scale-0 group-hover/bar:scale-100 transition-transform duration-150" style={{ left: `calc(${progressPct}% - 8px)` }} />
            </div>

            {/* Actions row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <button onClick={togglePlay} className="w-9 h-9 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-all">
                  {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>
                <button onClick={() => seekRelative(-10)} className="w-9 h-9 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                  <SkipBack className="w-4 h-4" />
                </button>
                <button onClick={() => seekRelative(10)} className="w-9 h-9 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                  <SkipForward className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1.5 group/vol">
                  <button onClick={toggleMute} className="w-9 h-9 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                    {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <div className="w-0 group-hover/vol:w-24 overflow-hidden transition-all duration-300">
                    <input type="range" min="0" max="1" step="0.02" value={muted ? 0 : volume} onChange={(e) => changeVolume(parseFloat(e.target.value))} className="w-full accent-primary h-1 cursor-pointer" />
                  </div>
                </div>
                <span className="text-[11px] text-white/50 tabular-nums font-mono hidden sm:inline ml-1">
                  {fmt(currentTime)} <span className="text-white/25">/</span> {fmt(duration)}
                </span>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2">
                {allQualities.length > 1 && (
                  <div className="relative">
                    <button onClick={() => { setShowQuality(!showQuality); setShowSpeed(false); }} className="h-9 px-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center gap-1.5 text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-all">
                      <Settings2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{currentQualityIdx === -1 ? "Auto" : allQualities.find(q => q.index === currentQualityIdx)?.label || "Auto"}</span>
                    </button>
                    {showQuality && (
                      <div className="absolute bottom-full mb-2 right-0 bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl p-1 min-w-[130px] shadow-2xl max-h-64 overflow-y-auto">
                        {hlsQualities.length > 0 && (
                          <button onClick={() => { setQuality(-1); setShowQuality(false); }} className={`w-full px-3 py-2 rounded-lg text-xs text-left font-medium transition-all flex items-center justify-between ${currentQualityIdx === -1 ? "bg-primary/20 text-primary" : "text-white/60 hover:bg-white/10 hover:text-white"}`}>
                            Auto (ABR) {currentQualityIdx === -1 && <ChevronUp className="w-3 h-3" />}
                          </button>
                        )}
                        {allQualities.sort((a, b) => (b.height || 0) - (a.height || 0)).map(q => (
                          <button key={q.index} onClick={() => { setQuality(q.index); setShowQuality(false); }} className={`w-full px-3 py-2 rounded-lg text-xs text-left font-medium transition-all ${currentQualityIdx === q.index ? "bg-primary/20 text-primary" : "text-white/60 hover:bg-white/10 hover:text-white"}`}>
                            {q.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="relative">
                  <button onClick={() => { setShowSpeed(!showSpeed); setShowQuality(false); }} className={`h-9 px-3 rounded-xl backdrop-blur-sm border flex items-center gap-1.5 text-xs font-medium transition-all ${speed !== 1 ? "bg-primary/15 border-primary/30 text-primary" : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10"}`}>
                    <Gauge className="w-3.5 h-3.5" />{speed}x
                  </button>
                  {showSpeed && (
                    <div className="absolute bottom-full mb-2 right-0 bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl p-1 min-w-[100px] shadow-2xl">
                      {SPEEDS.map(s => (
                        <button key={s} onClick={() => { changeSpeed(s); setShowSpeed(false); }} className={`w-full px-3 py-2 rounded-lg text-xs text-left font-medium transition-all ${speed === s ? "bg-primary/20 text-primary" : "text-white/60 hover:bg-white/10 hover:text-white"}`}>
                          {s}x {s === 1 && <span className="text-white/30 ml-1">Normal</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button onClick={toggleFullscreen} className="w-9 h-9 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                  {fullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Watermark */}
      <div className="absolute bottom-1 right-2 pointer-events-none z-30 opacity-30">
        <span className="text-[8px] font-bold text-white tracking-widest">
          {config.watermark || "LYNEPLAY"}
        </span>
      </div>

      {/* Cinematic vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.3) 100%)"
      }} />
    </div>
  );
};

export default UniversalEmbed;
