/**
 * Cache Buster — checks remote cache version AND nonce, forces full refresh if changed.
 * Uses a strict timeout to NEVER block app boot if Cloud DB is slow.
 */

import {
  attemptVersionReload,
  getLocalCacheVersion,
  isRemoteVersionNewer,
  resolveRemoteVersion,
  setLocalCacheVersion,
} from "./cacheVersion";

const APP_CACHE_VERSION = "543";
const CHECK_TIMEOUT_MS = 2000; // 2s max — if Cloud is slow, skip silently
const NONCE_KEY = "lyneflix_cache_nonce";

export async function checkCacheVersion(): Promise<void> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");

    const result = await Promise.race([
      supabase
        .from("site_settings")
        .select("key, value")
        .in("key", ["cache_version", "cache_nonce"]),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), CHECK_TIMEOUT_MS)),
    ]);

    if (!result) return; // timeout
    const { data } = result as any;
    if (!data || !Array.isArray(data)) return;

    // Check nonce first (force refresh without version change)
    const nonceRow = data.find((r: any) => r.key === "cache_nonce");
    if (nonceRow?.value) {
      const remoteNonce = String(typeof nonceRow.value === "object" ? JSON.stringify(nonceRow.value) : nonceRow.value);
      try {
        const localNonce = localStorage.getItem(NONCE_KEY) || "";
        if (remoteNonce && remoteNonce !== localNonce) {
          console.log(`[CacheBuster] Nonce changed: ${localNonce} → ${remoteNonce} — clearing caches…`);
          await clearAllCaches();
          localStorage.setItem(NONCE_KEY, remoteNonce);
          attemptVersionReload(remoteNonce);
          return;
        }
      } catch {}
    }

    // Check version (standard flow)
    const versionRow = data.find((r: any) => r.key === "cache_version");
    if (!versionRow?.value) return;

    const remoteVersion = resolveRemoteVersion(versionRow.value);
    if (!remoteVersion) return;

    const localVersion = getLocalCacheVersion(APP_CACHE_VERSION);

    if (!isRemoteVersionNewer(localVersion, remoteVersion)) return;

    console.log(`[CacheBuster] ${localVersion} → ${remoteVersion} — clearing caches…`);

    await clearAllCaches();

    setLocalCacheVersion(remoteVersion);
    attemptVersionReload(remoteVersion);
  } catch {
    // Non-blocking — silently skip if Cloud is slow/down
  }
}

async function clearAllCaches() {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
  }

  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names.map((n) => caches.delete(n)));
  }
}
