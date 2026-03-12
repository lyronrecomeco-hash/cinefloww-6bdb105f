/**
 * Cache Buster — checks remote cache version and forces full refresh if changed.
 * Uses a strict timeout to NEVER block app boot if Cloud DB is slow.
 */

import {
  attemptVersionReload,
  getLocalCacheVersion,
  isRemoteVersionNewer,
  resolveRemoteVersion,
  setLocalCacheVersion,
} from "./cacheVersion";

const APP_CACHE_VERSION = "541";
const CHECK_TIMEOUT_MS = 2000; // 2s max — if Cloud is slow, skip silently

export async function checkCacheVersion(): Promise<void> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");

    const result = await Promise.race([
      supabase
        .from("site_settings")
        .select("value")
        .eq("key", "cache_version")
        .maybeSingle(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), CHECK_TIMEOUT_MS)),
    ]);

    if (!result) return; // timeout
    const { data } = result as any;

    if (!data?.value) return;

    const remoteVersion = resolveRemoteVersion(data.value);
    if (!remoteVersion) return;

    const localVersion = getLocalCacheVersion(APP_CACHE_VERSION);

    // Nunca forçar "downgrade" de versão local para evitar loop de cache
    if (!isRemoteVersionNewer(localVersion, remoteVersion)) return;

    console.log(`[CacheBuster] ${localVersion} → ${remoteVersion} — clearing caches…`);

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }

    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }

    setLocalCacheVersion(remoteVersion);
    attemptVersionReload(remoteVersion);
  } catch {
    // Non-blocking — silently skip if Cloud is slow/down
  }
}

