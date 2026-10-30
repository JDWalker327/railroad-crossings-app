const CACHE_NAME = "railroad-crossings-app-v20";
const APP_SHELL_URLS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./privacy.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./images/rr-up.png",
  "./images/rr-bnsf.png",
  "./images/rr-cn.png",
  "./images/rr-cpkc.png",
  "./images/rr-csx.png",
  "./images/rr-ns.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
            return null;
          })
        )
      ),
      self.clients.claim(),
    ])
  );
});

function isAppShellAsset(url) {
  return (
    url.pathname.endsWith("/") ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".webmanifest") ||
    url.pathname.endsWith(".png") ||
    url.pathname.includes("/icons/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        return (await cache.match(request)) || (await cache.match("./index.html"));
      }
    })());
    return;
  }

  if (!isAppShellAsset(url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Network-first for the app shell: a deploy is picked up on the next load
    // instead of one load later.
    try {
      const response = await fetch(request);
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cachedResponse = await cache.match(request);
      return cachedResponse || Response.error();
    }
  })());
});
