import { useRef, useState, useEffect, useCallback } from "react";
import Hls from "hls.js";
import { supabase } from "@/integrations/supabase/client";
import { signVideoUrl, buildMovieUrl, buildEpisodeUrl, isProductionDomain } from "@/lib/videoUrl";
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
const STALL_THRESHOLD_MS = 3000;
const PROGRESS_SAVE_INTERVAL = 10_000;
const MAX_RETRIES = 5;
const RETRY_DELAYS = [200, 500, 1200, 2500, 5000];

// ── OPT 2: Client-side URL cache ──
function getCachedUrl(tmdbId: string, contentType: string, season?: string | null, episode?: string | null): { url: string; type: string } | null {
  try {
    const key = `lyne_vc_${tmdbId}_${contentType}_${season || 0}_${episode || 0}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    // Cache valid for 30 minutes
    if (Date.now() - cached.ts > 30 * 60 * 1000) { sessionStorage.removeItem(key); return null; }
    return { url: cached.url, type: cached.type };
  } catch { return null; }
}

function setCachedUrl(tmdbId: string, contentType: string, season: string | null | undefined, episode: string | null | undefined, url: string, type: string) {
  try {
    const key = `lyne_vc_${tmdbId}_${contentType}_${season || 0}_${episode || 0}`;
    sessionStorage.setItem(key, JSON.stringify({ url, type, ts: Date.now() }));
  } catch {}
}

// ── OPT 1: Prefetch API (call before player mounts) ──
const prefetchMap = new Map<string, Promise<{ url: string; type: string } | null>>();

function normalizeCineveoHost(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (host === "cinetvembed.cineveo.site" || host.endsWith(".cineveo.site") || host.endsWith(".cineveo.lat")) {
      parsed.hostname = "cineveo.lat";
      parsed.protocol = "https:";
      return parsed.toString();
    }
  } catch {}
  return rawUrl;
}

function deriveDirectMp4(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (!(host.includes("cineveo") || host.includes("brstream"))) return null;

    if (parsed.pathname.toLowerCase().endsWith(".m3u8")) {
      parsed.pathname = parsed.pathname.replace(/\.m3u8$/i, ".mp4");
    }

    parsed.hostname = "cineveo.lat";
    parsed.protocol = "https:";
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeVideoForEnv(video: { url: string; type: string }): { url: string; type: string } {
  if (isProductionDomain()) return video;

  // Preview/dev: prefer direct MP4 to avoid HLS CORS/manifest failures.
  if (video.type === "m3u8") {
    const mp4 = deriveDirectMp4(video.url);
    if (mp4) return { url: mp4, type: "mp4" };
  }

  // Even for MP4, normalize host to cineveo.lat (stable direct playback).
  return { url: normalizeCineveoHost(video.url), type: video.type || "mp4" };
}

export function prefetchVideoUrl(tmdbId: string, contentType: string, season?: string | null, episode?: string | null) {
  const key = `${tmdbId}_${contentType}_${season || 0}_${episode || 0}`;
  if (prefetchMap.has(key)) return prefetchMap.get(key)!;

  // Check session cache first
  const cached = getCachedUrl(tmdbId, contentType, season, episode);
  if (cached) {
    const normalizedCached = normalizeVideoForEnv(cached);
    const p = Promise.resolve(normalizedCached);
    prefetchMap.set(key, p);
    return p;
  }

  const body: Record<string, unknown> = { tmdb_id: Number(tmdbId), content_type: contentType };
  if (season) body.season = Number(season);
  if (episode) body.episode = Number(episode);

  const p = supabase.functions.invoke("extract-video", { body }).then(({ data, error }) => {
    if (error || !data?.url) return null;
    const normalized = normalizeVideoForEnv({ url: data.url, type: data.type || "mp4" });
    setCachedUrl(tmdbId, contentType, season, episode, normalized.url, normalized.type);
    return normalized;
  }).catch(() => null);

  prefetchMap.set(key, p);
  return p;
}

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
  const hasPlayedRef = useRef(false);

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

  // ── HLS Configuration — 7 optimizations applied ──
  const buildHlsConfig = useCallback((): Partial<Hls["config"]> => {
    return {
      // Instant start: lowest quality first, ABR scales up aggressively
      startLevel: 0,
      abrEwmaDefaultEstimate: 5_000_000, // Assume fast connection initially
      abrEwmaFastLive: 2,
      abrEwmaSlowLive: 4,
      abrEwmaFastVoD: 2,
      abrEwmaSlowVoD: 4,
      abrBandWidthFactor: 0.95,
      abrBandWidthUpFactor: 0.8,

      // Ultra-minimal initial buffer — play ASAP (2s enough for first frame)
      maxBufferLength: 3,
      maxMaxBufferLength: 120,
      maxBufferSize: 60 * 1000 * 1000,
      maxBufferHole: 0.5,

      // Fast start
      lowLatencyMode: false,
      backBufferLength: 0,
      startFragPrefetch: true,
      enableWorker: true,

      // Faster timeouts for quicker failure detection
      fragLoadingTimeOut: 6000,
      fragLoadingMaxRetry: 6,
      fragLoadingRetryDelay: 200,
      fragLoadingMaxRetryTimeout: 12000,
      manifestLoadingTimeOut: 5000,
      manifestLoadingMaxRetry: 3,
      manifestLoadingRetryDelay: 200,
      levelLoadingTimeOut: 5000,
      levelLoadingMaxRetry: 4,
      levelLoadingRetryDelay: 200,
    };
  }, []);

  // ── Network speed estimation ──
  const updateNetworkSpeed = useCallback((bytes: number, durationMs: number) => {
    if (durationMs <= 0) return;
    const mbps = (bytes * 8) / (durationMs * 1000);
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

    if (hls) {
      const currentLevel = hls.currentLevel;
      if (v.currentTime > 0) v.currentTime += 0.1;
      if (hls.levels.length > 1 && currentLevel > 0) {
        hls.currentLevel = currentLevel - 1;
        console.log("[Engine] Dropped to quality level", currentLevel - 1);
      }
      hls.startLoad(Math.floor(v.currentTime));
      patch({ isStalled: false });
      return;
    }

    if (v.currentTime > 0) v.currentTime = v.currentTime + 0.1;
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
      hls.currentLevel = -1;
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

  // ── Eager play helper ──
  const tryPlay = useCallback((video: HTMLVideoElement) => {
    if (hasPlayedRef.current) return;
    hasPlayedRef.current = true;
    video.play().catch(() => {
      video.muted = true;
      patch({ muted: true });
      video.play().catch(() => {});
    });
  }, [patch]);

  // ── Core: load source ──
  const loadSource = useCallback(async () => {
    if (!tmdbId) { patch({ error: "Nenhum conteúdo especificado", loading: false }); return; }

    cancelledRef.current = false;
    hasPlayedRef.current = false;
    patch({ loading: true, error: null });

    try {
      let videoData: { url: string; type: string } | null = null;

      // OPT 1 + 2: Check prefetch map and session cache first (zero-latency path)
      const prefetchKey = `${tmdbId}_${contentType}_${season || 0}_${episode || 0}`;
      const prefetchPromise = prefetchMap.get(prefetchKey);

      // Race: use whichever resolves first — cache or prefetch
      if (prefetchPromise) {
        videoData = await prefetchPromise;
      }

      if (!videoData) {
        videoData = getCachedUrl(tmdbId, contentType, season, episode);
      }

      if (!videoData) {
        // Build direct URL immediately as fallback while API loads
        const tmdbNum = Number(tmdbId);
        const directUrl = contentType === "movie"
          ? buildMovieUrl(tmdbNum)
          : buildEpisodeUrl(tmdbNum, Number(season || 1), Number(episode || 1));

        const body: Record<string, unknown> = { tmdb_id: Number(tmdbId), content_type: contentType };
        if (season) body.season = Number(season);
        if (episode) body.episode = Number(episode);

        // Race API vs timeout — if API takes >2s, use direct URL immediately
        const apiPromise = supabase.functions.invoke("extract-video", { body });
        const timeoutPromise = new Promise<null>(r => setTimeout(() => r(null), 2000));
        const raceResult = await Promise.race([apiPromise, timeoutPromise]);

        if (cancelledRef.current) return;
        
        if (raceResult && 'data' in raceResult && raceResult.data?.url) {
          videoData = normalizeVideoForEnv({ url: raceResult.data.url, type: raceResult.data.type || "mp4" });
          setCachedUrl(tmdbId, contentType, season, episode, videoData.url, videoData.type);
        } else {
          console.warn("[Engine] API slow/failed, using direct URL fallback");
          videoData = { url: directUrl, type: "mp4" };
        }
      }

      if (cancelledRef.current) return;

      // Normalize URL for current environment (preview/dev => direct MP4 when needed)
      videoData = normalizeVideoForEnv(videoData);

      sourceUrlRef.current = videoData.url;
      sourceTypeRef.current = videoData.type;

      const finalUrl = await signVideoUrl(videoData.url);
      const video = videoRef.current;
      if (!video || cancelledRef.current) return;

      video.preload = "auto";

      // For direct CineVeo URLs (non-proxied) OR any non-proxied environment,
      // remove crossOrigin and use no-referrer to avoid CORS/referrer blocks
      const isDirect = finalUrl.includes("cineveo.lat") || finalUrl.includes("cineveo.site") || finalUrl.includes("brstream") || !finalUrl.startsWith("/");
      if (isDirect) {
        video.removeAttribute("crossorigin");
        video.setAttribute("referrerpolicy", "no-referrer");
      }

      // Progress restore runs in parallel — don't block initial playback
      let savedTime = 0;
      const progressPromise = restoreProgress().then(t => { savedTime = t; }).catch(() => {});

      // Destroy previous HLS instance
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

      if (videoData.type === "m3u8" && Hls.isSupported()) {
        // OPT 4: Preload manifest in parallel with HLS init
        const manifestPreload = fetch(finalUrl, { mode: "cors", credentials: "omit" }).catch(() => null);
        attachHls(finalUrl, video, savedTime, manifestPreload);
      } else if (videoData.type === "m3u8" && video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = finalUrl;
        video.load();
        video.addEventListener("loadedmetadata", () => {
          if (savedTime > 0) video.currentTime = savedTime;
          tryPlay(video);
        }, { once: true });
      } else {
        video.src = finalUrl;
        video.load();
        video.addEventListener("loadedmetadata", () => {
          if (savedTime > 0) video.currentTime = savedTime;
          tryPlay(video);
        }, { once: true });
      }

      // Don't reset retry count here — only reset on successful playback
    } catch (err: unknown) {
      if (!cancelledRef.current) {
        console.error("[Engine] Load error:", err);
        retryLoad();
      }
    }
  }, [tmdbId, contentType, season, episode, patch, restoreProgress, retryLoad, tryPlay]);

  // ── HLS attach with full event wiring ──
  const attachHls = useCallback((url: string, video: HTMLVideoElement, savedTime: number, _manifestPreload: Promise<Response | null>) => {
    const config = buildHlsConfig();
    const hls = new Hls(config as any);
    hlsRef.current = hls;

    hls.loadSource(url);
    hls.attachMedia(video);

    // OPT 7: Eager play on FRAG_BUFFERED — play as soon as first fragment is buffered
    hls.on(Hls.Events.FRAG_BUFFERED, () => {
      if (!hasPlayedRef.current && video.readyState >= 2) {
        if (savedTime > 0) video.currentTime = savedTime;
        tryPlay(video);
      }
    });

    hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
      const qualities: QualityLevel[] = data.levels.map((lvl, i) => ({
        index: i,
        height: lvl.height,
        bitrate: lvl.bitrate,
        label: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}kbps`,
      }));
      patch({ qualities, currentQuality: -1 });

      // Also try to play on manifest parsed (fallback if FRAG_BUFFERED fires late)
      if (savedTime > 0) {
        hls.startLoad(Math.floor(savedTime));
        video.addEventListener("loadeddata", () => {
          video.currentTime = savedTime;
          tryPlay(video);
        }, { once: true });
      } else {
        tryPlay(video);
      }
    });

    // Network speed tracking
    hls.on(Hls.Events.FRAG_LOADED, (_e, data) => {
      if (data.frag.stats.loading) {
        const size = data.frag.stats.total || 0;
        const loadTime = data.frag.stats.loading.end - data.frag.stats.loading.start;
        if (size > 0 && loadTime > 0) updateNetworkSpeed(size, loadTime);
      }

      // After 5s of playback, ramp up buffers for smooth experience
      if (video.currentTime > 5 && hls.config) {
        (hls.config as any).backBufferLength = 30;
        (hls.config as any).maxBufferLength = 60;
        (hls.config as any).maxMaxBufferLength = 300;
      }
    });

    hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
      patch({ currentQuality: data.level });
      console.log(`[Engine] ABR switched to level ${data.level}`);
    });

    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return;
      console.error("[Engine] Fatal HLS error:", data.type, data.details);

      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          // On manifest load failure, fallback to direct MP4 derived from current URL.
          if (data.details === "manifestLoadError" || data.details === "manifestLoadTimeOut") {
            const mp4Url = deriveDirectMp4(sourceUrlRef.current);
            if (mp4Url) {
              console.log("[Engine] Manifest failed, switching to direct MP4 URL");
              hls.destroy();
              hlsRef.current = null;
              sourceUrlRef.current = mp4Url;
              sourceTypeRef.current = "mp4";

              // Clear stale cache/preload entry that may still point to m3u8
              try {
                const cacheKey = `lyne_vc_${tmdbId}_${contentType}_${season || 0}_${episode || 0}`;
                sessionStorage.removeItem(cacheKey);
              } catch {}
              prefetchMap.delete(`${tmdbId}_${contentType}_${season || 0}_${episode || 0}`);

              signVideoUrl(mp4Url).then((finalMp4) => {
                if (!video || cancelledRef.current) return;
                video.removeAttribute("crossorigin");
                video.setAttribute("referrerpolicy", "no-referrer");
                video.src = finalMp4;
                video.load();
                video.addEventListener("loadedmetadata", () => { tryPlay(video); }, { once: true });
              });
            } else {
              console.log("[Engine] Manifest failed, no direct mp4 derived; retrying...");
              hls.startLoad();
            }
          } else {
            console.log("[Engine] Network error, attempting recovery...");
            hls.startLoad();
          }
          break;
        case Hls.ErrorTypes.MEDIA_ERROR:
          console.log("[Engine] Media error, attempting recovery...");
          hls.recoverMediaError();
          break;
        default:
          hls.destroy();
          hlsRef.current = null;
          retryLoad();
          break;
      }
    });
  }, [buildHlsConfig, patch, updateNetworkSpeed, retryLoad, tryPlay]);

  // ── Video element events ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => { patch({ playing: true, loading: false }); resetStallDetection(); retryCountRef.current = 0; patch({ retryCount: 0 }); };
    const onPause = () => { patch({ playing: false }); resetStallDetection(); };
    const onTimeUpdate = () => {
      const ct = video.currentTime;
      lastTimeRef.current = ct;
      patch({ currentTime: ct });
      if (video.buffered.length > 0) {
        patch({ buffered: video.buffered.end(video.buffered.length - 1) });
      }
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

  // ── Save on page leave ──
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

  // ── Initial load — trigger prefetch immediately ──
  useEffect(() => {
    cancelledRef.current = false;
    // OPT 1: Start prefetch immediately on mount
    if (tmdbId) prefetchVideoUrl(tmdbId, contentType, season, episode);
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
