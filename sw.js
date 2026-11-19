// データやアセットを変えたら必ず上げる（iPhone 側のキャッシュ更新のため）
const CACHE_VERSION = "v1";
const CACHE = `toefl-anki-${CACHE_VERSION}`;
const ASSETS = [
  "./", "index.html", "style.css", "app.js", "manifest.webmanifest",
  "data/words.json", "data/passages.json",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ネットワーク優先（オンラインなら常に最新を取ってキャッシュを更新）。
// 繋がらないときだけキャッシュを返すので、オフラインでも動く。
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
