// turnbase service worker, generated at build time by vite.config.js from src/sw-template.js.
// Everything in the build is cached on install, so the app, its fonts and the scramble
// generator all work offline. Pages come from the network when it answers, so an update
// shows on the next visit; hashed files come from the cache first, since they never change.

const VERSION = '__VERSION__';
const CACHE = `turnbase-${VERSION}`;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // Older versions are kept one generation, so a page opened before the update can
      // still load the files it was built with.
      .then((keys) => keys.filter((key) => key.startsWith('turnbase-') && key !== CACHE))
      .then((old) => Promise.all(old.slice(0, -1).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function fromNetworkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put('/', response.clone());
    return response;
  } catch {
    return (await cache.match('/', { ignoreVary: true })) ?? Response.error();
  }
}

async function fromCacheFirst(request) {
  const hit = await caches.match(request, { ignoreSearch: true, ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    // Every route is the same single page.
    event.respondWith(fromNetworkFirst(request));
    return;
  }
  event.respondWith(fromCacheFirst(request));
});
