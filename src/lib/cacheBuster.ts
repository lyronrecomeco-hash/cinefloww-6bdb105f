/**
 * Cache Buster — checks remote cache version and forces full refresh if changed.
 * Uses a strict timeout to NEVER block app boot if Cloud DB is slow.
 */

const LOCAL_KEY = "lyneflix_cache_version";
const APP_CACHE_VERSION = "540";
const CHECK_TIMEOUT_MS = 2000; // 2s max — if Cloud is slow, skip silently

const toVersionNumber = (v: string) => {
  const n = Number(String(v).replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : Number.NaN;
};

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

    const val = data.value as Record<string, unknown> | string;
    const remoteVersion = String(
      typeof val === "object" && val !== null
        ? (val as any).v ?? (val as any).version ?? JSON.stringify(val)
        : val
    );

    const localVersion = localStorage.getItem(LOCAL_KEY) ?? APP_CACHE_VERSION;
    const remoteNum = toVersionNumber(remoteVersion);
    const localNum = toVersionNumber(localVersion);

    const remoteIsNewer =
      Number.isFinite(remoteNum) && Number.isFinite(localNum)
        ? remoteNum > localNum
        : remoteVersion !== localVersion;

    // Nunca forçar "downgrade" de versão local para evitar loop de cache
    if (!remoteIsNewer) return;

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

