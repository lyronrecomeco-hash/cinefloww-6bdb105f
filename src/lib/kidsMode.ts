import type { TMDBMovie } from "@/services/tmdb";

const KIDS_ALLOWED_GENRES = new Set([16, 35, 10751, 12, 14, 10402]);
const KIDS_BLOCKED_GENRES = new Set([27, 53, 80, 99, 9648, 10752]);

export interface ActiveProfileData {
  id: string;
  name: string;
  avatar_index: number;
  share_code?: string | null;
  is_kids?: boolean;
}

export function getActiveProfile(): ActiveProfileData | null {
  try {
    const raw = localStorage.getItem("lyneflix_active_profile");
    if (!raw) return null;
    return JSON.parse(raw) as ActiveProfileData;
  } catch {
    return null;
  }
}

export function isKidsModeEnabled(): boolean {
  return !!getActiveProfile()?.is_kids;
}

export function isKidsSafeTitle(item: TMDBMovie): boolean {
  const maybeAdult = (item as any)?.adult === true;
  if (maybeAdult) return false;

  const genres = Array.isArray(item.genre_ids) ? item.genre_ids : [];
  if (!genres.length) return false;
  if (genres.some((g) => KIDS_BLOCKED_GENRES.has(Number(g)))) return false;

  return genres.some((g) => KIDS_ALLOWED_GENRES.has(Number(g)));
}

export function filterKidsTitles(items: TMDBMovie[]): TMDBMovie[] {
  if (!isKidsModeEnabled()) return items;
  return items.filter(isKidsSafeTitle);
}
