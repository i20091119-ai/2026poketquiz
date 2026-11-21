// 그림 출처 페이지 public/guide/credits.html 을 만듭니다 (2026-11-20).
// 읽는 것: public/assets/village/lpc/CREDITS.csv (LPC 사람 그림, 원본 생성기 CREDITS.csv 그대로) · public/assets/village/LICENSE.txt (마을 땅·물건)
// 다시 만들 때: node scripts/make-credits.mjs  (그림을 바꾸면 위 두 파일을 고친 뒤 다시 실행)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const csvText = readFileSync(path.join(root, 'public/assets/village/lpc/CREDITS.csv'), 'utf8');
const villageLicense = readFileSync(path.join(root, 'public/assets/village/LICENSE.txt'), 'utf8');

function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
const [head, ...rows] = parseCsv(csvText.replace(/^﻿/, ''));
const col = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
const list = (s) => s.split(',').map(x => x.trim()).filter(Boolean);
const items = rows.map(r => ({
  file: r[col.our_file].trim(), what: r[col.what].trim(), source: r[col.source_file].trim(),
  authors: [...new Set(list(r[col.authors]))], licenses: [...new Set(list(r[col.licenses]))], urls: [...new Set(list(r[col.urls]))],
}));

// 진짜 마을 서준이 쓰는 그림 (lib/village-lpc.ts LPC_REAL = seojunLayers('tshirt', false, 'child', true))
const REAL = new Set(['body_teen.png', 'shoes_thin_gray.png', 'shorts_thin_tan.png', 'tshirt_teen_red.png', 'head_child_on_teen.png', 'hair_relm_child_brown_on_teen.png']);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const norm = (l) => l.replace(/\+$/, '').replace(/^CC-BY /, 'CC-BY ');

// 라이선스 종류별: 몇 개 그림에 들어 있나 (한 그림에 여러 개면 그중 하나를 골라 따르면 됨)
const count = new Map();
for (const it of items) for (const l of new Set(it.licenses.map(norm))) count.set(l, (count.get(l) ?? 0) + 1);
const allAuthors = [...new Set(items.flatMap(i => i.authors))].sort((a, b) => a.localeCompare(b));
const realAuthors = [...new Set(items.filter(i => REAL.has(i.file)).flatMap(i => i.authors))].sort((a, b) => a.localeCompare(b));

