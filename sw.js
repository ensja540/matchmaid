// Service worker: makes Match Maid installable and gives it a usable offline
// screen. Deliberately network-first for everything.
//
// The server sends Cache-Control: no-cache on purpose - a past bug meant pages
// "only worked on hard refresh". A cache-first worker would bring that straight
// back, and worse, because a service worker survives a reload. So the network
// always wins when it is reachable; the cache exists only to have something to
// show when it is not.
const VERSION = 'mm-v1';
const CACHE = `matchmaid-${VERSION}`;

// The bare minimum to render something useful offline.
const PRECACHE = ['/offline.html', '/styles.css', '/assets/logo-mark.svg', '/icon-192.png'];

self.addEventListener('install', (e) => {
  // addAll fails the whole install if any single URL 404s, so fetch them
  // individually and tolerate misses.
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  // Drop every older cache, then take over open tabs immediately so a new
  // version lands without needing every tab closed.
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return; // never touch POST/PUT
  const url = new URL(request.url);
  if (url.origin !== location.origin) return; // leave fonts/CDNs alone
  if (url.pathname.startsWith('/api/')) return; // never cache live data

  e.respondWith(
    fetch(request)
      .then((res) => {
        // Only stash good, complete responses (not opaque or partial ones).
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        // ignoreSearch so a cache-busted asset (styles.css?v=88) still matches
        // the copy stored under an older ?v= when we are offline.
        const hit = (await caches.match(request)) || (await caches.match(request, { ignoreSearch: true }));
        if (hit) return hit;
        // A navigation with nothing cached: show the offline screen rather
        // than the browser's dinosaur.
        if (request.mode === 'navigate') {
          const offline = await caches.match('/offline.html');
          if (offline) return offline;
        }
        return Response.error();
      })
  );
});
