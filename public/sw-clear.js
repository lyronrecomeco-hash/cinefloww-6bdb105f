/**
 * Cache Nuke Script
 * 
 * When loaded, this script:
 * 1. Unregisters all service workers
 * 2. Clears all caches (CacheStorage)
 * 3. Reloads the page once to fetch fresh assets
 * 
 * Controlled by a version key in the DB (site_settings.cache_version).
 * The main app checks the remote version vs localStorage;
 * if different, it runs this nuke sequence.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))))
      .then(() => self.clients.matchAll())
      .then(clients => clients.forEach(c => c.postMessage({ type: 'CACHE_CLEARED' })))
  );
});