const LICENSE_INFO = {
  'CC-BY-SA 3.0': '만든 사람 이름을 밝히고, 고친 그림도 같은 조건으로 나눔',
  'OGA-BY 3.0': '만든 사람 이름을 밝힘 (OpenGameArt 라이선스, CC-BY와 비슷)',
  'GPL 3.0': '자유 소프트웨어 라이선스: 고친 것도 같은 조건으로 공개',
  'CC-BY 3.0': '만든 사람 이름을 밝힘',
  'CC-BY': '만든 사람 이름을 밝힘',
  'CC0': '조건 없음 (이름을 밝히지 않아도 됨)',
};

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>그림 출처</title>
<!-- scripts/make-credits.mjs 가 만든 파일입니다 (손으로 고치지 마세요) -->
<style>
  :root { --bg: #f4f8f1; --card: #fff; --ink: #20302a; --soft: #5b6b63; --green: #1f6b52; --line: #dfe9dc; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; line-height: 1.55; }
  header { position: sticky; top: 0; background: var(--green); color: #fff; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  header h1 { margin: 0; font-size: 19px; }
  header button { border: 0; border-radius: 12px; padding: 8px 12px; font-size: 15px; font-weight: 800; background: #fff; color: var(--green); }
  main { max-width: 900px; margin: 0 auto; padding: 12px 16px 40px; }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; margin: 12px 0; }
  h2 { font-size: 17px; margin: 4px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; vertical-align: top; border-top: 1px solid var(--line); padding: 6px 4px; }
  th { color: var(--soft); font-weight: 700; }
  .real { display: inline-block; padding: 0 6px; border-radius: 8px; background: #e3f3e8; color: var(--green); font-size: 11px; font-weight: 800; }
  .lic { white-space: nowrap; }
  small, .muted { color: var(--soft); }
  pre { white-space: pre-wrap; font-size: 12px; background: #f7faf6; border-radius: 10px; padding: 10px; }
  a { color: var(--green); word-break: break-all; }
  .wrap { overflow-x: auto; }
</style>
</head>
<body>
<header><h1>🎨 그림 출처</h1><button onclick="if (history.length > 1) history.back(); else window.close();">닫기</button></header>
<main>
<section>
  <h2>한눈에</h2>
  <ul>
    <li><b>마을 사람(서준) 그림</b>: LPC(Liberated Pixel Cup) 기여자들 — CC-BY-SA 3.0 / OGA-BY 3.0 / GPL 3.0 등 (아래 표)</li>
    <li><b>마을 땅·나무·집·물건</b>: Tuxemon 그림 작가들 — CC BY-SA 4.0 (일부 CC BY 3.0 / CC0), 아래 "마을 땅·물건"</li>
    <li><b>마을에서 움직이는 포켓몬</b>: 포켓로그(/battle)에 들어 있는 그림</li>
  </ul>
</section>
<section>
  <h2>사람 그림 (LPC) 라이선스 요약</h2>
  <p class="muted">원본: <a href="https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator">Universal LPC Spritesheet Character Generator</a> 의 CREDITS.csv 그대로. 한 그림에 라이선스가 여러 개면 그중 하나를 골라 따르면 돼요. 우리는 <b>CC-BY-SA 3.0</b>(또는 OGA-BY 3.0)으로 써요: 만든 사람 이름을 밝히고, 고친 그림(색 바꿈·_sj·_soft·_on_teen)도 같은 조건으로 나눠요.</p>
  <table>
    <tr><th>라이선스</th><th>그림 수</th><th>뜻</th></tr>
    ${[...count].sort((a, b) => b[1] - a[1]).map(([l, n]) => `<tr><td class="lic">${esc(l)}</td><td>${n} / ${items.length}</td><td>${esc(LICENSE_INFO[l] ?? '')}</td></tr>`).join('\n    ')}
  </table>
</section>
<section>
  <h2>진짜 마을 서준이 쓰는 그림의 만든 사람</h2>
  <p>${realAuthors.map(esc).join(', ')}</p>
</section>
<section>
  <h2>사람 그림 (LPC) 전체 목록</h2>
  <p class="muted">파일은 <code>/assets/village/lpc/</code>. 이름 뒤 _sj(서준 크기)·_soft(부드러운 테두리)·_on_teen(아이 얼굴 위치)은 이 게임에서 원본을 고친 그림이고, 원본과 같은 라이선스예요. <span class="real">서준</span> = 진짜 마을에서 쓰는 그림, 나머지는 시험용 마을(가족·옷 비교)에서만.</p>
  <div class="wrap"><table>
    <tr><th>파일</th><th>무엇</th><th>라이선스</th><th>만든 사람</th><th>원본 주소</th></tr>
    ${items.map(it => `<tr><td>${esc(it.file)} ${REAL.has(it.file) ? '<span class="real">서준</span>' : ''}<br><small>${esc(it.source)}</small></td><td>${esc(it.what)}</td><td class="lic">${it.licenses.map(esc).join('<br>')}</td><td>${it.authors.map(esc).join(', ')}</td><td>${it.urls.map(u => `<a href="${esc(u)}">${esc(u.replace(/^https?:\/\//, ''))}</a>`).join('<br>')}</td></tr>`).join('\n    ')}
  </table></div>
</section>
<section>
  <h2>LPC 기여자 전체 (가나다·ABC 순)</h2>
  <p>${allAuthors.map(esc).join(', ')}</p>
</section>
<section>
  <h2>마을 땅·물건 그림</h2>
  <p class="muted">조각별 목록: <a href="/assets/village/ASSETS.md">/assets/village/ASSETS.md</a></p>
  <pre>${esc(villageLicense)}</pre>
</section>
</main>
</body>
</html>
`;
writeFileSync(path.join(root, 'public/guide/credits.html'), html);
console.log(`✅ public/guide/credits.html: LPC 그림 ${items.length}개 · 기여자 ${allAuthors.length}명 · 라이선스 ${[...count].map(([l, n]) => `${l} ${n}`).join(', ')}`);
