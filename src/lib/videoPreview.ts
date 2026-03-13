/**
 * Video Thumbnail Preview — captures frames from the video element
 * to show preview thumbnails when hovering/dragging the progress bar.
 */

const CANVAS_W = 160;
const CANVAS_H = 90;

let previewCanvas: HTMLCanvasElement | null = null;
let previewCtx: CanvasRenderingContext2D | null = null;
const frameCache = new Map<number, string>(); // rounded second → dataURL
let lastVideoSrc = "";

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

/**
 * Capture a thumbnail from the video at a given time.
 * Returns cached frame if available, or nearest cached frame within 5s.
 * Can only capture live frame if video is near the requested time.
 */
export function captureFrameFromVideo(
  video: HTMLVideoElement,
  timeSeconds: number
): string | null {
  // Reset cache if video source changed
  const currentSrc = video.src || video.currentSrc || "";
  if (currentSrc && currentSrc !== lastVideoSrc) {
    frameCache.clear();
    lastVideoSrc = currentSrc;
  }

  const roundedTime = Math.round(timeSeconds);

  // Exact cache hit
  const cached = frameCache.get(roundedTime);
  if (cached) return cached;

  // Try nearest cached frame within 5 seconds
  let nearest: string | null = null;
  let nearestDist = Infinity;
  for (const [t, url] of frameCache) {
    const dist = Math.abs(t - roundedTime);
    if (dist < nearestDist && dist <= 5) {
      nearestDist = dist;
      nearest = url;
    }
  }
  if (nearest) return nearest;

  // Can only capture current frame if video is at this time (±1.5s)
  if (Math.abs(video.currentTime - timeSeconds) > 1.5) return null;
  if (video.readyState < 2) return null;

  const pair = getCanvas();
  if (!pair) return null;

  try {
    pair.ctx.drawImage(video, 0, 0, CANVAS_W, CANVAS_H);
    const dataUrl = pair.canvas.toDataURL("image/jpeg", 0.5);
    // Check if canvas was tainted (returns empty/tiny data)
    if (dataUrl.length < 100) return null;
    frameCache.set(roundedTime, dataUrl);
    trimCache();
    return dataUrl;
  } catch {
    // Canvas tainted by CORS — silently fail
    return null;
  }
}

/**
 * Pre-capture frames at regular intervals from the current video position.
 * Call periodically (e.g. on timeupdate) to build up the cache passively.
 */
export function cacheCurrentFrame(video: HTMLVideoElement): void {
  if (!video || video.readyState < 2) return;

  const roundedTime = Math.round(video.currentTime);
  if (frameCache.has(roundedTime)) return;

  const currentSrc = video.src || video.currentSrc || "";
  if (currentSrc && currentSrc !== lastVideoSrc) {
    frameCache.clear();
    lastVideoSrc = currentSrc;
  }

  const pair = getCanvas();
  if (!pair) return;

  try {
    pair.ctx.drawImage(video, 0, 0, CANVAS_W, CANVAS_H);
    const dataUrl = pair.canvas.toDataURL("image/jpeg", 0.5);
    if (dataUrl.length < 100) return; // tainted canvas guard
    frameCache.set(roundedTime, dataUrl);
    trimCache();
  } catch { }
}

function trimCache() {
  if (frameCache.size > 200) {
    const firstKey = frameCache.keys().next().value;
    if (firstKey !== undefined) frameCache.delete(firstKey);
  }
}

export function clearFrameCache(): void {
  frameCache.clear();
  lastVideoSrc = "";
}

/** Get cache size for debugging */
export function getFrameCacheSize(): number {
  return frameCache.size;
}
