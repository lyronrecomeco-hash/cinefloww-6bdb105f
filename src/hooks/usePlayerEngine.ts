import { useRef, useState, useEffect, useCallback } from "react";
import Hls from "hls.js";
import { supabase } from "@/integrations/supabase/client";
import { signVideoUrl } from "@/lib/videoUrl";
import { saveWatchProgress, getWatchProgress } from "@/lib/watchProgress";

// ── Types ──
export interface QualityLevel {
  index: number;
  height: number;
  bitrate: number;
  label: string;
}

export interface EngineState {
  playing: boolean;
  loading: boolean;
  error: string | null;
  muted: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  buffered: number;
  speed: number;
  qualities: QualityLevel[];
  currentQuality: number; // -1 = auto
  networkSpeed: number; // Mbps estimate
  isStalled: boolean;
  retryCount: number;
}

interface EngineConfig {
  tmdbId: string | null;
  contentType: string;
  season?: string | null;
  episode?: string | null;
}

// ── Constants ──
const STALL_THRESHOLD_MS = 8000;
const PROGRESS_SAVE_INTERVAL = 10_000; // save every 10s
const MAX_RETRIES = 5;
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];

export function usePlayerEngine(config: EngineConfig) {
  const { tmdbId, contentType, season, episode } = config;

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTimeRef = useRef(0);
  const retryCountRef = useRef(0);
  const sourceUrlRef = useRef<string>("");
  const sourceTypeRef = useRef<string>("");
  const cancelledRef = useRef(false);
  const networkSamplesRef = useRef<number[]>([]);

  const [state, setState] = useState<EngineState>({
    playing: false,
    loading: true,
    error: null,
    muted: false,
    volume: 1,
    currentTime: 0,
    duration: 0,
    buffered: 0,
    speed: 1,
    qualities: [],
    currentQuality: -1,
    networkSpeed: 0,
    isStalled: false,
    retryCount: 0,
  });

  const patch = useCallback((p: Partial<EngineState>) => setState(prev => ({ ...prev, ...p })), []);

  // ── HLS Configuration — aggressive ABR + smart buffer ──
  const buildHlsConfig = useCallback((): Partial<Hls["config"]> => {
    const bw = state.networkSpeed;
    // Dynamic buffer: slow connection = smaller buffer to start faster, fast = large buffer for smooth playback
    const maxBuffer = bw > 5 ? 120 : bw > 2 ? 60 : 30;
    const maxMaxBuffer = bw > 5 ? 600 : bw > 2 ? 300 : 120;

    return {
      // ABR — smooth quality switching
      startLevel: -1, // auto-detect best level
      abrEwmaDefaultEstimate: 1_000_000, // 1 Mbps initial estimate
      abrEwmaFastLive: 3,
      abrEwmaSlowLive: 9,
      abrEwmaFastVoD: 3,
      abrEwmaSlowVoD: 9,
      abrBandWidthFactor: 0.95,
      abrBandWidthUpFactor: 0.7,

      // Smart buffer
      maxBufferLength: maxBuffer,
      maxMaxBufferLength: maxMaxBuffer,
      maxBufferSize: 60 * 1000 * 1000, // 60MB
      maxBufferHole: 0.5,

      // Fast start
      lowLatencyMode: false, // VOD, not live
      backBufferLength: 30,
      startFragPrefetch: true,

      // Resilience
      fragLoadingTimeOut: 15000,
      fragLoadingMaxRetry: 8,
      fragLoadingRetryDelay: 1000,
      fragLoadingMaxRetryTimeout: 30000,
      manifestLoadingTimeOut: 10000,
      manifestLoadingMaxRetry: 4,
      manifestLoadingRetryDelay: 1000,
      levelLoadingTimeOut: 10000,
      levelLoadingMaxRetry: 6,
      levelLoadingRetryDelay: 1000,

      // Progressive loading for faster start
      progressive: true,
    };
  }, [state.networkSpeed]);

  // ── Network speed estimation ──
  const updateNetworkSpeed = useCallback((bytes: number, durationMs: number) => {
    if (durationMs <= 0) return;
    const mbps = (bytes * 8) / (durationMs * 1000); // Mbps
    const samples = networkSamplesRef.current;
    samples.push(mbps);
    if (samples.length > 20) samples.shift();
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    patch({ networkSpeed: Math.round(avg * 100) / 100 });
  }, [patch]);

  // ── Stall detection ──
  const resetStallDetection = useCallback(() => {
    if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    patch({ isStalled: false });
  }, [patch]);

  const startStallDetection = useCallback(() => {
    if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    stallTimerRef.current = setTimeout(() => {
      const v = videoRef.current;
      if (!v) return;
      // Check if video is truly stalled (time hasn't progressed)
      if (Math.abs(v.currentTime - lastTimeRef.current) < 0.5 && !v.paused && !v.ended) {
        patch({ isStalled: true });
        console.warn("[Engine] Stall detected, attempting recovery...");
        recoverFromStall();
      }
    }, STALL_THRESHOLD_MS);
  }, [patch]);

  // ── Recovery strategies ──
  const recoverFromStall = useCallback(() => {
    const v = videoRef.current;
    const hls = hlsRef.current;
    if (!v) return;

    // Strategy 1: HLS recovery
    if (hls) {
      const currentLevel = hls.currentLevel;
      // Try to recover by seeking slightly forward
      if (v.currentTime > 0) {
        v.currentTime += 0.1;
      }
      // If we have multiple levels, try a lower quality
      if (hls.levels.length > 1 && currentLevel > 0) {
        hls.currentLevel = currentLevel - 1;
        console.log("[Engine] Dropped to quality level", currentLevel - 1);
      }
      // Trigger HLS recovery
      hls.startLoad(Math.floor(v.currentTime));
      patch({ isStalled: false });
      return;
    }

    // Strategy 2: MP4 — try seeking
    if (v.currentTime > 0) {
      v.currentTime = v.currentTime + 0.1;
    }
    v.play().catch(() => {});
    patch({ isStalled: false });
  }, [patch]);

  const retryLoad = useCallback(async () => {
    const count = retryCountRef.current;
    if (count >= MAX_RETRIES) {
      patch({ error: "Falha após múltiplas tentativas", loading: false });
      return;
    }
    retryCountRef.current = count + 1;
    patch({ retryCount: count + 1, error: null, loading: true });
    const delay = RETRY_DELAYS[Math.min(count, RETRY_DELAYS.length - 1)];
    console.log(`[Engine] Retry ${count + 1}/${MAX_RETRIES} in ${delay}ms`);
    await new Promise(r => setTimeout(r, delay));
    loadSource();
  }, []);

  // ── Quality management ──
  const setQuality = useCallback((levelIndex: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    if (levelIndex === -1) {
      hls.currentLevel = -1; // auto ABR
      patch({ currentQuality: -1 });
    } else {
      hls.currentLevel = levelIndex;
      patch({ currentQuality: levelIndex });
    }
  }, [patch]);

  // ── Watch progress persistence ──
  const saveProgress = useCallback(() => {
    const v = videoRef.current;
    if (!v || !tmdbId || !v.duration || v.duration < 10) return;
    const completed = v.currentTime / v.duration > 0.92;
    saveWatchProgress({
      tmdb_id: Number(tmdbId),
      content_type: contentType,
      season: season ? Number(season) : undefined,
      episode: episode ? Number(episode) : undefined,
      progress_seconds: Math.floor(v.currentTime),
      duration_seconds: Math.floor(v.duration),
      completed,
    });
  }, [tmdbId, contentType, season, episode]);

  const restoreProgress = useCallback(async () => {
    if (!tmdbId) return 0;
    const data = await getWatchProgress(
      Number(tmdbId),
      contentType,
      season ? Number(season) : undefined,
      episode ? Number(episode) : undefined
    );
    if (data && !data.completed && data.progress_seconds > 5) {
      return data.progress_seconds;
    }
    return 0;
  }, [tmdbId, contentType, season, episode]);

  // ── Core: load source ──
  const loadSource = useCallback(async () => {
    if (!tmdbId) { patch({ error: "Nenhum conteúdo especificado", loading: false }); return; }

    cancelledRef.current = false;
    patch({ loading: true, error: null });

    try {
      const body: Record<string, unknown> = { tmdb_id: Number(tmdbId), content_type: contentType };
      if (season) body.season = Number(season);
      if (episode) body.episode = Number(episode);

      const { data, error: fnErr } = await supabase.functions.invoke("extract-video", { body });
      if (cancelledRef.current) return;
      if (fnErr) throw fnErr;
      if (!data?.url) throw new Error("Conteúdo não encontrado");

      sourceUrlRef.current = data.url;
      sourceTypeRef.current = data.type || "mp4";

      const finalUrl = await signVideoUrl(data.url);
      const video = videoRef.current;
      if (!video || cancelledRef.current) return;

      video.preload = "auto";

      // Restore progress before attaching source
      const savedTime = await restoreProgress();

      // Destroy previous HLS instance
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

      if (data.type === "m3u8" && Hls.isSupported()) {
        attachHls(finalUrl, video, savedTime);
      } else if (data.type === "m3u8" && video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari native HLS
        video.src = finalUrl;
        video.load();
        video.addEventListener("loadedmetadata", () => {
          if (savedTime > 0) video.currentTime = savedTime;
          video.play().catch(() => { video.muted = true; patch({ muted: true }); video.play().catch(() => {}); });
        }, { once: true });
      } else {
        // MP4 fallback
        video.src = finalUrl;
        video.load();
        video.addEventListener("loadedmetadata", () => {
          if (savedTime > 0) video.currentTime = savedTime;
          video.play().catch(() => { video.muted = true; patch({ muted: true }); video.play().catch(() => {}); });
        }, { once: true });
      }

      retryCountRef.current = 0;
      patch({ retryCount: 0 });
    } catch (err: unknown) {
      if (!cancelledRef.current) {
        console.error("[Engine] Load error:", err);
        retryLoad();
      }
    }
  }, [tmdbId, contentType, season, episode, patch, restoreProgress, retryLoad]);

  // ── HLS attach with full event wiring ──
  const attachHls = useCallback((url: string, video: HTMLVideoElement, savedTime: number) => {
    const config = buildHlsConfig();
    const hls = new Hls(config as any);
    hlsRef.current = hls;

    hls.loadSource(url);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
      // Build quality levels
      const qualities: QualityLevel[] = data.levels.map((lvl, i) => ({
        index: i,
        height: lvl.height,
        bitrate: lvl.bitrate,
        label: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}kbps`,
      }));
      patch({ qualities, currentQuality: -1 });

      // Seek to saved position before playing
      if (savedTime > 0) {
        hls.startLoad(Math.floor(savedTime));
        video.addEventListener("loadeddata", () => {
          video.currentTime = savedTime;
          video.play().catch(() => { video.muted = true; patch({ muted: true }); video.play().catch(() => {}); });
        }, { once: true });
      } else {
        video.play().catch(() => { video.muted = true; patch({ muted: true }); video.play().catch(() => {}); });
      }
    });

    // Network speed tracking from fragment loads
    hls.on(Hls.Events.FRAG_LOADED, (_e, data) => {
      if (data.frag.stats.loading) {
        const size = data.frag.stats.total || 0;
        const loadTime = data.frag.stats.loading.end - data.frag.stats.loading.start;
        if (size > 0 && loadTime > 0) updateNetworkSpeed(size, loadTime);
      }
    });

    // ABR level switch — seamless
    hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
      patch({ currentQuality: data.level });
      console.log(`[Engine] ABR switched to level ${data.level}`);
    });

    // Error recovery
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return;
      console.error("[Engine] Fatal HLS error:", data.type, data.details);

      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          console.log("[Engine] Network error, attempting recovery...");
          hls.startLoad();
          break;
        case Hls.ErrorTypes.MEDIA_ERROR:
          console.log("[Engine] Media error, attempting recovery...");
          hls.recoverMediaError();
          break;
        default:
          // Unrecoverable — retry from scratch
          hls.destroy();
          hlsRef.current = null;
          retryLoad();
          break;
      }
    });
  }, [buildHlsConfig, patch, updateNetworkSpeed, retryLoad]);

  // ── Video element events ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => { patch({ playing: true, loading: false }); resetStallDetection(); };
    const onPause = () => { patch({ playing: false }); resetStallDetection(); };
    const onTimeUpdate = () => {
      const ct = video.currentTime;
      lastTimeRef.current = ct;
      patch({ currentTime: ct });
      if (video.buffered.length > 0) {
        patch({ buffered: video.buffered.end(video.buffered.length - 1) });
      }
      // Reset stall detection on progress
      resetStallDetection();
      if (!video.paused) startStallDetection();
    };
    const onDuration = () => patch({ duration: video.duration || 0 });
    const onWaiting = () => { patch({ loading: true }); startStallDetection(); };
    const onPlaying = () => { patch({ loading: false, isStalled: false }); resetStallDetection(); if (!video.paused) startStallDetection(); };
    const onError = () => {
      console.error("[Engine] Video element error");
      retryLoad();
    };
    const onEnded = () => {
      patch({ playing: false });
      saveProgress();
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDuration);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onError);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDuration);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onError);
      video.removeEventListener("ended", onEnded);
    };
  }, [patch, resetStallDetection, startStallDetection, retryLoad, saveProgress]);

  // ── Auto-save progress periodically ──
  useEffect(() => {
    progressTimerRef.current = setInterval(saveProgress, PROGRESS_SAVE_INTERVAL);
    return () => { if (progressTimerRef.current) clearInterval(progressTimerRef.current); };
  }, [saveProgress]);

  // ── Save on page leave (beacon) ──
  useEffect(() => {
    const onBeforeUnload = () => saveProgress();
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") saveProgress(); };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [saveProgress]);

  // ── Initial load ──
  useEffect(() => {
    cancelledRef.current = false;
    loadSource();
    return () => {
      cancelledRef.current = true;
      saveProgress();
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    };
  }, [tmdbId, contentType, season, episode]);

  // ── Controls ──
  const play = useCallback(() => videoRef.current?.play(), []);
  const pause = useCallback(() => videoRef.current?.pause(), []);
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (v) v.paused ? v.play() : v.pause();
  }, []);

  const seekTo = useCallback((time: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, Math.min(time, v.duration || 0));
  }, []);

  const seekRelative = useCallback((delta: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, Math.min(v.currentTime + delta, v.duration || 0));
  }, []);

  const setVolume = useCallback((vol: number) => {
    const v = videoRef.current;
    if (v) { v.volume = vol; v.muted = vol === 0; patch({ volume: vol, muted: vol === 0 }); }
  }, [patch]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (v) { v.muted = !v.muted; patch({ muted: v.muted }); }
  }, [patch]);

  const setSpeed = useCallback((s: number) => {
    const v = videoRef.current;
    if (v) { v.playbackRate = s; patch({ speed: s }); }
  }, [patch]);

  return {
    videoRef,
    state,
    controls: {
      play, pause, togglePlay,
      seekTo, seekRelative,
      setVolume, toggleMute,
      setSpeed, setQuality,
      retryLoad: loadSource,
    },
  };
}
