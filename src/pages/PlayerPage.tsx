import { useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams, useNavigate, useParams } from "react-router-dom";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipForward, SkipBack, Settings, AlertTriangle,
  RefreshCw, ArrowLeft, PictureInPicture, Subtitles,
  Lock, Unlock, Gauge, Settings2, ChevronUp
} from "lucide-react";
import { fromSlug, toSlug } from "@/lib/slugify";
import { saveWatchProgress, getWatchProgress } from "@/lib/watchProgress";
import { getSeasonDetails } from "@/services/tmdb";
import { useWatchRoom } from "@/hooks/useWatchRoom";
import { useWebRTC } from "@/hooks/useWebRTC";
import { usePlayerEngine, prefetchVideoUrl } from "@/hooks/usePlayerEngine";
import RoomOverlay from "@/components/watch-together/RoomOverlay";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const formatTime = (s: number) => {
  if (!isFinite(s) || isNaN(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
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

  // New engine
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

  // Next episode
  const [nextEpUrl, setNextEpUrl] = useState<string | null>(null);
  const [showNextEp, setShowNextEp] = useState(false);

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

  // Next episode computation
  useEffect(() => {
    const tmdb = tmdbId ? Number(tmdbId) : null;
    const s = season ? Number(season) : null;
    const e = episode ? Number(episode) : null;
    if (!tmdb || !s || !e || contentType === "movie") { setNextEpUrl(null); return; }
    let cancelled = false;
    getSeasonDetails(tmdb, s).then((seasonData) => {
      if (cancelled) return;
      const nextEp = seasonData.episodes.find(ep => ep.episode_number === e + 1);
      if (nextEp) {
        const slug = params.id || toSlug(title, tmdb);
        const p = new URLSearchParams({ title, audio: audioParam, s: String(s), e: String(nextEp.episode_number) });
        if (imdbId) p.set("imdb", imdbId);
        setNextEpUrl(`/player/${contentType}/${slug}?${p.toString()}`);
      } else setNextEpUrl(null);
    }).catch(() => { if (!cancelled) setNextEpUrl(null); });
    return () => { cancelled = true; };
  }, [tmdbId, season, episode, contentType, title, audioParam, imdbId, params.id]);

  // Show next ep popup
  useEffect(() => {
    if (nextEpUrl && state.duration > 0) {
      const remaining = state.duration - state.currentTime;
      if (remaining <= 10 && remaining > 0 && !showNextEp) setShowNextEp(true);
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
    }, 3500);
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
      className="fixed inset-0 z-[100] bg-black select-none overflow-hidden"
      onMouseMove={() => { if (!locked) resetHideTimer(); else { setShowControls(true); resetHideTimer(); } }}
      onTouchStart={() => { if (!locked) resetHideTimer(); else { setShowControls(true); resetHideTimer(); } }}
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
        <div className={`absolute top-1/2 -translate-y-1/2 ${seekIndicator.side === "left" ? "left-12" : "right-12"} pointer-events-none animate-fade-in z-20`}>
          <div className="flex flex-col items-center gap-1 text-white/90">
            <SkipBack className={`w-8 h-8 ${seekIndicator.side === "right" ? "scale-x-[-1]" : ""}`} />
            <span className="text-xs font-bold">{seekIndicator.seconds}s</span>
          </div>
        </div>
      )}

      {/* Loading — initial */}
      {state.loading && !state.error && state.currentTime === 0 && state.duration === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black">
          <div className="flex flex-col items-center gap-6">
            <div className="lyneflix-loader">
              <span className="lyneflix-text text-4xl sm:text-5xl font-black tracking-wider select-none">LYNEFLIX</span>
            </div>
            <div className="flex gap-1.5">
              <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        </div>
      )}

      {/* Buffering spinner */}
      {state.loading && !state.error && (state.currentTime > 0 || state.duration > 0) && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin" />
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

      {/* Error */}
      {state.error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
            <span className="text-[100px] sm:text-[140px] font-black tracking-wider text-white select-none">LYNEFLIX</span>
          </div>
          <div className="relative text-center p-6 sm:p-8 max-w-sm mx-4 bg-card/80 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-5">
              <Settings className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Ops! Tivemos um probleminha</h3>
            <p className="text-sm text-white/50 mb-6 leading-relaxed">{state.error}</p>
            <div className="flex gap-2">
              <button onClick={() => controls.retryLoad()} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
                <RefreshCw className="w-4 h-4" /> Tentar de novo
              </button>
              <button onClick={goBack} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 text-white/70 text-sm font-medium hover:bg-white/10 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Next Episode popup */}
      {showNextEp && nextEpUrl && (
        <div className="absolute bottom-20 sm:bottom-24 right-4 sm:right-8 z-30 animate-fade-in">
          <div className="bg-card/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-5 shadow-2xl max-w-xs">
            <p className="text-[10px] sm:text-xs text-muted-foreground mb-2 uppercase tracking-wider font-semibold">Próximo episódio</p>
            <p className="text-sm sm:text-base font-bold text-foreground mb-3">
              {season && episode ? `T${season} • E${Number(episode) + 1}` : "Próximo"}
            </p>
            <div className="flex gap-2">
              <button onClick={goNextEpisode} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all">
                <Play className="w-4 h-4 fill-current" /> Reproduzir
              </button>
              <button onClick={() => setShowNextEp(false)} className="px-3 py-2.5 rounded-xl bg-white/10 text-sm font-medium hover:bg-white/20 transition-colors">✕</button>
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

      {/* Controls overlay */}
      {!locked && (
        <div
          className={`absolute inset-0 z-10 transition-all duration-500 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          onClick={handleVideoAreaClick}
        >
          {/* Top gradient */}
          <div className="absolute top-0 left-0 right-0 h-24 sm:h-28 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none" />

          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 px-3 sm:px-4 lg:px-6 pt-3 sm:pt-4 lg:pt-6 flex items-center gap-2 sm:gap-3 z-20" onClick={e => e.stopPropagation()}>
            <button onClick={goBack} className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="text-white text-sm sm:text-base lg:text-xl font-bold truncate drop-shadow-lg">{title}</h2>
              {season && episode && <p className="text-white/50 text-[10px] sm:text-xs">T{season} • E{episode}</p>}
            </div>
            <button
              onClick={() => { setLocked(true); resetHideTimer(); }}
              className="w-9 h-9 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
              title="Bloquear tela (L)"
            >
              <Unlock className="w-4 h-4" />
            </button>
          </div>

          {/* Center play */}
          {!state.loading && !state.error && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <button
                onClick={(e) => { e.stopPropagation(); controls.togglePlay(); }}
                className="pointer-events-auto w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 backdrop-blur-2xl border border-white/15 flex items-center justify-center text-white hover:bg-white/15 hover:scale-105 active:scale-95 transition-all duration-200 shadow-[0_0_60px_rgba(0,0,0,0.5)]"
              >
                {state.playing ? <Pause className="w-7 h-7 sm:w-8 sm:h-8" /> : <Play className="w-7 h-7 sm:w-8 sm:h-8 ml-1" />}
              </button>
            </div>
          )}

          {/* Bottom gradient + controls */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-16 sm:pt-20 pb-3 sm:pb-4 lg:pb-6 px-3 sm:px-4 lg:px-6 z-20" onClick={e => e.stopPropagation()}>
            {/* Progress */}
            <div
              className="group/bar cursor-pointer relative mb-3 sm:mb-4"
              onClick={seek}
              onMouseMove={onProgressHover}
              onMouseLeave={() => setHoverTime(null)}
            >
              {hoverTime !== null && (
                <div className="absolute -top-8 sm:-top-9 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-black/90 backdrop-blur-sm border border-white/10 text-[11px] font-mono text-white pointer-events-none" style={{ left: hoverX }}>
                  {formatTime(hoverTime)}
                </div>
              )}
              <div className="relative w-full h-1 sm:h-1.5 group-hover/bar:h-2.5 rounded-full bg-white/15 transition-all duration-200 overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-white/10 rounded-full transition-all" style={{ width: `${bufferPct}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all" style={{ width: `${progressPct}%` }}>
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-primary shadow-lg shadow-primary/50 opacity-0 group-hover/bar:opacity-100 transition-all scale-0 group-hover/bar:scale-100 ring-2 ring-white/30" />
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-0.5 sm:gap-1.5">
                <button onClick={() => controls.togglePlay()} className="p-2 sm:p-2.5 hover:bg-white/10 rounded-xl transition-colors">
                  {state.playing ? <Pause className="w-5 h-5 sm:w-6 sm:h-6 text-white" /> : <Play className="w-5 h-5 sm:w-6 sm:h-6 text-white fill-white" />}
                </button>
                <button onClick={() => { controls.seekRelative(-10); flashSeek("left", 10); }} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-xl transition-colors">
                  <SkipBack className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </button>
                <button onClick={() => { controls.seekRelative(10); flashSeek("right", 10); }} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-xl transition-colors">
                  <SkipForward className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </button>
                {!isMobile && (
                  <div className="flex items-center gap-0.5 group/vol">
                    <button onClick={() => controls.toggleMute()} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                      {state.muted || state.volume === 0 ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
                    </button>
                    <div className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-300">
                      <input type="range" min="0" max="1" step="0.05" value={state.muted ? 0 : state.volume}
                        onChange={(e) => controls.setVolume(parseFloat(e.target.value))}
                        className="w-full h-1 accent-primary cursor-pointer" />
                    </div>
                  </div>
                )}
                <span className="text-white/60 text-[10px] sm:text-xs ml-1 sm:ml-2 font-mono tabular-nums select-none">
                  {formatTime(state.currentTime)} <span className="text-white/30">/</span> {formatTime(state.duration)}
                </span>
              </div>

              <div className="flex items-center gap-0.5 sm:gap-1">
                {/* Next episode */}
                {nextEpUrl && (
                  <button onClick={goNextEpisode} className="flex items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-[10px] sm:text-xs font-medium text-white">
                    <SkipForward className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Próximo</span>
                  </button>
                )}

                {/* Quality */}
                {state.qualities.length > 1 && (
                  <div className="relative">
                    <button onClick={() => { setShowQuality(!showQuality); setShowSpeed(false); }} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-xl transition-colors">
                      <Settings2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </button>
                    {showQuality && (
                      <div className="absolute bottom-full mb-2 right-0 bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl p-1 min-w-[130px] shadow-2xl max-h-64 overflow-y-auto">
                        <button onClick={() => { controls.setQuality(-1); setShowQuality(false); }}
                          className={`w-full px-3 py-2 rounded-lg text-xs text-left font-medium transition-all ${state.currentQuality === -1 ? "bg-primary/20 text-primary" : "text-white/60 hover:bg-white/10"}`}>
                          Auto
                        </button>
                        {[...state.qualities].sort((a, b) => b.height - a.height).map(q => (
                          <button key={q.index} onClick={() => { controls.setQuality(q.index); setShowQuality(false); }}
                            className={`w-full px-3 py-2 rounded-lg text-xs text-left font-medium transition-all flex items-center justify-between ${state.currentQuality === q.index ? "bg-primary/20 text-primary" : "text-white/60 hover:bg-white/10"}`}>
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
                  <button onClick={() => { setShowSpeed(!showSpeed); setShowQuality(false); }}
                    className={`p-1.5 sm:p-2 hover:bg-white/10 rounded-xl transition-colors ${state.speed !== 1 ? "text-primary" : "text-white"}`}>
                    <Gauge className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  {showSpeed && (
                    <div className="absolute bottom-full mb-2 right-0 bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl p-1 min-w-[100px] shadow-2xl">
                      {SPEEDS.map(s => (
                        <button key={s} onClick={() => { controls.setSpeed(s); setShowSpeed(false); }}
                          className={`w-full px-3 py-2 rounded-lg text-xs text-left font-medium transition-all ${state.speed === s ? "bg-primary/20 text-primary" : "text-white/60 hover:bg-white/10"}`}>
                          {s}x {s === 1 && <span className="text-white/30 ml-1">Normal</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {state.speed !== 1 && (
                  <span className="text-[10px] text-primary font-bold bg-primary/15 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg">{state.speed}x</span>
                )}

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
      )}
    </div>
  );
};

export default PlayerPage;
