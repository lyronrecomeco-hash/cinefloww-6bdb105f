const CACHE_VERSION_KEY = "lyneflix_cache_version";
const SESSION_RELOAD_TS_KEY = "lyneflix_cache_reload_ts";
const RELOAD_GUARD_PREFIX = "lyneflix_cache_reload_guard_";
const MIN_RELOAD_INTERVAL_MS = 15000;

export function toVersionNumber(v: string): number {
  const n = Number(String(v).replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : Number.NaN;
}

export function resolveRemoteVersion(value: unknown): string | null {
  if (value == null) return null;

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const direct = record.v ?? record.version ?? record.value;
    if (direct != null) return String(direct);

    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  return String(value);
}

export function getLocalCacheVersion(fallbackVersion: string): string {
  try {
    return localStorage.getItem(CACHE_VERSION_KEY) ?? fallbackVersion;
  } catch {
    return fallbackVersion;
  }
}

export function setLocalCacheVersion(version: string): void {
  try {
    localStorage.setItem(CACHE_VERSION_KEY, version);
  } catch {
    // ignore storage errors
  }
}

export function isRemoteVersionNewer(localVersion: string, remoteVersion: string): boolean {
  const remoteNum = toVersionNumber(remoteVersion);
  const localNum = toVersionNumber(localVersion);

  return Number.isFinite(remoteNum) && Number.isFinite(localNum)
    ? remoteNum > localNum
    : remoteVersion !== localVersion;
}

export function attemptVersionReload(targetVersion: string): boolean {
  try {
    const now = Date.now();
    const lastReloadTs = Number(sessionStorage.getItem(SESSION_RELOAD_TS_KEY) ?? "0");

    if (Number.isFinite(lastReloadTs) && now - lastReloadTs < MIN_RELOAD_INTERVAL_MS) {
      return false;
    }

    const guardKey = `${RELOAD_GUARD_PREFIX}${targetVersion}`;
    if (localStorage.getItem(guardKey) === "1") {
      return false;
    }

    sessionStorage.setItem(SESSION_RELOAD_TS_KEY, String(now));
    localStorage.setItem(guardKey, "1");
  } catch {
    // Fail closed: if storage is unavailable, never force reload loops.
    return false;
  }

  window.location.reload();
  return true;
}

export { CACHE_VERSION_KEY };
