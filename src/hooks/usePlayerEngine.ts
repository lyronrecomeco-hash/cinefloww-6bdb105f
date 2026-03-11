import { useRef, useState, useCallback, useEffect } from "react";
import Hls, { Level } from "hls.js";
import { supabase } from "@/integrations/supabase/client";
import { saveWatchProgress, getWatchProgress } from "@/lib/watchProgress";

export interface QualityLevel {
  index: number;
  height: number;
  bitrate: number;
  label: string;
}

interface EngineParams {
  tmdbId: string | null;
  contentType: string;
  season: string | null;
  episode: string | null;
}

// ── Bandwidth estimator ──
function estimateBandwidth(): Promise<number> {
  return new Promise((resolve) => {
    const start = performance.now();
    const img = new Image();
    const cacheBust = `?cb=${Date.now()}`;
    img.onload = () => {
      const elapsed = (performance.now() - start) / 1000;
      // ~5KB test image → rough estimate
      const bitsPerSec = (5000 * 8) / elapsed;
      resolve(bitsPerSec);
    };
    img.onerror = () => resolve(5_000_000); // assume 5Mbps
    img.src = `/favicon.ico${cacheBust}`;
    setTimeout(() => resolve(3_000_000), 3000);
  });
}

function getOptimalBuffer(bps: number): { max: number; goal: number } {
  if (bps > 10_000_000) return { max: 120, goal: 30 }; // 10Mbps+
  if (bps > 5_000_000) return { max: 90, goal: 20 };  // 5Mbps+
  if (bps > 2_000_000) return { max: 60, goal: 15 };  // 2Mbps+
  return { max: 45, goal: 10 }; // low bandwidth
}

