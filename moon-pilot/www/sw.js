// Offline support: serve the game from a cache and refresh the cache in the background.
// Bump VERSION when a release must drop old files at once.
const VERSION = "moon-pilot-v2";
const CORE = ["./", "index.html", "js/physics.js", "js/world.js", "js/backend.js", "js/game.js", "lib/three.min.js", "data/ghosts.js",
  "img/moon-2k.jpg", "img/moon-height.jpg", "icon-192.png", "favicon.png"];

self.addEventListener("install", e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;      // the leaderboard always goes to the network
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(e.request, {ignoreSearch: true});
    const fresh = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || fresh;
  }));
});
