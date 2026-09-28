// 퀴즈 앱 서비스 워커 (홈 화면 "앱 설치"용). 파일을 저장해 두지 않고 늘 새로 받습니다.
// 인터넷이 끊겼을 때 화면(페이지)을 열면 빈 화면 대신 "인터넷 연결을 확인해 줘" 안내만 보여 줍니다.
// 포켓로그(/battle/)는 자기 서비스 워커(범위 /battle/)가 따로 있어 그쪽이 맡습니다.
const OFFLINE_HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>포켓몬 배움 탐험대</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f7f2;color:#1f2d27;font-family:system-ui,sans-serif;text-align:center;padding:24px}
button{margin-top:16px;border:0;border-radius:14px;padding:14px 22px;font-size:17px;font-weight:800;background:#17674e;color:#fff}</style></head>
<body><div><div style="font-size:56px">📶</div><h1 style="font-size:22px">인터넷에 연결되지 않았어</h1><p>와이파이나 데이터가 켜져 있는지 확인해 줘.</p><button onclick="location.reload()">다시 해 보기</button></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.mode !== "navigate") return; // 그림·요청 등은 그대로 (브라우저가 처리)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/battle/") || url.pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(req).catch(() => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })),
  );
});
