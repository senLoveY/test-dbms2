/*
 * Offline support:
 * - hashed build assets, fonts included: cache-first (their URLs change on every deploy)
 * - page navigations: network-first, falling back to the cached app shell
 * - GET /api/quizzes/*: network-first, so quizzes opened before can be studied offline
 * Everything else (game actions, rooms, auth) always goes to the network.
 */
const VERSION = "v2";
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const API = "api-quizzes";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.add("/")));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL, ASSETS, API]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(fallbackUrl || request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(fallbackUrl || request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL, "/"));
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/assets/")) event.respondWith(cacheFirst(request));
  else if (url.pathname.startsWith("/api/quizzes")) event.respondWith(networkFirst(request, API));
});
