const CACHE_NAME = "rail-crossings-shell-v1";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/app-icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const fallback = await caches.match("./index.html");
        if (fallback) return fallback;
        return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline</title><style>body{font-family:Arial,sans-serif;background:#f5f5f5;color:#1d1d1f;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px}main{background:#fff;border-radius:12px;padding:16px 18px;max-width:360px;box-shadow:0 4px 18px rgba(0,0,0,.12)}h1{margin:0 0 8px 0;font-size:1.1rem}p{margin:0;line-height:1.4}</style></head><body><main><h1>Offline</h1><p>Please reconnect to load the latest railroad crossing data.</p></main></body></html>`, {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
