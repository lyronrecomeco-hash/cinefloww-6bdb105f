/**
 * Catalog fetcher with VPS-first strategy and Cloud DB fallback (strict timeout).
 * 1. Try VPS memory cache (instant)
 * 2. If VPS offline → Cloud DB with 4s timeout (prevents infinite loading)
 * 3. If both fail → return empty (never blocks UI)
 */

import { initVpsClient, vpsCatalog, isVpsOnline } from "@/lib/vpsClient";
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

// ── In-memory cache ─────────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
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

// ── VPS init ────────────────────────────────────────────────────────
let _vpsInitDone = false;

async function ensureVps() {
  if (!_vpsInitDone) {
    _vpsInitDone = true;
    await initVpsClient().catch(() => {});
  }
}

// ── Mapper ──────────────────────────────────────────────────────────
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

/**
 * Fetch catalog items by content_type.
 * VPS-first, Cloud DB fallback with strict timeout.
 */
export async function fetchCatalog(
  contentType: string,
  opts?: { limit?: number; offset?: number; orderBy?: string }
): Promise<{ items: CatalogItem[]; total: number }> {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  const key = cacheKey(contentType, limit, offset);

  // Return from cache if fresh
  if (isFresh(key)) {
    const cached = getCached(key)!;
    return { items: cached.items, total: cached.total };
  }

  // If stale cache exists, return immediately and revalidate in background
  const stale = getCached(key);
  if (stale) {
    fetchFresh(contentType, limit, offset, key).catch(() => {});
    return { items: stale.items, total: stale.total };
  }

  // No cache — fetch synchronously
  return fetchFresh(contentType, limit, offset, key);
}

async function fetchFresh(
  contentType: string,
  limit: number,
  offset: number,
  key: string
): Promise<{ items: CatalogItem[]; total: number }> {
  // 1. Try VPS first
  await ensureVps();
  try {
    const vpsData = await vpsCatalog(contentType);
    if (vpsData && vpsData.length > 0) {
      console.log(`[CatalogFetcher] VPS hit: ${vpsData.length} ${contentType} items`);
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
    /* VPS offline */
  }

  // 2. Cloud DB fallback with strict 4s timeout
  console.log(`[CatalogFetcher] VPS offline for ${contentType} — trying Cloud DB (4s timeout)`);
  try {
    const result = await Promise.race([
      fetchFromCloud(contentType, limit, offset),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);

    if (result && result.items.length > 0) {
      console.log(`[CatalogFetcher] Cloud hit: ${result.items.length} ${contentType} items`);
      setCache(key, result.items, result.total);
      return result;
    }
  } catch {
    /* Cloud also failed */
  }

  // 3. Both failed — return empty (never blocks UI)
  console.log(`[CatalogFetcher] Both VPS and Cloud failed for ${contentType} — returning empty`);
  return { items: [], total: 0 };
}

/** Cloud DB read with no pagination overhead */
async function fetchFromCloud(
  contentType: string,
  limit: number,
  offset: number
): Promise<{ items: CatalogItem[]; total: number }> {
  const query = supabase
    .from("content")
    .select("id, tmdb_id, title, poster_path, backdrop_path, vote_average, release_date, content_type", { count: "exact" })
    .eq("content_type", contentType)
    .order("release_date", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error || !data) return { items: [], total: 0 };

  const items: CatalogItem[] = data.map((d: any) => ({
    id: d.id,
    tmdb_id: d.tmdb_id,
    title: d.title,
    poster_path: d.poster_path,
    backdrop_path: d.backdrop_path,
    vote_average: d.vote_average,
    release_date: d.release_date,
    content_type: d.content_type,
  }));

  return { items, total: count || items.length };
}

/**
 * Quick fetch for homepage rows (small limit, no pagination needed).
 */
export async function fetchCatalogRow(contentType: string, limit = 20): Promise<CatalogItem[]> {
  const { items } = await fetchCatalog(contentType, { limit, offset: 0 });
  return items;
}
