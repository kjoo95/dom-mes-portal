const CACHE = "dom-v130";
const FILES = [
  "./portal.html",
  "./cam-lab.html",
  "./css/styles.css",
  "./css/cam-lab.css",
  "./js/app.js",
  "./js/auth.js",
  "./js/data.js",
  "./js/eq-machines.js",
  "./js/store.js",
  "./js/files.js",
  "./js/gcode.js",
  "./js/cam-lab.js",
  "./js/mill3d.js",
  "./js/safety.js",
  "./js/comm.js",
  "./js/i18n.js",
  "./js/pwa.js",
  "./assets/favicon.svg",
  "./assets/favicon-32.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-512.png",
  "./assets/apple-touch-icon.png",
  "./assets/dom-logo.png",
  "./assets/dom-letterhead.png",
  "./assets/dom-seal.png",
];

function publicPage(url) {
  const path = new URL(url).pathname;
  if (/portal\.html|cam-lab\.html|sync\.html/i.test(path)) return false;
  const name = path.split("/").pop();
  return !name || name === "index.html" || /^(about|work|contact)\.html$/i.test(name);
}

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
  if (publicPage(event.request.url)) {
    event.respondWith(fetch(event.request));
    return;
  }
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
        return (await caches.match("./portal.html")) || new Response("<p>연결이 끊겼습니다. 잠시 후 다시 열어 주세요.</p>", {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      return new Response("", { status: 503 });
    }
  })());
});

