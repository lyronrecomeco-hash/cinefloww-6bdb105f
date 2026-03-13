/**
 * Video Thumbnail Preview — captures frames from the video element
 * to show preview thumbnails when hovering/dragging the progress bar.
 */

const CANVAS_W = 160;
const CANVAS_H = 90;
const CAPTURE_TIMEOUT_MS = 1800;

let previewCanvas: HTMLCanvasElement | null = null;
let previewCtx: CanvasRenderingContext2D | null = null;
const frameCache = new Map<number, string>(); // rounded second → dataURL
const inFlightCaptures = new Map<number, Promise<string | null>>();
const blockedPreviewSources = new Set<string>();

let lastVideoSrc = "";
let previewVideo: HTMLVideoElement | null = null;
let previewVideoSrc = "";
let previewVideoReadyPromise: Promise<void> | null = null;

type AsyncPreviewCallback = (dataUrl: string | null, requestedSecond: number) => void;

function getCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (!previewCanvas) {
    previewCanvas = document.createElement("canvas");
    previewCanvas.width = CANVAS_W;
    previewCanvas.height = CANVAS_H;
    previewCtx = previewCanvas.getContext("2d", { willReadFrequently: true });
  }
  if (!previewCtx) return null;
  return { canvas: previewCanvas, ctx: previewCtx };
}

function waitForEvent(target: EventTarget, eventName: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const onDone = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Failed waiting for ${eventName}`));
    };

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Timeout waiting for ${eventName}`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      target.removeEventListener(eventName, onDone as EventListener);
      target.removeEventListener("error", onError as EventListener);
      target.removeEventListener("stalled", onError as EventListener);
      target.removeEventListener("abort", onError as EventListener);
    };

    target.addEventListener(eventName, onDone as EventListener, { once: true });
    target.addEventListener("error", onError as EventListener, { once: true });
    target.addEventListener("stalled", onError as EventListener, { once: true });
    target.addEventListener("abort", onError as EventListener, { once: true });
  });
}

function isSecurityError(err: unknown): boolean {
  const msg = String(err || "");
  return msg.includes("SecurityError") || msg.includes("tainted") || msg.includes("cross-origin");
}

function resetSourceState(currentSrc: string) {
  if (currentSrc && currentSrc !== lastVideoSrc) {
    frameCache.clear();
    inFlightCaptures.clear();
    lastVideoSrc = currentSrc;

    if (previewVideo && previewVideoSrc && previewVideoSrc !== currentSrc) {
      previewVideo.pause();
      previewVideo.removeAttribute("src");
      previewVideo.load();
      previewVideoSrc = "";
      previewVideoReadyPromise = null;
    }
  }
}

async function loadPreviewVideoSource(sourceUrl: string, useAnonymousCors: boolean): Promise<void> {
  if (!previewVideo) throw new Error("Preview video not initialized");

  if (useAnonymousCors) previewVideo.crossOrigin = "anonymous";
  else previewVideo.removeAttribute("crossorigin");

  previewVideo.setAttribute("referrerpolicy", "no-referrer");
  previewVideo.src = sourceUrl;
  previewVideo.load();

  if (previewVideo.readyState < 1) {
    await waitForEvent(previewVideo, "loadedmetadata", CAPTURE_TIMEOUT_MS);
  }
}

async function ensurePreviewVideo(sourceUrl: string): Promise<HTMLVideoElement | null> {
  if (!sourceUrl || blockedPreviewSources.has(sourceUrl)) return null;

  if (!previewVideo) {
    previewVideo = document.createElement("video");
    previewVideo.muted = true;
    previewVideo.playsInline = true;
    previewVideo.preload = "auto";
    previewVideo.style.position = "fixed";
    previewVideo.style.left = "-99999px";
    previewVideo.style.top = "-99999px";
    previewVideo.style.width = "1px";
    previewVideo.style.height = "1px";
  }

  if (!previewVideo.isConnected && document.body) {
    document.body.appendChild(previewVideo);
  }

  if (previewVideoSrc !== sourceUrl) {
    previewVideoSrc = sourceUrl;
    previewVideoReadyPromise = loadPreviewVideoSource(sourceUrl, true).catch(async () => {
      // Fallback for providers that reject CORS-mode fetches.
      await loadPreviewVideoSource(sourceUrl, false);
    });
  }

  try {
    if (previewVideoReadyPromise) await previewVideoReadyPromise;
    if (previewVideo.readyState < 1) {
      await waitForEvent(previewVideo, "loadedmetadata", CAPTURE_TIMEOUT_MS);
    }
    return previewVideo;
  } catch {
    blockedPreviewSources.add(sourceUrl);
    return null;
  }
}

