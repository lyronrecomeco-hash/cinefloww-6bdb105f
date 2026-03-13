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
 * Uses a hidden clone video to seek without affecting playback.
 */
export function captureFrameFromVideo(
  video: HTMLVideoElement,
  timeSeconds: number
): string | null {
  // Reset cache if video source changed
  if (video.src !== lastVideoSrc) {
    frameCache.clear();
    lastVideoSrc = video.src;
  }

  const roundedTime = Math.round(timeSeconds);
  const cached = frameCache.get(roundedTime);
  if (cached) return cached;

  // Can only capture current frame if video is at this time (±1s)
  if (Math.abs(video.currentTime - timeSeconds) > 1.5) return null;

  const pair = getCanvas();
  if (!pair) return null;

  try {
    pair.ctx.drawImage(video, 0, 0, CANVAS_W, CANVAS_H);
    const dataUrl = pair.canvas.toDataURL("image/jpeg", 0.5);
    frameCache.set(roundedTime, dataUrl);

    // Keep cache bounded
    if (frameCache.size > 120) {
      const firstKey = frameCache.keys().next().value;
      if (firstKey !== undefined) frameCache.delete(firstKey);
    }

    return dataUrl;
  } catch {
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

  if (video.src !== lastVideoSrc) {
    frameCache.clear();
    lastVideoSrc = video.src;
  }

  const pair = getCanvas();
  if (!pair) return;

  try {
    pair.ctx.drawImage(video, 0, 0, CANVAS_W, CANVAS_H);
    const dataUrl = pair.canvas.toDataURL("image/jpeg", 0.5);
    frameCache.set(roundedTime, dataUrl);

    if (frameCache.size > 120) {
      const firstKey = frameCache.keys().next().value;
      if (firstKey !== undefined) frameCache.delete(firstKey);
    }
  } catch { }
}

export function clearFrameCache(): void {
  frameCache.clear();
  lastVideoSrc = "";
}
