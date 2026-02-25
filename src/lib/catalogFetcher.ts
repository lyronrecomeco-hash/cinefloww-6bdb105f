/**
 * VPS-first catalog fetcher.
 * Tries VPS memory cache first (instant), falls back to Cloud DB.
 */

import { supabase } from "@/integrations/supabase/client";
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

let _vpsInitDone = false;

async function ensureVps() {
  if (!_vpsInitDone) {
    _vpsInitDone = true;
    await initVpsClient().catch(() => {});
  }
}

/**
 * Fetch catalog items by content_type.
 * VPS-first with Cloud DB fallback.
 */
export async function fetchCatalog(
  contentType: string,
  opts?: { limit?: number; offset?: number; orderBy?: string }
): Promise<{ items: CatalogItem[]; total: number }> {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;

  // 1. Try VPS first
  await ensureVps();
  try {
    const vpsData = await vpsCatalog(contentType);
    if (vpsData && vpsData.length > 0) {
      console.log(`[CatalogFetcher] VPS hit: ${vpsData.length} ${contentType} items`);
      // Sort by release_date desc
      const sorted = vpsData.sort((a: any, b: any) => {
        const da = a.release_date || "0000";
        const db = b.release_date || "0000";
        return db.localeCompare(da);
      });
      const total = sorted.length;
      const page = sorted.slice(offset, offset + limit);
      return {
        items: page.map((d: any) => ({
          id: d.id || `vps-${d.tmdb_id}`,
          tmdb_id: d.tmdb_id,
          title: d.title,
          poster_path: d.poster_path || null,
          backdrop_path: d.backdrop_path || null,
          vote_average: d.vote_average || 0,
          release_date: d.release_date || null,
          content_type: d.content_type || contentType,
        })),
        total,
      };
    }
  } catch {
    /* VPS offline, fallback */
  }

  // 2. Fallback: Cloud DB
  console.log(`[CatalogFetcher] Cloud fallback for ${contentType}`);
  const from = offset;
  const to = offset + limit - 1;

  const { data, count } = await supabase
    .from("content")
    .select("id, tmdb_id, title, poster_path, backdrop_path, vote_average, release_date, content_type", { count: "exact" })
    .eq("content_type", contentType)
    .eq("status", "published")
    .order("release_date", { ascending: false, nullsFirst: false })
    .range(from, to);

  return {
    items: (data || []) as CatalogItem[],
    total: count || 0,
  };
}

/**
 * Quick fetch for homepage rows (small limit, no pagination needed).
 */
export async function fetchCatalogRow(contentType: string, limit = 20): Promise<CatalogItem[]> {
  const { items } = await fetchCatalog(contentType, { limit, offset: 0 });
  return items;
}
