type ThumbContentType = "movie" | "series";

const DEFAULT_THUMB_W = 160;
const DEFAULT_THUMB_H = 90;

export interface SpriteThumbnailCue {
  start: number;
  end: number;
  spriteUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ThumbnailTrack {
  sourceVttUrl: string;
  cues: SpriteThumbnailCue[];
}

interface ThumbnailTrackParams {
  tmdbId: string | null;
  contentType: string;
  season?: string | null;
  episode?: string | null;
}

const trackCache = new Map<string, Promise<ThumbnailTrack | null>>();
const warmedSprites = new Set<string>();

function normalizeContentType(contentType: string): ThumbContentType {
  return contentType === "movie" ? "movie" : "series";
}

function parseTimeToSeconds(raw: string): number {
  const cleaned = raw.trim().split(/[ \t]/)[0];
  const parts = cleaned.split(":").map(Number);

  if (parts.some(Number.isNaN)) return 0;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}

function parseCuePayload(payload: string, sourceVttUrl: string): Omit<SpriteThumbnailCue, "start" | "end"> | null {
  const trimmed = payload.trim();
  if (!trimmed) return null;

  const [rawPath, fragment] = trimmed.split("#");
  const spriteUrl = new URL(rawPath, sourceVttUrl).toString();

  let x = 0;
  let y = 0;
  let width = DEFAULT_THUMB_W;
  let height = DEFAULT_THUMB_H;

  if (fragment?.startsWith("xywh=")) {
    const [fx, fy, fw, fh] = fragment
      .replace("xywh=", "")
      .split(",")
      .map((v) => Number(v.trim()));

    if ([fx, fy, fw, fh].every((v) => Number.isFinite(v))) {
      x = fx;
      y = fy;
      width = fw;
      height = fh;
    }
  }

  return { spriteUrl, x, y, width, height };
}

function parseVtt(text: string, sourceVttUrl: string): ThumbnailTrack | null {
  const lines = text.replace(/\r/g, "").split("\n");
  const cues: SpriteThumbnailCue[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line || line === "WEBVTT" || /^\d+$/.test(line)) continue;
    if (!line.includes("-->")) continue;

    const [startRaw, endRaw] = line.split("-->");
    const start = parseTimeToSeconds(startRaw);
    const end = parseTimeToSeconds(endRaw);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

    let payload = "";
    for (let j = i + 1; j < lines.length; j += 1) {
      const candidate = lines[j].trim();
      if (!candidate) continue;
      payload = candidate;
      i = j;
      break;
    }

    if (!payload) continue;
    const parsed = parseCuePayload(payload, sourceVttUrl);
    if (!parsed) continue;

    cues.push({
      start,
      end,
      spriteUrl: parsed.spriteUrl,
      x: parsed.x,
      y: parsed.y,
      width: parsed.width,
      height: parsed.height,
    });
  }

  if (!cues.length) return null;
  cues.sort((a, b) => a.start - b.start);
  return { sourceVttUrl, cues };
}

function buildContentIds(params: ThumbnailTrackParams): string[] {
  const { tmdbId, season, episode } = params;
  if (!tmdbId) return [];

  const normalizedType = normalizeContentType(params.contentType);
  const seasonNum = season ? Number(season) : null;
  const episodeNum = episode ? Number(episode) : null;

  const ids = new Set<string>();

  if (normalizedType === "movie") {
    ids.add(`movie-${tmdbId}`);
  } else {
    if (Number.isFinite(seasonNum) && Number.isFinite(episodeNum)) {
      ids.add(`series-${tmdbId}-s${seasonNum}e${episodeNum}`);
      ids.add(`series-${tmdbId}/${seasonNum}/${episodeNum}`);
    }
    ids.add(`series-${tmdbId}`);
    ids.add(`tv-${tmdbId}`);
  }

  ids.add(`${normalizedType}-${tmdbId}`);
  ids.add(tmdbId);

  return Array.from(ids);
}

function buildCandidateUrls(params: ThumbnailTrackParams): string[] {
  const ids = buildContentIds(params);
  const urls = new Set<string>();

  ids.forEach((id) => {
    const safeId = encodeURIComponent(id);
    urls.add(`/thumbnails/${safeId}/thumbs.vtt`);
    urls.add(`/thumbnails/${id}/thumbs.vtt`);
  });

  return Array.from(urls);
}

async function fetchTrackFromCandidates(candidates: string[]): Promise<ThumbnailTrack | null> {
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) continue;
      const text = await res.text();
      const parsed = parseVtt(text, res.url || url);
      if (parsed) return parsed;
    } catch {
      // ignore and move to next candidate
    }
  }
  return null;
}

export async function loadThumbnailTrack(params: ThumbnailTrackParams): Promise<ThumbnailTrack | null> {
  if (!params.tmdbId) return null;

  const cacheKey = `${params.contentType}_${params.tmdbId}_${params.season || 0}_${params.episode || 0}`;
  const cached = trackCache.get(cacheKey);
  if (cached) return cached;

  const promise = fetchTrackFromCandidates(buildCandidateUrls(params));
  trackCache.set(cacheKey, promise);
  return promise;
}

export function getThumbnailCueAtTime(track: ThumbnailTrack | null, seconds: number): SpriteThumbnailCue | null {
  if (!track?.cues.length || !Number.isFinite(seconds)) return null;

  let low = 0;
  let high = track.cues.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const cue = track.cues[mid];

    if (seconds < cue.start) {
      high = mid - 1;
    } else if (seconds >= cue.end) {
      low = mid + 1;
    } else {
      return cue;
    }
  }

  const fallbackIndex = Math.max(0, Math.min(track.cues.length - 1, high));
  return track.cues[fallbackIndex] || null;
}

function warmSprite(url: string | null) {
  if (!url || warmedSprites.has(url)) return;
  warmedSprites.add(url);
  const img = new Image();
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.src = url;
}

export function warmThumbnailSprites(track: ThumbnailTrack | null, seconds: number): void {
  if (!track?.cues.length) return;

  const cue = getThumbnailCueAtTime(track, seconds);
  if (!cue) return;

  warmSprite(cue.spriteUrl);

  const currentIndex = track.cues.findIndex((c) => c === cue);
  if (currentIndex >= 0) {
    warmSprite(track.cues[currentIndex + 1]?.spriteUrl || null);
  }
}
