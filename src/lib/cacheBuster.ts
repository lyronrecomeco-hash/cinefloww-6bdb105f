/**
 * Cache Buster — checks remote cache version and forces full refresh if changed.
 * 
 * Flow:
 * 1. Fetch `cache_version` from site_settings
 * 2. Compare with localStorage
 * 3. If different → unregister all SWs, nuke CacheStorage, reload
 */

import { supabase } from "@/integrations/supabase/client";

const LOCAL_KEY = "lyneflix_cache_version";

export async function checkCacheVersion(): Promise<void> {
  try {
    const result = await Promise.race([
      supabase.from("site_settings").select("value").eq("key", "cache_version").maybeSingle(),
      new Promise<null>((r) => setTimeout(() => r(null), 3000)),
    ]);

    if (!result) return; // timeout
    const { data } = result as any;

    if (!data?.value) return;

    const remoteVersion = String(
      typeof data.value === "object" && data.value !== null && "v" in (data.value as Record<string, unknown>)
        ? (data.value as Record<string, string>).v
        : data.value
    );
    const localVersion = localStorage.getItem(LOCAL_KEY);

    if (localVersion === remoteVersion) return;

    // Version mismatch → nuke everything
    console.log(`[CacheBuster] ${localVersion} → ${remoteVersion} — clearing caches…`);

    // 1. Unregister all service workers
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }

    // 2. Clear all CacheStorage
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }

    // 3. Save new version BEFORE reload to prevent loop
    localStorage.setItem(LOCAL_KEY, remoteVersion);

    // 4. Hard reload (bypass browser cache)
    window.location.reload();
  } catch (err) {
    // Non-blocking — don't break the app if check fails
    console.warn("[CacheBuster] check failed:", err);
  }
}
