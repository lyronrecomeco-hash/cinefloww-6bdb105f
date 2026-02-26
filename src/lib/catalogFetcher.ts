/**
 * Hybrid catalog fetcher: Cloud DB first, VPS as background enhancer.
 * Queries Cloud DB directly (fast with indexes). VPS only used for
 * background cache warming, never blocks the UI.
 */

import { supabase } from "@/integrations/supabase/client";

export interface CatalogItem {
  id: string;
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  vote_average: number | null;
  release_date: string | null;
  content_type: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const CLOUD_TIMEOUT_MS = 8000;

interface CacheEntry {
  items: CatalogItem[];
  total: number;
  ts: number;
}
const _cache = new Map<string, CacheEntry>();

function cacheKey(contentType: string, limit: number, offset: number): string {
  return `${contentType}:${limit}:${offset}`;
}

function getCached(key: string): CacheEntry | null {
  return _cache.get(key) || null;
}

function isFresh(key: string): boolean {
  const entry = _cache.get(key);
  return !!entry && Date.now() - entry.ts < CACHE_TTL_MS;
}

function setCache(key: string, items: CatalogItem[], total: number) {
  _cache.set(key, { items, total, ts: Date.now() });
  if (_cache.size > 100) {
    const oldest = [..._cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < 20; i++) _cache.delete(oldest[i][0]);
  }
}

export async function fetchCatalog(
  contentType: string,
  opts?: { limit?: number; offset?: number; orderBy?: string }
): Promise<{ items: CatalogItem[]; total: number }> {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  const key = cacheKey(contentType, limit, offset);

  if (isFresh(key)) {
    const cached = getCached(key)!;
    return { items: cached.items, total: cached.total };
  }

  const stale = getCached(key);
  if (stale) {
    fetchFresh(contentType, limit, offset, key).catch(() => {});
    return { items: stale.items, total: stale.total };
  }

  return fetchFresh(contentType, limit, offset, key);
}

async function fetchFresh(
  contentType: string,
  limit: number,
  offset: number,
  key: string
): Promise<{ items: CatalogItem[]; total: number }> {
  // Cloud DB first — direct query with timeout
  try {
    const result = await Promise.race([
      fetchFromCloud(contentType, limit, offset),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), CLOUD_TIMEOUT_MS)),
    ]);
    if (result && result.items.length > 0) {
      setCache(key, result.items, result.total);
      return result;
    }
  } catch {
    // Cloud failed, try VPS fallback
  }

  // Fallback: VPS catalog (only if Cloud failed)
  try {
    const { initVpsClient, vpsCatalog } = await import("@/lib/vpsClient");
    await initVpsClient();
    const vpsData = await vpsCatalog(contentType);
    if (vpsData && vpsData.length > 0) {
      const sorted = vpsData.sort((a: any, b: any) => {
        const da = a.release_date || "0000";
        const db = b.release_date || "0000";
        return db.localeCompare(da);
      });
      const total = sorted.length;
      const page = sorted.slice(offset, offset + limit).map((d: any) => mapItem(d, contentType));
      setCache(key, page, total);
      return { items: page, total };
    }
  } catch {
    // VPS also failed
  }

  return { items: [], total: 0 };
}

function mapItem(d: any, contentType: string): CatalogItem {
  return {
    id: d.id || `vps-${d.tmdb_id}`,
    tmdb_id: d.tmdb_id,
    title: d.title,
    poster_path: d.poster_path || null,
    backdrop_path: d.backdrop_path || null,
    vote_average: d.vote_average || 0,
    release_date: d.release_date || null,
    content_type: d.content_type || contentType,
  };
}

async function fetchFromCloud(
  contentType: string,
  limit: number,
  offset: number
): Promise<{ items: CatalogItem[]; total: number } | null> {
  const { data, error } = await supabase
    .from("content")
    .select("id, tmdb_id, title, poster_path, backdrop_path, vote_average, release_date, content_type")
    .eq("content_type", contentType)
    .eq("status", "published")
    .order("release_date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error || !data) return null;

  const items: CatalogItem[] = data.map((d: any) => ({
    id: d.id,
    tmdb_id: d.tmdb_id,
    title: d.title,
    poster_path: d.poster_path || null,
    backdrop_path: d.backdrop_path || null,
    vote_average: d.vote_average || 0,
    release_date: d.release_date || null,
    content_type: d.content_type || contentType,
  }));

  // Estimate total without expensive count
  const total = items.length < limit ? offset + items.length : offset + limit + 100;

  return { items, total };
}

export async function fetchCatalogRow(contentType: string, limit = 20): Promise<CatalogItem[]> {
  const { items } = await fetchCatalog(contentType, { limit, offset: 0 });
  return items;
}
