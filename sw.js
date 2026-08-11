/* Offline support, network-first.
 *
 * The first version of this file was cache-first for everything except
 * data/*.json. That is the textbook PWA recipe, and it was wrong here: it
 * pinned index.html and config.js to whatever was cached on your very first
 * visit, so a `git push` would never reach an already-installed device. You
 * would edit a file, deploy it, and the phone would keep showing the old app
 * forever — with no error to tell you why.
 *
 * Network-first fixes that. Every same-origin GET tries the network, and only
 * falls back to the cache when the network fails. Being online costs you a few
 * KB per load; being offline still opens instantly from the last good copy.
 * For a personal app of this size that is the right trade.
 *
 * Supabase requests are cross-origin and are never intercepted — sync must
 * always hit the live network, and a stale cached response would be worse
 * than no response.
 */
const VERSION = 'iim-indore-v3';
const SHELL = [
  './', './index.html', './config.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png',
  './data/competitions.json', './data/mess.json', './data/timetable.json',
];

self.addEventListener('install', e => {
  // Pre-warm so the very first offline open works. Individual failures are
  // tolerated: one missing icon should not abort the whole install.
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;  // Supabase, external: untouched

  e.respondWith(
    fetch(req)
      .then(res => {
        // Only cache real successes. Caching a 404 would serve that 404 offline.
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || caches.match('./index.html')))
  );
});
