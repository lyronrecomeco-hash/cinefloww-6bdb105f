import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams, useNavigate, useParams } from "react-router-dom";
import Hls from "hls.js";
import { supabase } from "@/integrations/supabase/client";
import { fromSlug } from "@/lib/slugify";
import { toSlug } from "@/lib/slugify";
import { secureVideoUrl } from "@/lib/videoUrl";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipForward, SkipBack, Settings, AlertTriangle,
  RefreshCw, ArrowLeft, PictureInPicture, Subtitles,
} from "lucide-react";
import { saveWatchProgress, getWatchProgress } from "@/lib/watchProgress";
import { getSeasonDetails } from "@/services/tmdb";
import { useWatchRoom } from "@/hooks/useWatchRoom";
import { useWebRTC } from "@/hooks/useWebRTC";
import RoomOverlay from "@/components/watch-together/RoomOverlay";
import IframeInterceptor from "@/components/IframeInterceptor";

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

const PlayerPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const params = useParams<{ type?: string; id?: string }>();

  const title = searchParams.get("title") || "LyneFlix Player";
  const subtitle = searchParams.get("subtitle") || undefined;
  const videoUrl = searchParams.get("url");
  const videoType = (searchParams.get("type") as "mp4" | "m3u8") || "m3u8";
  const audioParam = searchParams.get("audio") || "legendado";
  const imdbId = searchParams.get("imdb") || null;
  const tmdbId = params.id ? fromSlug(params.id) : (searchParams.get("tmdb") ? Number(searchParams.get("tmdb")) : undefined);
  const contentType = params.type || searchParams.get("ct") || "movie";
  const season = searchParams.get("s") ? Number(searchParams.get("s")) : undefined;
  const episode = searchParams.get("e") ? Number(searchParams.get("e")) : undefined;

  const [bankSources, setBankSources] = useState<VideoSource[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankTitle, setBankTitle] = useState(title);
  const [iframeProxyUrl, setIframeProxyUrl] = useState<string | null>(null);

  // Next episode state
  const [nextEpUrl, setNextEpUrl] = useState<string | null>(null);
  const [showNextEp, setShowNextEp] = useState(false);
  const nextEpTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Watch Together
  const roomCodeParam = searchParams.get("room") || null;
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [activeProfileName, setActiveProfileName] = useState<string | undefined>();

  useEffect(() => {
    const stored = localStorage.getItem("lyneflix_active_profile");
    if (stored) {
      try {
        const p = JSON.parse(stored);
        setActiveProfileId(p.id);
        setActiveProfileName(p.name);
      } catch {}
    }
  }, []);

  const handlePlaybackSync = useCallback((state: { action: "play" | "pause" | "seek"; position: number }) => {
    const v = videoRef.current;
    if (!v) return;
    if (state.action === "seek") {
      v.currentTime = state.position;
    } else if (state.action === "play") {
      if (Math.abs(v.currentTime - state.position) > 3) v.currentTime = state.position;
      v.play().catch(() => {});
    } else if (state.action === "pause") {
      v.pause();
    }
  }, []);

  const watchRoom = useWatchRoom({
    profileId: activeProfileId,
    profileName: activeProfileName,
    onPlaybackSync: handlePlaybackSync,
  });

  const roomMode = (watchRoom.room as any)?.room_mode as "chat" | "call" | undefined;
  const isCallMode = roomMode === "call";

  const webRTC = useWebRTC({
    roomId: watchRoom.room?.id || null,
    profileId: activeProfileId,
    profileName: activeProfileName,
    isHost: watchRoom.isHost,
    enabled: isCallMode && !!watchRoom.room,
  });

  // Auto-join room from URL param
  useEffect(() => {
    if (roomCodeParam && activeProfileId && !watchRoom.room) {
      watchRoom.joinRoom(roomCodeParam);
    }
  }, [roomCodeParam, activeProfileId]);

  // Compute next episode URL
  useEffect(() => {
    if (!tmdbId || !season || !episode || contentType === "movie") {
      setNextEpUrl(null);
      return;
    }
    let cancelled = false;
    getSeasonDetails(tmdbId, season).then((seasonData) => {
      if (cancelled) return;
      const nextEp = seasonData.episodes.find(e => e.episode_number === episode + 1);
      if (nextEp) {
        const slug = params.id || toSlug(bankTitle, tmdbId);
        const p = new URLSearchParams({ title: bankTitle, audio: audioParam, s: String(season), e: String(nextEp.episode_number) });
        if (imdbId) p.set("imdb", imdbId);
        setNextEpUrl(`/player/${contentType}/${slug}?${p.toString()}`);
      } else {
        setNextEpUrl(null);
      }
    }).catch(() => { if (!cancelled) setNextEpUrl(null); });
    return () => { cancelled = true; };
  }, [tmdbId, season, episode, contentType, bankTitle, audioParam, imdbId, params.id]);

  // Resolve video via extract-video edge function
  const extractionRef = useRef<string | null>(null);
  const playerRetryCount = useRef(0);

  const loadVideo = useCallback(async (skipCache = false) => {
    if (!params.id || !params.type || !tmdbId) return;
    setBankLoading(true);
    setBankSources([]);

    const cTypes = params.type === "movie" ? ["movie"] : ["series", "tv"];
    const aType = audioParam || "legendado";

    // If retrying, delete stale cache first
    if (skipCache) {
      console.log("[PlayerPage] Deleting stale cache, re-extracting...");
      let delQuery = supabase.from("video_cache").delete()
        .eq("tmdb_id", tmdbId).in("content_type", cTypes).eq("audio_type", aType);
      if (season) delQuery = delQuery.eq("season", season);
      else delQuery = delQuery.eq("season", 0);
      if (episode) delQuery = delQuery.eq("episode", episode);
      else delQuery = delQuery.eq("episode", 0);
      await delQuery;
    }

    try {
      if (!skipCache) {
        // 1. Title + cache check in parallel (FAST)
        let cacheQuery = supabase
          .from("video_cache")
          .select("video_url, video_type, provider, created_at")
          .eq("tmdb_id", tmdbId)
          .in("content_type", cTypes)
          .eq("audio_type", aType)
          .gt("expires_at", new Date().toISOString());
        if (season) cacheQuery = cacheQuery.eq("season", season);
        else cacheQuery = cacheQuery.eq("season", 0);
        if (episode) cacheQuery = cacheQuery.eq("episode", episode);
        else cacheQuery = cacheQuery.eq("episode", 0);

        const [titleResult, cacheResult] = await Promise.all([
          supabase.from("content").select("title").eq("tmdb_id", tmdbId).in("content_type", cTypes).maybeSingle(),
          cacheQuery.order("created_at", { ascending: false }).limit(20),
        ]);

        if (titleResult.data?.title) setBankTitle(titleResult.data.title);

        const providerRank = (provider?: string) => {
          const p = (provider || "").toLowerCase();
          if (p === "manual") return 130;
          if (p === "cineveo-api") return 120;
          if (p === "cineveo-iptv") return 110;
          if (p === "cineveo") return 100;
          return 70;
        };

        const isLikelyBrokenCacheUrl = (url?: string, provider?: string) => {
          if (!url) return true;
          if ((provider || "").toLowerCase() !== "cineveo-api") return false;
          return /cdn\.cineveo\.site\/.*%2520/i.test(url);
        };

        const pickBest = (rows: any[]) => {
          return (rows || [])
            .filter((row: any) => row?.video_url && row?.video_type !== "mega-embed" && !isLikelyBrokenCacheUrl(row?.video_url, row?.provider))
            .sort((a: any, b: any) => providerRank(b.provider) - providerRank(a.provider))[0] || null;
        };

        let bestCached = pickBest(cacheResult.data || []);

        // Fallback de áudio: se não houver no áudio solicitado, usa o melhor disponível
        if (!bestCached) {
          let anyAudioQuery = supabase
            .from("video_cache")
            .select("video_url, video_type, provider, created_at")
            .eq("tmdb_id", tmdbId)
            .in("content_type", cTypes)
            .gt("expires_at", new Date().toISOString());

          if (season) anyAudioQuery = anyAudioQuery.eq("season", season);
          else anyAudioQuery = anyAudioQuery.eq("season", 0);
          if (episode) anyAudioQuery = anyAudioQuery.eq("episode", episode);
          else anyAudioQuery = anyAudioQuery.eq("episode", 0);

          const { data: anyAudioRows } = await anyAudioQuery.order("created_at", { ascending: false }).limit(20);
          bestCached = pickBest(anyAudioRows || []);
        }

        // 2. If cache hit, use instantly
        if (bestCached?.video_url) {
          if (bestCached.video_type === "iframe-proxy") {
            console.log("[PlayerPage] Cache hit: iframe-proxy");
            setIframeProxyUrl(bestCached.video_url);
            setBankLoading(false);
            return;
          }
          // Try to sign the URL; if signing fails, use the raw URL as fallback
          let finalUrl = bestCached.video_url;
          try {
            const signed = await secureVideoUrl(bestCached.video_url);
            if (signed && signed !== bestCached.video_url) finalUrl = signed;
          } catch { /* use raw */ }
          setBankSources([{
            url: finalUrl,
            quality: "auto",
            provider: bestCached.provider || "cache",
            type: bestCached.video_type === "mp4" ? "mp4" : "m3u8",
          }]);
          setBankLoading(false);
          return;
        }
      }

      // 3. Call extract-video
      const extractCType = params.type === "movie" ? "movie" : "tv";
      const { data } = await supabase.functions.invoke("extract-video", {
        body: { tmdb_id: tmdbId, imdb_id: imdbId, content_type: extractCType, audio_type: aType, season, episode },
      });

      if (data?.url) {
        if (data.type === "iframe-proxy") {
          console.log("[PlayerPage] Extract returned iframe-proxy");
          setIframeProxyUrl(data.url);
          setBankLoading(false);
          return;
        }
        let finalUrl = data.url;
        try {
          const signed = await secureVideoUrl(data.url);
          if (signed && signed !== data.url) finalUrl = signed;
        } catch { /* use raw */ }
        setBankSources([{
          url: finalUrl,
          quality: "auto",
          provider: data.provider || "cache",
          type: data.type === "mp4" ? "mp4" : "m3u8",
        }]);
        setBankLoading(false);
        return;
      }

      setError(true);
    } catch {
      setError(true);
    }
    setBankLoading(false);
  }, [params.id, params.type, audioParam, imdbId, season, episode, tmdbId]);

  // Initial load
  useEffect(() => {
    if (!params.id || !params.type) return;
    const key = `${params.type}-${params.id}-${audioParam}-${season}-${episode}`;
    if (extractionRef.current === key) return;
    extractionRef.current = key;
    playerRetryCount.current = 0;
    loadVideo(false);
  }, [params.id, params.type, audioParam, imdbId, season, episode, tmdbId, loadVideo]);

  const sources: VideoSource[] = useMemo(() => {
    if (bankSources.length > 0) return bankSources;
    if (videoUrl) return [{ url: videoUrl, quality: "auto", provider: "Stream", type: videoType }];
    return [];
  }, [bankSources, videoUrl, videoType]);

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
  const [activePlayingLevel, setActivePlayingLevel] = useState(-1);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [savedTime, setSavedTime] = useState(0);
  const [ccEnabled, setCcEnabled] = useState(false);
  const [ccTracks, setCcTracks] = useState<TextTrack[]>([]);
  const [seekIndicator, setSeekIndicator] = useState<{ time: number; direction: "fwd" | "bwd" } | null>(null);
  const seekIndicatorTimer = useRef<ReturnType<typeof setTimeout>>();

  const showSeekIndicator = useCallback((time: number, direction: "fwd" | "bwd") => {
    setSeekIndicator({ time, direction });
    clearTimeout(seekIndicatorTimer.current);
    seekIndicatorTimer.current = setTimeout(() => setSeekIndicator(null), 1200);
  }, []);

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const source = sources[currentSourceIdx];

  // Auto-fullscreen on mobile (Android only — iOS webkitEnterFullscreen hijacks native player)
  useEffect(() => {
    if (!isMobile) return;
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    // iOS: do NOT use webkitEnterFullscreen — it opens the native player and hides custom controls
    // Instead, rely on CSS fixed inset-0 for full-screen experience on iOS
    if (!isIOS && containerRef.current && !document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setFullscreen(true)).catch(() => {});
    }
    // Force landscape on Android
    if (!isIOS) {
      try { (screen.orientation as any)?.lock?.("landscape").catch(() => {}); } catch {}
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
          season, episode,
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

  // HLS / Video Attach - stabilized to prevent double loading
  const attachedSourceRef = useRef<string | null>(null);
  const attachSource = useCallback((src: VideoSource, force = false) => {
    const video = videoRef.current;
    if (!video) return;
    const srcKey = src.url;
    if (!force && attachedSourceRef.current === srcKey) return; // Already attached
    attachedSourceRef.current = srcKey;

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    setLoading(true);
    setError(false);
    setHlsLevels([]);
    setCurrentLevel(-1);

    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const useNativeHLS = src.type === "m3u8" && !Hls.isSupported() && video.canPlayType("application/vnd.apple.mpegurl");

    if (src.type === "m3u8" && Hls.isSupported()) {
      video.crossOrigin = "anonymous";
    } else if (src.type === "mp4") {
      const isTokenStream = src.url.includes("/functions/v1/video-token") || src.url.includes(".supabase.co/functions/v1/video-token");
      if (isTokenStream) {
        // Token stream endpoint returns proper CORS headers; use CORS mode to avoid ORB blocking
        video.crossOrigin = "anonymous";
      } else {
        // Direct mp4 links often break on iOS/CORS with anonymous mode
        video.removeAttribute("crossorigin");
      }
    } else if (useNativeHLS) {
      // iOS native HLS: keep native behavior
      video.removeAttribute("crossorigin");
    } else {
      video.crossOrigin = "anonymous";
    }
    if (src.type === "m3u8" && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        startLevel: -1,
        abrEwmaDefaultEstimate: 2000000,
        abrBandWidthUpFactor: 0.7,
        maxBufferLength: 15,
        maxMaxBufferLength: 60,
        maxBufferSize: 30 * 1000 * 1000,
        maxBufferHole: 0.3,
        startFragPrefetch: true,
        testBandwidth: false,
        progressive: true,
        fragLoadingTimeOut: 12000,
        fragLoadingMaxRetry: 4,
        fragLoadingRetryDelay: 500,
        manifestLoadingTimeOut: 8000,
        manifestLoadingMaxRetry: 3,
        levelLoadingTimeOut: 8000,
        levelLoadingMaxRetry: 3,
        backBufferLength: 30,
        xhrSetup: (xhr) => { xhr.withCredentials = false; },
      } as any);
      hlsRef.current = hls;
      hls.loadSource(src.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        setLoading(false);
        setHlsLevels(data.levels.map(l => ({ height: l.height, bitrate: l.bitrate })));
        video.play().catch(() => {});
        // Enable subtitle tracks if available
        if (hls.subtitleTracks?.length > 0) {
          setCcTracks(Array.from(video.textTracks));
          hls.subtitleDisplay = ccEnabled;
          if (ccEnabled) hls.subtitleTrack = 0;
        }
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => setActivePlayingLevel(data.level));
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
        if (hls.subtitleTracks?.length > 0) {
          setCcTracks(Array.from(video.textTracks));
        }
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            setError(true);
            setLoading(false);
          }
        }
      });
      hls.on(Hls.Events.FRAG_LOADED, () => { setLoading(false); });
    } else if (useNativeHLS) {
      // iOS native HLS — no crossOrigin, use native player inline
      video.src = src.url;
      video.addEventListener("loadedmetadata", () => {
        setLoading(false);
        video.play().catch(() => {
          // iOS requires user gesture — show play button, don't error
          setPlaying(false);
        });
      }, { once: true });
      video.addEventListener("error", (e) => {
        console.error("[Player] iOS native HLS error:", (video as any).error);
        setError(true); setLoading(false);
      }, { once: true });
      video.load(); // Force iOS to start loading
    } else {
      video.preload = "auto";
      video.src = src.url;
      video.addEventListener("loadeddata", () => { setLoading(false); video.play().catch(() => {}); }, { once: true });
      video.addEventListener("canplay", () => { setLoading(false); video.play().catch(() => {}); }, { once: true });
    }
    if (!useNativeHLS) {
      video.addEventListener("error", () => { setError(true); setLoading(false); }, { once: true });
    }
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
      
      // Show "Next Episode" popup 10s before end
      if (nextEpUrl && video.duration > 0) {
        const remaining = video.duration - video.currentTime;
        if (remaining <= 10 && remaining > 0 && !showNextEp) {
          setShowNextEp(true);
        }
      }
    };
    const onDur = () => setDuration(video.duration || 0);
    const onWait = () => setLoading(true);
    const onCan = () => setLoading(false);
    const onEnded = () => {
      // Auto-play next episode
      if (nextEpUrl) goNextEpisode();
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("durationchange", onDur);
    video.addEventListener("waiting", onWait);
    video.addEventListener("canplay", onCan);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("durationchange", onDur);
      video.removeEventListener("waiting", onWait);
      video.removeEventListener("canplay", onCan);
      video.removeEventListener("ended", onEnded);
    };
  }, [nextEpUrl, showNextEp]);

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
        case "ArrowLeft": {
          video.currentTime = Math.max(0, video.currentTime - 10);
          showSeekIndicator(video.currentTime, "bwd");
          break;
        }
        case "ArrowRight": {
          video.currentTime = Math.min(duration, video.currentTime + 10);
          showSeekIndicator(video.currentTime, "fwd");
          break;
        }
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
    const v = videoRef.current;
    if (v && tmdbId && v.currentTime > 5) {
      saveWatchProgress({
        tmdb_id: tmdbId, content_type: contentType, season, episode,
        progress_seconds: v.currentTime, duration_seconds: v.duration || 0,
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
        if ((video as any).webkitDisplayingFullscreen) (video as any).webkitExitFullscreen?.();
        else (video as any).webkitEnterFullscreen?.();
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

  const toggleCC = () => {
    const newState = !ccEnabled;
    setCcEnabled(newState);
    const video = videoRef.current;
    const hls = hlsRef.current;
    
    if (hls) {
      if (hls.subtitleTracks?.length > 0) {
        hls.subtitleDisplay = newState;
        hls.subtitleTrack = newState ? 0 : -1;
      }
    }
    
    // Also handle native text tracks (for mp4 or Safari HLS)
    if (video) {
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = newState ? "showing" : "hidden";
      }
    }
  };

  const changeQuality = (level: number) => {
    if (hlsRef.current) hlsRef.current.currentLevel = level;
    setShowSettings(false);
  };

  const nextSource = () => {
    if (currentSourceIdx < sources.length - 1) setCurrentSourceIdx(i => i + 1);
  };

  const goNextEpisode = () => {
    if (!nextEpUrl) return;
    const v = videoRef.current;
    if (v && tmdbId) {
      saveWatchProgress({
        tmdb_id: tmdbId, content_type: contentType, season, episode,
        progress_seconds: v.currentTime, duration_seconds: v.duration || 0, completed: true,
      });
    }
    setShowNextEp(false);
    navigate(nextEpUrl, { replace: true });
  };

  // Force landscape on mobile
  useEffect(() => {
    if (isMobile) {
      try { (screen.orientation as any)?.lock?.("landscape").catch(() => {}); } catch {}
    }
    return () => { try { (screen.orientation as any)?.unlock?.(); } catch {} };
  }, [isMobile]);

  // Cleanup: stop video when leaving the page
  useEffect(() => {
    return () => {
      const v = videoRef.current;
      if (v) { v.pause(); v.src = ""; v.load(); }
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      clearTimeout(nextEpTimerRef.current);
    };
  }, []);

  // Iframe-proxy mode: show interceptor fullscreen
  if (iframeProxyUrl) {
    return (
      <div className="fixed inset-0 z-[100] bg-black">
        <IframeInterceptor
          proxyUrl={iframeProxyUrl}
          title={bankTitle}
          onVideoFound={(url, type) => {
            console.log("[PlayerPage] Iframe intercepted video:", type);
            setIframeProxyUrl(null);
            setBankSources([{ url, quality: "auto", provider: "intercepted", type }]);
          }}
          onError={() => {
            // Stay on iframe as fallback player
            console.log("[PlayerPage] Iframe interception failed, staying on iframe");
          }}
          onClose={goBack}
        />
      </div>
    );
  }


  return (
    <div ref={containerRef} className="fixed inset-0 z-[100] bg-black group"
      onMouseMove={resetControlsTimer} onTouchStart={resetControlsTimer}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('input') || target.tagName === 'INPUT') return;
        togglePlay();
      }}
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('input') || target.tagName === 'INPUT') return;
        toggleFullscreen();
      }}
      style={{ cursor: showControls ? "default" : "none" }}>
      
      <video ref={videoRef} className="w-full h-full object-contain" playsInline webkit-playsinline="true" preload="auto" autoPlay={false}
        onPlay={() => {
          if (watchRoom.isHost && watchRoom.room) {
            watchRoom.broadcastPlayback({ action: "play", position: videoRef.current?.currentTime || 0, timestamp: Date.now() });
          }
        }}
        onPause={() => {
          if (watchRoom.isHost && watchRoom.room) {
            watchRoom.broadcastPlayback({ action: "pause", position: videoRef.current?.currentTime || 0, timestamp: Date.now() });
          }
        }}
        onSeeked={() => {
          if (watchRoom.isHost && watchRoom.room) {
            watchRoom.broadcastPlayback({ action: "seek", position: videoRef.current?.currentTime || 0, timestamp: Date.now() });
          }
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

      {/* Netflix-style Next Episode popup (10s before end) */}
      {showNextEp && nextEpUrl && (
        <div className="absolute bottom-20 sm:bottom-24 right-4 sm:right-8 z-30 animate-fade-in">
          <div className="bg-card/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-5 shadow-2xl max-w-xs">
            <p className="text-[10px] sm:text-xs text-muted-foreground mb-2 uppercase tracking-wider font-semibold">Próximo episódio</p>
            <p className="text-sm sm:text-base font-bold text-foreground mb-3">
              {season && episode ? `T${season} • E${episode + 1}` : "Próximo"}
            </p>
            <div className="flex gap-2">
              <button
                onClick={goNextEpisode}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all"
              >
                <Play className="w-4 h-4 fill-current" />
                Reproduzir
              </button>
              <button
                onClick={() => setShowNextEp(false)}
                className="px-3 py-2.5 rounded-xl bg-white/10 text-sm font-medium hover:bg-white/20 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {(loading || bankLoading) && !error && sources.length === 0 && (
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

      {/* Buffering spinner (when video is loaded but buffering) */}
      {loading && !error && sources.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {(error || (!bankLoading && !loading && sources.length === 0)) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
            <span className="text-[100px] sm:text-[140px] font-black tracking-wider text-white select-none">LYNEFLIX</span>
          </div>
          <div className="relative text-center p-6 sm:p-8 max-w-sm mx-4 bg-card/80 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-5">
              <Settings className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Ops! Tivemos um probleminha</h3>
            <p className="text-sm text-white/50 mb-6 leading-relaxed">
              Nossa equipe está mexendo na infraestrutura. Clique abaixo para avisar!
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  const btn = document.getElementById("player-report-btn");
                  if (btn) { btn.textContent = "✓ Equipe avisada!"; btn.classList.add("bg-green-600"); }
                }}
                id="player-report-btn"
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all duration-200"
              >
                <AlertTriangle className="w-4 h-4" /> Avisar a equipe
              </button>
              <div className="flex gap-2">
                {error && (
                  <button onClick={() => {
                    if (playerRetryCount.current < 2) {
                      playerRetryCount.current++;
                      extractionRef.current = null;
                      setError(false);
                      loadVideo(true);
                    } else if (source) {
                      attachSource(source, true);
                    }
                  }} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors">
                    <RefreshCw className="w-4 h-4" /> Tentar de novo
                  </button>
                )}
                <button onClick={goBack} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 text-white/70 text-sm font-medium hover:bg-white/10 transition-colors">
                  <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Big play button */}
      {!playing && !loading && !error && !showResumePrompt && (
        <div className="absolute inset-0 flex items-center justify-center z-5 pointer-events-none">
          <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center shadow-2xl">
            <Play className="w-7 h-7 sm:w-9 sm:h-9 lg:w-11 lg:h-11 text-white fill-white ml-1" />
          </div>
        </div>
      )}

      {/* Seek Indicator */}
      {seekIndicator && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none animate-fade-in">
          <div className="flex flex-col items-center gap-2 bg-black/60 backdrop-blur-md rounded-2xl px-8 py-5">
            <span className="text-white text-sm sm:text-base font-bold truncate max-w-[280px]">{bankTitle}</span>
            {season && episode && <span className="text-white/50 text-xs">T{season} • E{episode}</span>}
            <div className="flex items-center gap-2 mt-1">
              {seekIndicator.direction === "bwd" ? <SkipBack className="w-5 h-5 text-white" /> : <SkipForward className="w-5 h-5 text-white" />}
              <span className="text-white text-2xl sm:text-3xl font-bold font-mono tabular-nums">{formatTime(seekIndicator.time)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div data-controls className={`absolute inset-0 z-10 transition-opacity duration-500 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        {/* Top */}
        <div className="absolute top-0 left-0 right-0 h-24 sm:h-28 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          <div className="flex items-start justify-between p-3 sm:p-4 lg:p-6">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <button onClick={goBack} className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors flex-shrink-0">
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </button>
              <div className="min-w-0">
                <h2 className="text-white text-sm sm:text-base lg:text-xl font-bold truncate drop-shadow-lg">{bankTitle}</h2>
                {season && episode && <p className="text-white/50 text-[10px] sm:text-xs lg:text-sm truncate">T{season} • E{episode}</p>}
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
              <button onClick={() => { if (videoRef.current) { videoRef.current.currentTime -= 10; showSeekIndicator(videoRef.current.currentTime, "bwd"); } }} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-xl transition-colors">
                <SkipBack className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </button>
              <button onClick={() => { if (videoRef.current) { videoRef.current.currentTime += 10; showSeekIndicator(videoRef.current.currentTime, "fwd"); } }} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-xl transition-colors">
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
              {/* Subtitles toggle */}
              <button onClick={toggleCC} className={`p-1.5 sm:p-2 hover:bg-white/10 rounded-xl transition-colors ${ccEnabled ? "text-primary" : "text-white"}`} title={ccEnabled ? "Desativar legendas" : "Ativar legendas"}>
                <Subtitles className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              {/* Next episode button in controls */}
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
                            <span className="text-[10px] text-white/40">
                              {currentLevel === -1 && hlsLevels.length > 0 && activePlayingLevel >= 0
                                ? `(${hlsLevels[activePlayingLevel]?.height || "—"}p)`
                                : ""}
                            </span>
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