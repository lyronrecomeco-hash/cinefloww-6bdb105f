import { useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams, useNavigate, useParams } from "react-router-dom";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipForward, SkipBack, Settings2, ArrowLeft,
  PictureInPicture2, RotateCcw, RefreshCw,
  Lock, Unlock, Gauge, Wifi, WifiOff, ChevronUp
} from "lucide-react";
import { fromSlug, toSlug } from "@/lib/slugify";
import { saveWatchProgress, getWatchProgress } from "@/lib/watchProgress";
import { getSeasonDetails, posterUrl, TMDBEpisode } from "@/services/tmdb";
import { useWatchRoom } from "@/hooks/useWatchRoom";
import { useWebRTC } from "@/hooks/useWebRTC";
import { usePlayerEngine, prefetchVideoUrl } from "@/hooks/usePlayerEngine";
import RoomOverlay from "@/components/watch-together/RoomOverlay";
import { captureFrameFromVideo, cacheCurrentFrame } from "@/lib/videoPreview";
import { getThumbnailCueAtTime, loadThumbnailTrack, warmThumbnailSprites, type ThumbnailTrack, type SpriteThumbnailCue } from "@/lib/vttThumbnails";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const fmt = (s: number) => {
  if (!s || isNaN(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}` : `${m}:${sec.toString().padStart(2, "0")}`;
};

const PlayerPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const params = useParams<{ type?: string; id?: string }>();
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const title = searchParams.get("title") || "LyneFlix Player";
  const audioParam = searchParams.get("audio") || "legendado";
  const imdbId = searchParams.get("imdb") || null;
  const tmdbId = params.id ? String(fromSlug(params.id)) : searchParams.get("tmdb");
  const contentType = params.type || searchParams.get("ct") || searchParams.get("type") || "movie";
  const season = searchParams.get("s") || null;
  const episode = searchParams.get("e") || null;

  const { videoRef, state, controls } = usePlayerEngine({
    tmdbId,
    contentType,
    season,
    episode,
  });

  // UI states
  const [showControls, setShowControls] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [unlockAnim, setUnlockAnim] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);
  const [showQuality, setShowQuality] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const [seekIndicator, setSeekIndicator] = useState<{ side: "left" | "right"; seconds: number } | null>(null);
  const [touchSeeking, setTouchSeeking] = useState(false);
  const [previewThumb, setPreviewThumb] = useState<string | null>(null);
  const [spriteCue, setSpriteCue] = useState<SpriteThumbnailCue | null>(null);
  const [thumbTrack, setThumbTrack] = useState<ThumbnailTrack | null>(null);
  const hoverSecondRef = useRef<number | null>(null);

  // Next episode
  const [nextEpUrl, setNextEpUrl] = useState<string | null>(null);
  const [showNextEp, setShowNextEp] = useState(false);
  const [nextEpInfo, setNextEpInfo] = useState<TMDBEpisode | null>(null);

  // Resume prompt
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [resumeTime, setResumeTime] = useState(0);
  const resumeChecked = useRef(false);

  // Watch Together
  const roomCodeParam = searchParams.get("room") || null;
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [activeProfileName, setActiveProfileName] = useState<string | undefined>();

  useEffect(() => {
    const stored = localStorage.getItem("lyneflix_active_profile");
    if (stored) {
      try { const p = JSON.parse(stored); setActiveProfileId(p.id); setActiveProfileName(p.name); } catch {}
    }
  }, []);

  const handlePlaybackSync = useCallback((s: { action: "play" | "pause" | "seek"; position: number }) => {
    const v = videoRef.current;
    if (!v) return;
    if (s.action === "seek") v.currentTime = s.position;
    else if (s.action === "play") { if (Math.abs(v.currentTime - s.position) > 3) v.currentTime = s.position; v.play().catch(() => {}); }
    else if (s.action === "pause") v.pause();
  }, []);

  const watchRoom = useWatchRoom({ profileId: activeProfileId, profileName: activeProfileName, onPlaybackSync: handlePlaybackSync });
  const roomMode = (watchRoom.room as any)?.room_mode as "chat" | "call" | undefined;
  const webRTC = useWebRTC({ roomId: watchRoom.room?.id || null, profileId: activeProfileId, profileName: activeProfileName, isHost: watchRoom.isHost, enabled: roomMode === "call" && !!watchRoom.room });

  useEffect(() => { if (roomCodeParam && activeProfileId && !watchRoom.room) watchRoom.joinRoom(roomCodeParam); }, [roomCodeParam, activeProfileId]);

  // Resume prompt — check once when video loads
  useEffect(() => {
    if (resumeChecked.current || !tmdbId || state.duration === 0) return;
    resumeChecked.current = true;
    const ct = contentType === "movie" ? "movie" : "series";
    getWatchProgress(Number(tmdbId), ct, season ? Number(season) : undefined, episode ? Number(episode) : undefined).then((prog) => {
      if (!prog) return;
      // Don't prompt if completed or near end (last 60s) or near start (<30s)
      const nearEnd = prog.duration_seconds > 0 && (prog.duration_seconds - prog.progress_seconds) < 60;
      if (prog.completed || nearEnd || prog.progress_seconds < 30) return;
      setResumeTime(prog.progress_seconds);
      setShowResumePrompt(true);
    });
  }, [tmdbId, contentType, season, episode, state.duration]);

  // Next episode computation
  useEffect(() => {
    const tmdb = tmdbId ? Number(tmdbId) : null;
    const s = season ? Number(season) : null;
    const e = episode ? Number(episode) : null;
    if (!tmdb || !s || !e || contentType === "movie") { setNextEpUrl(null); setNextEpInfo(null); return; }
    let cancelled = false;
    getSeasonDetails(tmdb, s).then((seasonData) => {
      if (cancelled) return;
      const nextEp = seasonData.episodes.find(ep => ep.episode_number === e + 1);
      if (nextEp) {
        const slug = params.id || toSlug(title, tmdb);
        const p = new URLSearchParams({ title, audio: audioParam, s: String(s), e: String(nextEp.episode_number) });
        if (imdbId) p.set("imdb", imdbId);
        setNextEpUrl(`/player/${contentType}/${slug}?${p.toString()}`);
        setNextEpInfo(nextEp);
      } else { setNextEpUrl(null); setNextEpInfo(null); }
    }).catch(() => { if (!cancelled) { setNextEpUrl(null); setNextEpInfo(null); } });
    return () => { cancelled = true; };
  }, [tmdbId, season, episode, contentType, title, audioParam, imdbId, params.id]);

  useEffect(() => {
    if (nextEpUrl && state.duration > 0) {
      const remaining = state.duration - state.currentTime;
      if (remaining <= 30 && remaining > 0 && !showNextEp) setShowNextEp(true);
    }
  }, [state.currentTime, state.duration, nextEpUrl, showNextEp]);

  const goNextEpisode = () => {
    if (!nextEpUrl) return;
    setShowNextEp(false);
    navigate(nextEpUrl, { replace: true });
  };

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Auto fullscreen mobile
  useEffect(() => {
    if (!isMobile) return;
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!isIOS && containerRef.current && !document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setFullscreen(true)).catch(() => {});
    }
    if (!isIOS) { try { (screen.orientation as any)?.lock?.("landscape").catch(() => {}); } catch {} }
    return () => { try { (screen.orientation as any)?.unlock?.(); } catch {} };
  }, [isMobile]);

  // ── Controls hide timer ──
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (state.playing) { setShowControls(false); setShowSpeed(false); setShowQuality(false); }
    }, 3000);
  }, [state.playing]);

  useEffect(() => {
    if (locked) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [locked, showControls]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (locked) { if (e.key.toLowerCase() === "l") handleUnlock(); return; }
      switch (e.key.toLowerCase()) {
        case " ": case "k": e.preventDefault(); controls.togglePlay(); break;
        case "arrowleft": case "j": e.preventDefault(); controls.seekRelative(-10); flashSeek("left", 10); break;
        case "arrowright": e.preventDefault(); controls.seekRelative(10); flashSeek("right", 10); break;
        case "arrowup": e.preventDefault(); controls.setVolume(Math.min(1, state.volume + 0.1)); break;
        case "arrowdown": e.preventDefault(); controls.setVolume(Math.max(0, state.volume - 0.1)); break;
        case "m": controls.toggleMute(); break;
        case "f": toggleFullscreen(); break;
        case "l": setLocked(true); resetHideTimer(); break;
        case "escape": if (fullscreen) toggleFullscreen(); else goBack(); break;
      }
      resetHideTimer();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [state.playing, state.volume, locked, fullscreen, resetHideTimer, controls]);

  const handleUnlock = () => {
    setUnlockAnim(true);
    setTimeout(() => { setLocked(false); setUnlockAnim(false); resetHideTimer(); }, 500);
  };

  const flashSeek = (side: "left" | "right", seconds: number) => {
    setSeekIndicator({ side, seconds });
    setTimeout(() => setSeekIndicator(null), 600);
  };

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const toggleFullscreen = () => {
    const c = containerRef.current;
    const video = videoRef.current;
    if (!c) return;
    if (isIOS && video) {
      try {
        if ((video as any).webkitDisplayingFullscreen) (video as any).webkitExitFullscreen?.();
        else (video as any).webkitEnterFullscreen?.();
      } catch {}
      return;
    }
    if (!document.fullscreenElement) c.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
    else document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
  };

  const togglePiP = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {}
  };

  const goBack = () => navigate(-1);

  // Cache thumbnail frames passively during playback (every ~1s)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onTimeUpdate = () => cacheCurrentFrame(v);
    const onSeeked = () => cacheCurrentFrame(v);

    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("seeked", onSeeked);

    return () => {
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("seeked", onSeeked);
    };
  }, []);

  const updateHoverPreview = useCallback((time: number) => {
    const v = videoRef.current;
    const rounded = Math.round(time);
    hoverSecondRef.current = rounded;

    if (!v) {
      setPreviewThumb(null);
      return;
    }

    const immediate = captureFrameFromVideo(v, time, (asyncThumb, requestedSecond) => {
      if (hoverSecondRef.current == null) return;
      if (Math.abs(hoverSecondRef.current - requestedSecond) > 1) return;
      if (asyncThumb) setPreviewThumb(asyncThumb);
    });

    if (immediate) setPreviewThumb(immediate);
  }, []);

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (locked) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (state.duration) controls.seekTo(pct * state.duration);
  };

  const onProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = pct * state.duration;
    setHoverTime(time);
    setHoverX(e.clientX - rect.left);
    updateHoverPreview(time);
  };

  const progressPct = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
  const bufferPct = state.duration > 0 ? (state.buffered / state.duration) * 100 : 0;

  // Double-tap seek
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapSide = useRef<"left" | "right" | null>(null);

  const handleVideoAreaClick = (e: React.MouseEvent) => {
    if (locked) { setShowControls(true); resetHideTimer(); return; }
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
      tapTimer.current = setTimeout(() => { tapTimer.current = null; controls.togglePlay(); }, 250);
    }
    resetHideTimer();
  };

  const handleLockedScreenClick = () => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center select-none overflow-hidden"
      onMouseMove={() => { if (!locked) resetHideTimer(); else { setShowControls(true); resetHideTimer(); } }}
      style={{ cursor: showControls ? "default" : "none" }}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        preload="auto"
        // @ts-ignore
        referrerPolicy="no-referrer"
        onPlay={() => {
          if (watchRoom.isHost && watchRoom.room) watchRoom.broadcastPlayback({ action: "play", position: videoRef.current?.currentTime || 0, timestamp: Date.now() });
        }}
        onPause={() => {
          if (watchRoom.isHost && watchRoom.room) watchRoom.broadcastPlayback({ action: "pause", position: videoRef.current?.currentTime || 0, timestamp: Date.now() });
        }}
        onSeeked={() => {
          if (watchRoom.isHost && watchRoom.room) watchRoom.broadcastPlayback({ action: "seek", position: videoRef.current?.currentTime || 0, timestamp: Date.now() });
        }}
      />

      {/* Watch Together Overlay */}
      {watchRoom.room && activeProfileId && (
        <RoomOverlay
          roomCode={watchRoom.room.room_code}
          roomMode={roomMode || "chat"}
          isHost={watchRoom.isHost}
          participants={watchRoom.participants}
          messages={watchRoom.messages}
          profileId={activeProfileId}
          profileName={activeProfileName || "Anônimo"}
          onLeave={() => { webRTC.endCall(); watchRoom.leaveRoom(); }}
          onSendMessage={watchRoom.sendMessage}
          showControls={showControls}
          voiceCallActive={webRTC.isCallActive}
          voiceMuted={webRTC.isMuted}
          voicePeers={webRTC.peers}
          voiceError={webRTC.error}
          onToggleVoiceMute={webRTC.toggleMute}
          onEndVoiceCall={() => { webRTC.endCall(); watchRoom.leaveRoom(); }}
          onHostMute={webRTC.hostMute}
          onHostUnmute={webRTC.hostUnmute}
          onHostKick={webRTC.hostKick}
        />
      )}

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

      {/* Stall recovery */}
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
              <button onClick={goBack} className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/80 text-sm hover:bg-white/10 transition-all">
                Voltar
              </button>
              <button onClick={() => controls.retryLoad()} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:brightness-110 transition-all">
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resume prompt */}
      {showResumePrompt && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-card/95 backdrop-blur-xl border border-white/10 rounded-2xl p-5 sm:p-6 shadow-2xl max-w-sm mx-4">
            <p className="text-sm sm:text-base font-bold text-foreground mb-1">Continuar assistindo?</p>
            <p className="text-xs sm:text-sm text-muted-foreground mb-4">
              Você parou em <span className="text-primary font-semibold">{fmt(resumeTime)}</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { controls.seekTo(resumeTime); setShowResumePrompt(false); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all"
              >
                <Play className="w-4 h-4 fill-current" /> Continuar
              </button>
              <button
                onClick={() => setShowResumePrompt(false)}
                className="px-4 py-2.5 rounded-xl bg-white/10 text-sm font-medium hover:bg-white/20 transition-colors"
              >
                Do início
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Next Episode popup — Netflix style */}
      {showNextEp && nextEpUrl && (
        <div className="absolute bottom-28 sm:bottom-24 right-3 left-3 sm:left-auto sm:right-8 z-40 animate-fade-in">
          <div className="bg-card/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl max-w-xs overflow-hidden">
            {/* Episode thumbnail */}
            {nextEpInfo?.still_path && (
              <div className="w-full aspect-video relative">
                <img
                  src={posterUrl(nextEpInfo.still_path, "w300")}
                  alt={nextEpInfo.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card/95 to-transparent" />
              </div>
            )}
            <div className="p-4 sm:p-5">
              <p className="text-[10px] sm:text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Próximo episódio</p>
              <p className="text-sm sm:text-base font-bold text-foreground mb-1">
                {season != null && episode != null ? `T${season} • E${Number(episode) + 1}` : "Próximo"}
              </p>
              {nextEpInfo?.name && (
                <p className="text-xs text-muted-foreground mb-3 line-clamp-1">{nextEpInfo.name}</p>
              )}
              <div className="flex gap-2">
                <button onClick={goNextEpisode} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all">
                  <Play className="w-4 h-4 fill-current" /> Reproduzir
                </button>
                <button onClick={() => setShowNextEp(false)} className="px-3 py-2.5 rounded-xl bg-white/10 text-sm font-medium hover:bg-white/20 transition-colors">✕</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lock overlay */}
      {locked && (
        <div className="absolute inset-0 z-50" onClick={handleLockedScreenClick}>
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 transition-all duration-500 ${
            showControls ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none"
          }`}>
            <button
              onClick={(e) => { e.stopPropagation(); handleUnlock(); }}
              className={`group p-5 rounded-2xl backdrop-blur-xl border transition-all duration-500 ${
                unlockAnim
                  ? "bg-primary/20 border-primary/40 scale-110 rotate-12"
                  : "bg-black/40 border-white/10 text-white/60 hover:text-white hover:border-primary/30 hover:bg-black/60"
              }`}
            >
              {unlockAnim ? <Unlock className="w-7 h-7 text-primary animate-pulse" /> : <Lock className="w-7 h-7 group-hover:scale-110 transition-transform" />}
            </button>
            <span className={`text-[11px] font-medium tracking-wider uppercase transition-all duration-300 ${unlockAnim ? "text-primary" : "text-white/30"}`}>
              {unlockAnim ? "Desbloqueando..." : "Toque para desbloquear"}
            </span>
          </div>
        </div>
      )}

      {/* Controls overlay — Prototype style */}
      {!locked && (
        <div
          className={`absolute inset-0 transition-all duration-500 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          onClick={handleVideoAreaClick}
        >
          {/* Top gradient */}
          <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-black/80 via-black/30 to-transparent pointer-events-none" />

          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 px-4 sm:px-6 pt-4 sm:pt-5 flex items-center gap-3 z-20" onClick={e => e.stopPropagation()}>
            <button onClick={goBack} className="group flex items-center gap-2 text-white/70 hover:text-white transition-all">
              <div className="w-9 h-9 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center group-hover:bg-white/10 transition-all">
                <ArrowLeft className="w-4 h-4" />
              </div>
            </button>
            <div className="flex-1 min-w-0">
              {title && <p className="text-sm sm:text-base font-semibold text-white truncate">{title}</p>}
              {season != null && episode != null && (
                <p className="text-[10px] text-white/40 font-medium">Temporada {season} · Episódio {episode}</p>
              )}
            </div>

            {/* Network speed badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
              {state.networkSpeed > 0 ? <Wifi className="w-3 h-3 text-green-400/70" /> : <WifiOff className="w-3 h-3 text-white/30" />}
              <span className="text-[10px] text-white/40 font-mono">{state.networkSpeed > 0 ? `${state.networkSpeed} Mbps` : "—"}</span>
            </div>

            <button
              onClick={() => { setLocked(true); resetHideTimer(); }}
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
              onMouseLeave={() => {
                hoverSecondRef.current = null;
                setHoverTime(null);
                setPreviewThumb(null);
              }}
              onTouchStart={(e) => {
                setTouchSeeking(true);
                const rect = e.currentTarget.getBoundingClientRect();
                const touch = e.touches[0];
                const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
                const time = pct * state.duration;
                setHoverTime(time);
                setHoverX(touch.clientX - rect.left);
                updateHoverPreview(time);
              }}
              onTouchMove={(e) => {
                if (!touchSeeking) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const touch = e.touches[0];
                const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
                const time = pct * state.duration;
                setHoverTime(time);
                setHoverX(touch.clientX - rect.left);
                updateHoverPreview(time);
              }}
              onTouchEnd={() => {
                if (touchSeeking && hoverTime !== null) {
                  controls.seekTo(hoverTime);
                }
                setTouchSeeking(false);
                hoverSecondRef.current = null;
                setHoverTime(null);
                setPreviewThumb(null);
              }}
            >
              {hoverTime !== null && (
                <div
                  className="absolute -translate-x-1/2 pointer-events-none flex flex-col items-center"
                  style={{ left: Math.max(40, Math.min(hoverX, (containerRef.current?.clientWidth || 300) - 60)), bottom: "calc(100% + 8px)" }}
                >
                  {previewThumb && (
                    <img
                      src={previewThumb}
                      alt=""
                      className="w-[160px] h-[90px] rounded-lg border border-white/20 shadow-xl object-cover mb-1"
                    />
                  )}
                  <span className="px-2.5 py-1 rounded-lg bg-black/90 backdrop-blur-sm border border-white/10 text-[11px] font-mono text-white">
                    {fmt(hoverTime)}
                  </span>
                </div>
              )}
              <div className={`relative w-full ${touchSeeking ? "h-3" : "h-1.5 group-hover/bar:h-2.5"} rounded-full bg-white/15 transition-all duration-200 overflow-hidden`}>
                <div className="absolute inset-y-0 left-0 bg-white/10 rounded-full transition-all" style={{ width: `${bufferPct}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full transition-all bg-gradient-to-r from-primary via-primary to-primary/80" style={{ width: `${progressPct}%` }} />
              </div>
              <div
                className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary shadow-[0_0_12px_rgba(var(--primary),0.5)] border-2 border-white ${touchSeeking ? "scale-100" : "scale-0 group-hover/bar:scale-100"} transition-transform duration-150`}
                style={{ left: `calc(${progressPct}% - 8px)` }}
              />
            </div>

            {/* Actions row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <button onClick={controls.togglePlay}
                  aria-label={state.playing ? "Pausar" : "Reproduzir"}
                  className="w-9 h-9 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-all">
                  {state.playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                <button onClick={() => { controls.seekRelative(-10); flashSeek("left", 10); }}
                  aria-label="Voltar 10 segundos"
                  className="w-9 h-9 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                  <SkipBack className="w-4 h-4" />
                </button>
                <button onClick={() => { controls.seekRelative(10); flashSeek("right", 10); }}
                  aria-label="Avançar 10 segundos"
                  className="w-9 h-9 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                  <SkipForward className="w-4 h-4" />
                </button>

                {/* Volume */}
                <div className="flex items-center gap-1.5 group/vol">
                  <button onClick={controls.toggleMute}
                    aria-label={state.muted ? "Ativar som" : "Silenciar"}
                    className="w-9 h-9 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                    {state.muted || state.volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <div className="w-0 group-hover/vol:w-24 overflow-hidden transition-all duration-300">
                    <input
                      type="range" min="0" max="1" step="0.02" value={state.muted ? 0 : state.volume}
                      onChange={(e) => controls.setVolume(parseFloat(e.target.value))}
                      aria-label="Volume"
                      className="w-full accent-primary h-1 cursor-pointer"
                    />
                  </div>
                </div>

                <span className="text-[11px] text-white/50 tabular-nums font-mono hidden sm:inline ml-1">
                  {fmt(state.currentTime)} <span className="text-white/25">/</span> {fmt(state.duration)}
                </span>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Next episode button removed — card is sufficient */}

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
                        {[...state.qualities].sort((a, b) => b.height - a.height).map(q => (
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
                {!isMobile && (
                  <button onClick={togglePiP}
                    aria-label="Picture-in-Picture"
                    className="w-9 h-9 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all hidden sm:flex"
                    title="Picture-in-Picture">
                    <PictureInPicture2 className="w-4 h-4" />
                  </button>
                )}

                {/* Fullscreen */}
                <button onClick={toggleFullscreen}
                  aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
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

export default PlayerPage;