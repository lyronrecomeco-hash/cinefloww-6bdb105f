/**
 * Cache Buster — checks remote cache version and forces full refresh if changed.
 * Uses a strict timeout to NEVER block app boot if Cloud DB is slow.
 */

const LOCAL_KEY = "lyneflix_cache_version";
const CHECK_TIMEOUT_MS = 3000; // 3s max — if Cloud is slow, skip silently

export async function checkCacheVersion(): Promise<void> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");

    // Race against timeout — if DB takes >3s, skip silently
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

    const remoteVersion = String(
      typeof data.value === "object" && data.value !== null && "v" in (data.value as Record<string, unknown>)
        ? (data.value as Record<string, string>).v
        : data.value
    );
    const localVersion = localStorage.getItem(LOCAL_KEY);

    if (localVersion === remoteVersion) return;

    console.log(`[CacheBuster] ${localVersion} → ${remoteVersion} — clearing caches…`);

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }

    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }

    localStorage.setItem(LOCAL_KEY, remoteVersion);
    window.location.reload();
  } catch {
    // Non-blocking — silently skip if Cloud is slow/down
  }
}
