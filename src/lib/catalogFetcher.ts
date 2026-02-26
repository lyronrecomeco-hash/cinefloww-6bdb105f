/**
 * VPS-only catalog fetcher with in-memory cache.
 * Tries VPS memory cache (instant). If VPS is offline, returns empty.
 * NO Cloud DB fallback for catalog reads — prevents overloading Cloud.
 */

import { initVpsClient, vpsCatalog } from "@/lib/vpsClient";

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
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min stale-while-revalidate
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
  const entry = _cache.get(key);
  if (!entry) return null;
  return entry;
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

// ── VPS init (single attempt) ───────────────────────────────────────
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
 * VPS-only with client-side cache. NO Cloud DB fallback.
 */
export async function fetchCatalog(
  contentType: string,
  opts?: { limit?: number; offset?: number; orderBy?: string }
): Promise<{ items: CatalogItem[]; total: number }> {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  const key = cacheKey(contentType, limit, offset);

  // 0. Return from cache if fresh
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

  // No cache at all — fetch synchronously
  return fetchFresh(contentType, limit, offset, key);
}

async function fetchFresh(
  contentType: string,
  limit: number,
  offset: number,
  key: string
): Promise<{ items: CatalogItem[]; total: number }> {
  // Try VPS only — no Cloud fallback
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

  // VPS offline or empty — return empty, do NOT query Cloud DB
  console.log(`[CatalogFetcher] VPS offline for ${contentType} — returning empty (no Cloud fallback)`);
  return { items: [], total: 0 };
}

/**
 * Quick fetch for homepage rows (small limit, no pagination needed).
 */
export async function fetchCatalogRow(contentType: string, limit = 20): Promise<CatalogItem[]> {
  const { items } = await fetchCatalog(contentType, { limit, offset: 0 });
  return items;
}
