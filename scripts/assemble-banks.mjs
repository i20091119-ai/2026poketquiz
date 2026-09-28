// data/banks/<과목>.csv (은행 열 포함) 6개를 은행별 CSV 3개(bank1~3.csv)로 합칩니다.
// 과목 파일을 고친 뒤 `node scripts/assemble-banks.mjs` 를 다시 실행하면 됩니다.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'data', 'banks');
const SUBJECTS = ['국어', '수학', '영어', '한자', '역사', '상식'];

function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) { if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
const esc = v => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const banks = { 1: [], 2: [], 3: [] };
for (const subject of SUBJECTS) {
  const rows = parseCsv(readFileSync(path.join(dir, `${subject}.csv`), 'utf8'));
  const header = rows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  for (const r of rows.slice(1)) {
    const bank = r[idx['은행']].trim();
    if (!banks[bank]) throw new Error(`${subject}: 은행 번호가 이상해요: ${bank}`);
    banks[bank].push(['과목', '문제', '보기1', '보기2', '보기3', '보기4', '보기5', '정답', '해설', '속성', '영역'].map(h => (r[idx[h]] ?? '').trim()));
  }
}
for (const [n, rows] of Object.entries(banks)) {
  const out = ['과목,문제,보기1,보기2,보기3,보기4,보기5,정답,해설,속성,영역', ...rows.map(r => r.map(esc).join(','))].join('\n') + '\n';
  writeFileSync(path.join(dir, `bank${n}.csv`), out);
  console.log(`bank${n}.csv: ${rows.length}문제`);
}
