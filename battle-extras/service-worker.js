// 포켓로그(/battle) 오프라인·데이터 절약용 서비스 워커 (battle/SPEC.md 8번).
// - 게임 파일(그림·소리·코드)을 한 번 받으면 브라우저 저장소(Cache Storage)에 두고 다시 받지 않습니다.
// - prepare.html 의 "게임 준비하기"가 PREFETCH 메시지를 보내면 전체 파일을 미리 받아 둡니다.
// - index.html, asset-manifest.json, /api/ 는 항상 새로 받습니다(새 버전 반영).
// 원본 포켓로그의 service-worker.js(빈 파일)를 이 파일로 바꿔 넣습니다. 빌드가 __BATTLE_VERSION__ 을 채웁니다.
const VERSION = "__BATTLE_VERSION__";
const CACHE = "battle-assets";
const SCOPE = new URL(self.registration.scope).pathname; // 예: /battle/
const MANIFEST_URL = SCOPE + "prefetch-manifest.json";
const ALWAYS_FRESH = [SCOPE, SCOPE + "index.html", SCOPE + "asset-manifest.json", SCOPE + "prefetch-manifest.json", SCOPE + "prepare", SCOPE + "prepare.html", SCOPE + "login", SCOPE + "service-worker.js"];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

const isCacheable = (req, url) =>
  url.origin === self.location.origin
  && url.pathname.startsWith(SCOPE)
  && !ALWAYS_FRESH.includes(url.pathname)
  && !url.pathname.startsWith("/api/")
  && req.mode !== "navigate" // 화면(HTML)은 늘 새로 받음: 로그인·안내 화면이 굳지 않게
  && !(req.headers.get("accept") || "").includes("text/html");

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!isCacheable(req, url)) return;
  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }),
  );
});

/** 미리 받기: 아직 없는 파일만 받고, 진행 상황을 요청한 화면으로 보냅니다. */
async function prefetch(client) {
  const cache = await caches.open(CACHE);
  const manifest = await (await fetch(MANIFEST_URL, { cache: "no-store" })).json();
  const files = manifest.files; // [path, size]
  const total = files.length;
  const totalBytes = files.reduce((a, [, s]) => a + s, 0);
  let done = 0;
  let doneBytes = 0;
  let failed = 0;
  const report = () => client.postMessage({ type: "PROGRESS", done, total, doneBytes, totalBytes, failed, version: VERSION });
  const keep = new Set(files.map(([p]) => self.location.origin + SCOPE + p));
  // 새 버전에서 사라진 파일은 지웁니다.
  for (const key of await cache.keys()) if (!keep.has(key.url.split("?")[0])) await cache.delete(key);
  let index = 0;
  const worker = async () => {
    while (index < files.length) {
      const [path, size] = files[index++];
      const url = SCOPE + path;
      if (!(await cache.match(url))) {
        try {
          const res = await fetch(url, { cache: "no-cache" });
          if (res.ok) await cache.put(url, res);
          else failed++;
        } catch {
          failed++;
        }
      }
      done++;
      doneBytes += size;
      if (done % 50 === 0 || done === total) report();
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  report();
  client.postMessage({ type: "DONE", done, total, failed, version: VERSION });
}

/** 지금 얼마나 받아 두었는지 */
async function status(client) {
  const cache = await caches.open(CACHE);
  const manifest = await (await fetch(MANIFEST_URL, { cache: "no-store" })).json();
  const cached = new Set((await cache.keys()).map(k => k.url.split("?")[0]));
  let have = 0;
  let haveBytes = 0;
  let totalBytes = 0;
  for (const [path, size] of manifest.files) {
    totalBytes += size;
    if (cached.has(self.location.origin + SCOPE + path)) {
      have++;
      haveBytes += size;
    }
  }
  client.postMessage({ type: "STATUS", have, total: manifest.files.length, haveBytes, totalBytes, version: VERSION });
}

self.addEventListener("message", event => {
  const client = event.source;
  if (!client) return;
  const type = event.data && event.data.type;
  if (type === "PREFETCH") event.waitUntil(prefetch(client).catch(err => client.postMessage({ type: "ERROR", message: String(err) })));
  else if (type === "STATUS") event.waitUntil(status(client).catch(err => client.postMessage({ type: "ERROR", message: String(err) })));
  else if (type === "CLEAR") event.waitUntil(caches.delete(CACHE).then(() => client.postMessage({ type: "CLEARED" })));
});
