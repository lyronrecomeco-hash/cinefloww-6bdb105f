import type { TMDBMovie } from "@/services/tmdb";

// Expanded allowed genres for kids content
const KIDS_ALLOWED_GENRES = new Set([
  16,    // Animation
  35,    // Comedy
  10751, // Family
  12,    // Adventure
  14,    // Fantasy
  10402, // Music
  10762, // Kids (TV)
  10759, // Action & Adventure (TV) - many kid shows
]);

const KIDS_BLOCKED_GENRES = new Set([
  27,    // Horror
  53,    // Thriller
  80,    // Crime
  9648,  // Mystery
  10752, // War
  10768, // War & Politics (TV)
]);

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
  
  // Block explicitly adult genres
  if (genres.some((g) => KIDS_BLOCKED_GENRES.has(Number(g)))) return false;

  // If no genre info, allow animation media type as fallback
  if (!genres.length) {
    const mediaType = (item as any)?.media_type;
    return mediaType === "tv" || mediaType === "movie"; // allow if no genre data but valid media
  }

  return genres.some((g) => KIDS_ALLOWED_GENRES.has(Number(g)));
}

export function filterKidsTitles(items: TMDBMovie[]): TMDBMovie[] {
  if (!isKidsModeEnabled()) return items;
  return items.filter(isKidsSafeTitle);
}