async function captureWithPreviewVideo(sourceUrl: string, second: number): Promise<string | null> {
  const probe = await ensurePreviewVideo(sourceUrl);
  if (!probe) return null;

  const duration = Number.isFinite(probe.duration) ? probe.duration : 0;
  const targetTime = duration > 0 ? Math.max(0, Math.min(second, Math.max(duration - 0.15, 0))) : Math.max(0, second);

  try {
    if (Math.abs(probe.currentTime - targetTime) > 0.05) {
      probe.currentTime = targetTime;
      await waitForEvent(probe, "seeked", CAPTURE_TIMEOUT_MS).catch(() => undefined);
    }

    if (probe.readyState < 2) {
      await waitForEvent(probe, "loadeddata", CAPTURE_TIMEOUT_MS).catch(() => undefined);
    }

    const pair = getCanvas();
    if (!pair) return null;

    pair.ctx.drawImage(probe, 0, 0, CANVAS_W, CANVAS_H);
    const dataUrl = pair.canvas.toDataURL("image/jpeg", 0.55);
    if (dataUrl.length < 100) return null;

    frameCache.set(Math.round(second), dataUrl);
    trimCache();
    return dataUrl;
  } catch (err) {
    if (isSecurityError(err)) {
      blockedPreviewSources.add(sourceUrl);
    }
    return null;
  }
}

function queueAsyncCapture(video: HTMLVideoElement, timeSeconds: number, onAsyncPreview?: AsyncPreviewCallback) {
  const roundedTime = Math.round(timeSeconds);
  const sourceUrl = video.currentSrc || video.src || lastVideoSrc;

  if (!sourceUrl || frameCache.has(roundedTime) || blockedPreviewSources.has(sourceUrl)) {
    if (onAsyncPreview) onAsyncPreview(frameCache.get(roundedTime) ?? null, roundedTime);
    return;
  }

  const existing = inFlightCaptures.get(roundedTime);
  if (existing) {
    if (onAsyncPreview) existing.then((url) => onAsyncPreview(url, roundedTime));
    return;
  }

  const task = captureWithPreviewVideo(sourceUrl, roundedTime)
    .catch(() => null)
    .finally(() => inFlightCaptures.delete(roundedTime));

  inFlightCaptures.set(roundedTime, task);

  if (onAsyncPreview) {
    task.then((url) => onAsyncPreview(url, roundedTime));
  }
}

/**
 * Capture a thumbnail from the video at a given time.
 * 1) exact cache hit
 * 2) nearest cache hit within 8s
 * 3) immediate live capture when hovering close to current playback time
 * 4) async offscreen seek-capture for accurate per-second preview
 */
export function captureFrameFromVideo(
  video: HTMLVideoElement,
  timeSeconds: number,
  onAsyncPreview?: AsyncPreviewCallback,
): string | null {
  const currentSrc = video.currentSrc || video.src || "";
  resetSourceState(currentSrc);

  const roundedTime = Math.round(timeSeconds);

  const cached = frameCache.get(roundedTime);
  if (cached) return cached;

  // nearest cache hit (helps smooth scrubbing)
  let nearest: string | null = null;
  let nearestDist = Infinity;
  for (const [t, url] of frameCache) {
    const dist = Math.abs(t - roundedTime);
    if (dist < nearestDist && dist <= 8) {
      nearestDist = dist;
      nearest = url;
    }
  }

  // immediate capture from currently rendered frame if close to playback position
  if (Math.abs(video.currentTime - timeSeconds) <= 1.5 && video.readyState >= 2) {
    const pair = getCanvas();
    if (pair) {
      try {
        pair.ctx.drawImage(video, 0, 0, CANVAS_W, CANVAS_H);
        const dataUrl = pair.canvas.toDataURL("image/jpeg", 0.55);
        if (dataUrl.length >= 100) {
          frameCache.set(roundedTime, dataUrl);
          trimCache();
          return dataUrl;
        }
      } catch {
        // main video may be tainted in no-cors mode; async probe may still succeed
      }
    }
  }

  // request an accurate async frame for this second
  queueAsyncCapture(video, timeSeconds, onAsyncPreview);

  return nearest;
}

/**
 * Pre-capture frames at regular intervals from the current video position.
 * Call periodically (e.g. on timeupdate) to build up the cache passively.
 */
export function cacheCurrentFrame(video: HTMLVideoElement): void {
  if (!video || video.readyState < 2) return;

  const roundedTime = Math.round(video.currentTime);
  if (frameCache.has(roundedTime)) return;

  const currentSrc = video.currentSrc || video.src || "";
  resetSourceState(currentSrc);

  const pair = getCanvas();
  if (!pair) return;

  try {
    pair.ctx.drawImage(video, 0, 0, CANVAS_W, CANVAS_H);
    const dataUrl = pair.canvas.toDataURL("image/jpeg", 0.55);
    if (dataUrl.length < 100) return;
    frameCache.set(roundedTime, dataUrl);
    trimCache();
  } catch {
    // no-op (likely tainted canvas)
  }
}

function trimCache() {
  if (frameCache.size > 240) {
    const firstKey = frameCache.keys().next().value;
    if (firstKey !== undefined) frameCache.delete(firstKey);
  }
}

export function clearFrameCache(): void {
  frameCache.clear();
  inFlightCaptures.clear();
  blockedPreviewSources.clear();
  lastVideoSrc = "";

  if (previewVideo) {
    previewVideo.pause();
    previewVideo.removeAttribute("src");
    previewVideo.load();
  }
  previewVideoSrc = "";
  previewVideoReadyPromise = null;
}

/** Get cache size for debugging */
export function getFrameCacheSize(): number {
  return frameCache.size;
}
