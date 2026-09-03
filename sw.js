const CACHE = "dom-v45";
const FILES = [
  "./",
  "./index.html",
  "./portal.html",
  "./cam-lab.html",
  "./css/styles.css",
  "./css/public.css",
  "./css/cam-lab.css",
  "./js/app.js",
  "./js/auth.js",
  "./js/data.js",
  "./js/store.js",
  "./js/files.js",
  "./js/gcode.js",
  "./js/cam-lab.js",
  "./js/mill3d.js",
  "./js/safety.js",
  "./js/comm.js",
  "./js/i18n.js",
  "./js/public.js",
  "./js/pwa.js",
  "./assets/favicon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith((async () => {
    try {
      const res = await fetch(event.request);
      if (res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(event.request, res.clone());
      }
      return res;
    } catch {
      const hit = await caches.match(event.request);
      if (hit) return hit;
      if (event.request.mode === "navigate") {
        return (await caches.match("./index.html")) || new Response("<p>연결이 끊겼습니다. 잠시 후 다시 열어 주세요.</p>", {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      return new Response("", { status: 503 });
    }
  })());
});
