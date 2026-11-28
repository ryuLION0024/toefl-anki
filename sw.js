// コードやデータを変えたら上げる（古いキャッシュを確実に消すため）
const CACHE_VERSION = "v10";
const CACHE = `toefl-anki-${CACHE_VERSION}`;
const CORE = [
  "./", "index.html", "style.css", "app.js", "practice.js", "manifest.webmanifest", "data/index.json", "data/prefixes.json",
  "data/practice/build.json", "data/practice/repeat.json", "data/practice/templates.json", "data/practice/interview.json",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
];

// 本体に加え、data/index.json に載っている全バッチを先にキャッシュする
async function precache() {
  const c = await caches.open(CACHE);
  await c.addAll(CORE);
  const { batches } = await (await c.match("data/index.json")).json();
  await c.addAll(batches.flatMap((b) => [`data/words/${b}.json`, `data/passages/${b}.json`]));
}

self.addEventListener("install", (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
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