export function usePlayerEngine({ tmdbId, contentType, season, episode }: EngineParams) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressSaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sourceUrlRef = useRef<string>("");
  const stallDetector = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [activeQuality, setActiveQuality] = useState(-1); // -1 = auto
  const [networkSpeed, setNetworkSpeed] = useState<"high" | "medium" | "low">("medium");
  const [resumed, setResumed] = useState(false);

  const MAX_RETRIES = 5;
  const RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000]; // exponential

  // ── Destroy HLS ──
  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (stallDetector.current) clearTimeout(stallDetector.current);
  }, []);

  // ── Extract video URL from API ──
  const extractUrl = useCallback(async (): Promise<{ url: string; type: string } | null> => {
    try {
      const body: Record<string, unknown> = { tmdb_id: Number(tmdbId), content_type: contentType };
      if (season) body.season = Number(season);
      if (episode) body.episode = Number(episode);
      const { data, error: fnErr } = await supabase.functions.invoke("extract-video", { body });
      if (fnErr || !data?.url) return null;
      return { url: data.url, type: data.type || "m3u8" };
    } catch {
      return null;
    }
  }, [tmdbId, contentType, season, episode]);

  // ── Attach HLS with advanced config ──
  const attachHls = useCallback(async (url: string, startTime?: number) => {
    const video = videoRef.current;
    if (!video) return;

    destroyHls();
    video.preload = "auto";
    video.removeAttribute("crossOrigin");

    // Estimate bandwidth for smart buffer
    const bps = await estimateBandwidth();
    const bufConfig = getOptimalBuffer(bps);
    setNetworkSpeed(bps > 5_000_000 ? "high" : bps > 2_000_000 ? "medium" : "low");

    const isHls = url.includes(".m3u8") || url.includes("m3u8");

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        // ── Performance: minimal CPU ──
        enableWorker: true,
        lowLatencyMode: true,

        // ── Smart buffer ──
        maxBufferLength: bufConfig.goal,
        maxMaxBufferLength: bufConfig.max,
        maxBufferSize: 60 * 1000 * 1000, // 60MB
        maxBufferHole: 0.5,

        // ── ABR engine ──
        startLevel: -1, // auto-detect best
        abrEwmaDefaultEstimate: bps,
        abrBandWidthUpFactor: 0.7,
        abrBandWidthFactor: 0.95,
        abrMaxWithRealBitrate: true,

        // ── Resilience ──
        fragLoadingTimeOut: 15000,
        fragLoadingMaxRetry: 10,
        fragLoadingRetryDelay: 1000,
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 6,
        manifestLoadingRetryDelay: 500,
        levelLoadingTimeOut: 10000,
        levelLoadingMaxRetry: 6,

        // ── Latency ──
        testBandwidth: true,
        progressive: true,
        backBufferLength: 30,
      });

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_ev, data) => {
        // Build quality levels
        const levels: QualityLevel[] = data.levels.map((l: Level, i: number) => ({
          index: i,
          height: l.height,
          bitrate: l.bitrate,
          label: l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)}kbps`,
        }));
        setQualities([{ index: -1, height: 0, bitrate: 0, label: "Auto" }, ...levels]);
        setActiveQuality(-1);

        // Start playback
        if (startTime && startTime > 5) video.currentTime = startTime;
        video.play().catch(() => {
          video.muted = true;
          video.play().catch(() => {});
        });
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_ev, data) => {
        if (hls.autoLevelEnabled) setActiveQuality(-1);
        else setActiveQuality(data.level);
      });

      hls.on(Hls.Events.ERROR, (_ev, data) => {
        if (data.fatal) {
          console.warn("[Engine] Fatal HLS error:", data.type, data.details);
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // Try recovery first
              hls.startLoad();
              // If still failing, full retry
              setTimeout(() => {
                if (video.paused && retryCount.current < MAX_RETRIES) {
                  retryWithBackoff();
                }
              }, 5000);
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              retryWithBackoff();
              break;
          }
        }
      });

      // Stall detection: if no progress for 8s after start, retry
      hls.on(Hls.Events.FRAG_LOADED, () => {
        if (stallDetector.current) clearTimeout(stallDetector.current);
      });

      hlsRef.current = hls;
    } else {
      // MP4 or native HLS (Safari)
      video.src = url;
      video.load();
      if (startTime && startTime > 5) video.currentTime = startTime;
      video.oncanplay = () => {
        video.play().catch(() => {
          video.muted = true;
          video.play().catch(() => {});
        });
      };
    }

    sourceUrlRef.current = url;

    // Stall detection
    stallDetector.current = setTimeout(() => {
      if (video && video.currentTime < 0.5 && !video.paused) {
        console.warn("[Engine] Stall detected, retrying...");
        retryWithBackoff();
      }
    }, 8000);
  }, [destroyHls]);

  // ── Retry with exponential backoff ──
  const retryWithBackoff = useCallback(async () => {
    if (retryCount.current >= MAX_RETRIES) {
      setError("Não foi possível carregar o vídeo após várias tentativas");
      setLoading(false);
      return;
    }

    const delay = RETRY_DELAYS[Math.min(retryCount.current, RETRY_DELAYS.length - 1)];
    retryCount.current++;
    console.log(`[Engine] Retry ${retryCount.current}/${MAX_RETRIES} in ${delay}ms`);

    setLoading(true);
    setError(null);

    retryTimer.current = setTimeout(async () => {
      // Re-extract URL (might get a fresh link)
      const result = await extractUrl();
      if (result) {
        const video = videoRef.current;
        const time = video ? video.currentTime : 0;
        await attachHls(result.url, time > 5 ? time : undefined);
      } else {
        retryWithBackoff();
      }
    }, delay);
  }, [extractUrl, attachHls]);

  // ── Change quality ──
  const changeQuality = useCallback((levelIndex: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    if (levelIndex === -1) {
      hls.currentLevel = -1; // auto
      hls.nextLevel = -1;
    } else {
      hls.currentLevel = levelIndex;
    }
    setActiveQuality(levelIndex);
  }, []);

  // ── Save progress periodically ──
  useEffect(() => {
    if (!tmdbId) return;
    progressSaveTimer.current = setInterval(() => {
      const v = videoRef.current;
      if (!v || v.paused || !v.duration || v.duration < 60) return;
      saveWatchProgress({
        tmdb_id: Number(tmdbId),
        content_type: contentType,
        season: season ? Number(season) : undefined,
        episode: episode ? Number(episode) : undefined,
        progress_seconds: v.currentTime,
        duration_seconds: v.duration,
        completed: v.currentTime / v.duration > 0.92,
      });
    }, 10000); // every 10s
    return () => { if (progressSaveTimer.current) clearInterval(progressSaveTimer.current); };
  }, [tmdbId, contentType, season, episode]);

  // ── Initial load ──
  useEffect(() => {
    if (!tmdbId) {
      setError("Nenhum conteúdo especificado");
      setLoading(false);
      return;
    }

    let cancelled = false;

    const init = async () => {
      setLoading(true);
      setError(null);
      retryCount.current = 0;

      // Parallel: extract URL + get saved progress
      const [result, savedProgress] = await Promise.all([
        extractUrl(),
        getWatchProgress(
          Number(tmdbId), contentType,
          season ? Number(season) : undefined,
          episode ? Number(episode) : undefined
        ),
      ]);

      if (cancelled) return;

      if (!result) {
        setError("Conteúdo não encontrado");
        setLoading(false);
        return;
      }

      let startAt: number | undefined;
      if (savedProgress && !savedProgress.completed && savedProgress.progress_seconds > 10) {
        startAt = savedProgress.progress_seconds;
        setResumed(true);
      }

      await attachHls(result.url, startAt);
    };

    init();
    return () => {
      cancelled = true;
      destroyHls();
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [tmdbId, contentType, season, episode]);

  // ── Video events ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => { setPlaying(true); setLoading(false); };
    const onPause = () => setPlaying(false);
    const onTime = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) setBuffered(video.buffered.end(video.buffered.length - 1));
    };
    const onDur = () => setDuration(video.duration || 0);
    const onWait = () => setLoading(true);
    const onPlaying = () => { setLoading(false); retryCount.current = 0; };
    const onErr = () => {
      if (retryCount.current < MAX_RETRIES) retryWithBackoff();
      else setError("Erro de reprodução");
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("durationchange", onDur);
    video.addEventListener("waiting", onWait);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onErr);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("durationchange", onDur);
      video.removeEventListener("waiting", onWait);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onErr);
    };
  }, [retryWithBackoff]);

  // ── Save on unload ──
  useEffect(() => {
    const save = () => {
      const v = videoRef.current;
      if (!v || !tmdbId || !v.duration || v.duration < 60) return;
      // Use sendBeacon for reliability
      const payload = JSON.stringify({
        device_id: localStorage.getItem("cineflow_device_id"),
        tmdb_id: Number(tmdbId),
        content_type: contentType,
        season: season ? Number(season) : null,
        episode: episode ? Number(episode) : null,
        progress_seconds: v.currentTime,
        duration_seconds: v.duration,
        completed: v.currentTime / v.duration > 0.92,
      });
      navigator.sendBeacon?.(
        `https://mfcnkltcdvitxczjwoer.supabase.co/rest/v1/watch_progress?on_conflict=device_id,tmdb_id,content_type,season,episode`,
        new Blob([payload], { type: "application/json" })
      );
    };
    window.addEventListener("beforeunload", save);
    return () => window.removeEventListener("beforeunload", save);
  }, [tmdbId, contentType, season, episode]);

  return {
    videoRef,
    playing, loading, error, currentTime, duration, buffered,
    qualities, activeQuality, changeQuality,
    networkSpeed, resumed,
    setError, setLoading,
    retryWithBackoff,
  };
}
