import {
  CACHE_PREFIX,
  PRECACHE_CACHE_NAME,
  PRECACHE_URLS,
  RUNTIME_CACHE_NAME,
} from "./js/version.js";

const OFFLINE_URL = new URL("./index.html", self.location).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE_CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      removeOldCaches(),
      self.registration.navigationPreload?.enable(),
    ]).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request, event));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, event));
});

async function removeOldCaches() {
  const activeCaches = new Set([PRECACHE_CACHE_NAME, RUNTIME_CACHE_NAME]);
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((name) => name.startsWith(`${CACHE_PREFIX}-`) && !activeCaches.has(name))
      .map((name) => caches.delete(name)),
  );
}

async function networkFirstNavigation(request, event) {
  try {
    const preloaded = await event.preloadResponse;
    const response = preloaded || (await fetch(request));
    if (response.ok) {
      await putInCache(RUNTIME_CACHE_NAME, request, response);
    }
    return response;
  } catch {
    const cachedPage = await matchCachedRequest(request);
    if (cachedPage) return cachedPage;

    const offlinePage = await matchCachedRequest(OFFLINE_URL);
    if (offlinePage) return offlinePage;

    return new Response("当前离线，且游戏尚未完成首次缓存。", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function staleWhileRevalidate(request, event) {
  const cached = await matchCachedRequest(request);
  const refresh = fetch(request).then(async (response) => {
    if (response.ok) {
      await putInCache(RUNTIME_CACHE_NAME, request, response);
    }
    return response;
  });

  if (cached) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }

  try {
    return await refresh;
  } catch {
    return new Response("Resource unavailable while offline.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function matchCachedRequest(request) {
  const runtimeCache = await caches.open(RUNTIME_CACHE_NAME);
  const runtimeMatch = await runtimeCache.match(request, { ignoreSearch: true });
  if (runtimeMatch) return runtimeMatch;

  const precache = await caches.open(PRECACHE_CACHE_NAME);
  return precache.match(request, { ignoreSearch: true });
}

async function putInCache(cacheName, request, response) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
}
