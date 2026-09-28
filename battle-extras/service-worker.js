// 포켓로그(/battle) 오프라인·데이터 절약용 서비스 워커 (battle/SPEC.md 8번).
// - 게임 파일(그림·소리·코드)을 한 번 받으면 브라우저 저장소(Cache Storage)에 두고 다시 받지 않습니다.
// - prepare.html 의 "게임 준비하기"가 PREFETCH 메시지를 보내면 전체 파일을 미리 받아 둡니다.
// - index.html, asset-manifest.json, /api/ 는 항상 새로 받습니다(새 버전 반영).
// 원본 포켓로그의 service-worker.js(빈 파일)를 이 파일로 바꿔 넣습니다. 빌드가 __BATTLE_VERSION__ 을 채웁니다.
const VERSION = "__BATTLE_VERSION__";
// 파일이 3만 개가 넘어 저장소 하나에 다 넣으면 스마트폰 브라우저가 목록을 읽지 못합니다("Operation too large").
// 그래서 파일 경로에 따라 저장소 16개에 나눠 넣습니다. 예전 저장소 하나(battle-assets)는 지웁니다.
const CACHE = "battle-assets";
const SHARDS = 16;
const shardOf = path => {
  let h = 0;
  for (let i = 0; i < path.length; i++) h = (h * 31 + path.charCodeAt(i)) >>> 0;
  return h % SHARDS;
};
const shardName = n => `${CACHE}-${n}`;
const cacheFor = path => caches.open(shardName(shardOf(path)));
const allShards = () => Promise.all(Array.from({ length: SHARDS }, (_, n) => caches.open(shardName(n))));
/** 저장소의 파일 목록. 너무 커서 못 읽는 브라우저에서는 null */
const safeKeys = async cache => {
  try {
    return await cache.keys();
  } catch {
    return null;
  }
};
const SCOPE = new URL(self.registration.scope).pathname; // 예: /battle/
const MANIFEST_URL = SCOPE + "prefetch-manifest.json";
const ALWAYS_FRESH = [SCOPE, SCOPE + "index.html", SCOPE + "asset-manifest.json", SCOPE + "prefetch-manifest.json", SCOPE + "prepare", SCOPE + "prepare.html", SCOPE + "login", SCOPE + "service-worker.js"];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event =>
  event.waitUntil(Promise.all([self.clients.claim(), caches.delete(CACHE)])), // 예전 방식의 저장소 하나는 지움
);

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
    cacheFor(url.pathname).then(async cache => {
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
  for (const cache of await allShards()) {
    const keys = await safeKeys(cache);
    if (keys) for (const key of keys) if (!keep.has(key.url.split("?")[0])) await cache.delete(key);
  }
  let index = 0;
  const worker = async () => {
    while (index < files.length) {
      const [path, size] = files[index++];
      const url = SCOPE + path;
      const cache = await cacheFor(url);
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
  const manifest = await (await fetch(MANIFEST_URL, { cache: "no-store" })).json();
  const shards = await allShards();
  const cached = new Set();
  let listable = true;
  for (const cache of shards) {
    const keys = await safeKeys(cache);
    if (!keys) {
      listable = false;
      break;
    }
    for (const k of keys) cached.add(k.url.split("?")[0]);
  }
  let have = 0;
  let haveBytes = 0;
  let totalBytes = 0;
  for (const [path, size] of manifest.files) {
    totalBytes += size;
    const url = SCOPE + path;
    // 목록을 못 읽는 브라우저에서는 파일마다 하나씩 물어봅니다 (느리지만 확실함)
    const has = listable ? cached.has(self.location.origin + url) : !!(await (await cacheFor(url)).match(url));
    if (has) {
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
  else if (type === "CLEAR")
    event.waitUntil(
      Promise.all([caches.delete(CACHE), ...Array.from({ length: SHARDS }, (_, n) => caches.delete(shardName(n)))]).then(() =>
        client.postMessage({ type: "CLEARED" }),
      ),
    );
});
