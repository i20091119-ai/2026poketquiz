// 포켓몬 마을 그림을 "땅 그림판"과 "물건 그림판" 두 장으로 묶습니다 (2026-11-13).
// - 기준 타일 = 16px. 모든 조각은 16px의 배수 크기(물건은 투명 배경에 아래·가운데로 맞춰 칸 크기로 채움).
// - 땅: 한 칸짜리(풀·물)와 이어지는 땅의 오토타일 세트(8px 조각 4×4 = 32×32: 흙길, 물가, 그 안쪽 모서리).
// - 물건: 집·나무·덤불·꽃·버섯·돌·그루터기·연잎·울타리·재료 그림.
// 그림 출처: Tuxemon 게임의 무료 타일(CC BY-SA 4.0 등) + 물방울 하나만 Ninja Adventure(CC0, 예전 village.png).
// 다시 만들 때: node scripts/pack-village-town.mjs <Tuxemon 저장소의 mods/tuxemon/gfx/tilesets 폴더>
//   (서준이 걷는 그림은 같은 저장소의 mods/tuxemon/sprites/postboy.png 를 찾아 씀)
// 결과(모두 git에 포함, 원본 묶음은 안 넣음):
//   public/assets/village/ground.png, public/assets/village/objects.png, public/assets/village/player.png(서준이)
//   lib/data/village-assets.json (조각 이름 → 자리·칸 크기·밟는 칸·출처)
//   public/assets/village/ASSETS.md (그림 목록: 칸 크기·원본·그린 사람·사용 조건)
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const sharp = createRequire(import.meta.url)('sharp');
const dir = process.argv[2];
if (!dir || !existsSync(path.join(dir, 'core_outdoor.png'))) {
  console.error('사용법: node scripts/pack-village-town.mjs <Tuxemon mods/tuxemon/gfx/tilesets 폴더>');
  process.exit(1);
}
const root = process.cwd();
const TILE = 16;

// ---------- 출처 ----------
const SOURCES = {
  outdoor: {
    name: 'Tuxemon "Core Outdoor" / "Core Outdoor Nature" / "Core Outdoor Water"',
    by: 'rubberduck (Buch·luke83·Past the Future·George_·Midi 원작 기반)',
    license: 'CC BY-SA 4.0',
    url: 'https://github.com/Tuxemon/Tuxemon/blob/development/ATTRIBUTIONS.md',
  },
  house: {
    name: 'Tuxemon "Core Buildings" 중 "Inspired 16x16 Tiles"',
    by: 'RedVoxel (지붕 고침: Jaskrendix)',
    license: 'CC BY-SA 4.0',
    url: 'https://opengameart.org/content/pokemon-inspired-16x16-tiles',
  },
  catch: {
    name: 'Tuxemon "Postboy" 걷는 그림 (Catch Challenger 원작)',
    by: 'Catch Challenger (색 고침: Sanglorian)',
    license: 'CC BY 4.0 (Tuxemon 묶음 CC BY-SA 4.0)',
    url: 'https://github.com/alphaonex86/CatchChallenger-datapack',
  },
  armm: {
    name: 'Tuxemon "Objects" (둥근 덤불, 마을 나무색으로 바꿈)',
    by: 'ArMM1998',
    license: 'CC0 1.0 (출처 표시 안 해도 됨)',
    url: 'https://wiki.tuxemon.org/index.php?title=File:Objects_by_ArMM1998.png',
  },
  george: {
    name: 'Tuxemon "Furniture and Fittings" (제작대 가게)',
    by: 'George_',
    license: 'CC BY 3.0',
    url: 'https://wiki.tuxemon.org/index.php?title=File:Furniture_and_Fittings_by_George.png',
  },
  drawn: {
    name: '직접 그림 (열매나무 = 마을 둥근 나무 + 열매, 우편함·철·반짝돌은 새로 그림)',
    by: '포켓몬 배움 탐험대',
    license: '열매나무는 원본(CC BY-SA 4.0)을 따름, 나머지는 자유롭게 사용',
    url: '',
  },
  isaiah: {
    name: 'Tuxemon "Outdoor odds and ends"',
    by: 'Isaiah658',
    license: 'CC0 1.0 (출처 표시 안 해도 됨)',
    url: 'https://wiki.tuxemon.org/index.php?title=File:Outdoor_odds_and_ends_by_Isaiah658.png',
  },
  ninja: {
    name: 'Ninja Adventure Asset Pack',
    by: 'pixel-boy',
    license: 'CC0 1.0',
    url: 'https://pixel-boy.itch.io/ninja-adventure-asset-pack',
  },
};
const ODDS = 'Outdoor_odds_and_ends_by_Isaiah658.png';
const ARMM = 'Objects_by_ArMM1998.png';
const GEORGE = 'Furniture_and_Fittings_by_George.png';
/** 직접 그린 그림 (file 자리에 넣는 표시) */
const DRAWN = 'drawn';
const OUT = 'core_outdoor.png', NATURE = 'core_outdoor_nature.png', BUILD = 'core_buildings.png';
const fileOf = f => (f === 'ninja' ? path.join(root, 'public', 'assets', 'village', 'village.png') : path.join(dir, f));
const sourceOf = f => (f === BUILD ? 'house' : f === 'ninja' ? 'ninja' : f === ODDS ? 'isaiah' : f === ARMM ? 'armm' : f === GEORGE ? 'george' : f === DRAWN ? 'drawn' : 'outdoor');

// ---------- 그림 고치기 도우미 (2026-11-14) ----------
async function rawOf(file, [x, y, w, h]) {
  const { data } = await sharp(fileOf(file)).extract({ left: x, top: y, width: w, height: h }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w, h };
}
const png = ({ data, w, h }) => sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
function rgb2hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h * 60) + 360) % 360 / 360, mx ? d / mx : 0, mx / 255];
}
function hsv2rgb(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
/** 청록빛 덤불을 마을 나무와 같은 초록으로 (색상만 옮김) */
async function greenBush(rect) {
  const img = await rawOf(ARMM, rect);
  for (let i = 0; i < img.data.length; i += 4) {
    if (!img.data[i + 3]) continue;
    const [h, sat, v] = rgb2hsv(img.data[i], img.data[i + 1], img.data[i + 2]);
    if (h > 0.35 && h < 0.6 && sat > 0.25) [img.data[i], img.data[i + 1], img.data[i + 2]] = hsv2rgb((h - 0.09 + 1) % 1, sat, v);
  }
  return img;
}
/** 흙길 테두리 세트의 모래색 칸을 다른 무늬(돌)로 바꿔 같은 모양의 세트를 만듦 (풀색 테두리는 그대로) */
async function restyle(setRect, texFile, texRect) {
  const set = await rawOf(OUT, setRect), tex = await rawOf(texFile, texRect);
  const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b, base = lum(216, 200, 128);
  for (let y = 0; y < set.h; y++) for (let x = 0; x < set.w; x++) {
    const i = (y * set.w + x) * 4, d = set.data;
    if (!d[i + 3] || d[i + 1] > d[i] + 15) continue;
    const f = Math.min(1.25, lum(d[i], d[i + 1], d[i + 2]) / base), j = ((y % tex.h) * tex.w + (x % tex.w)) * 4;
    for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, Math.round(tex.data[j + c] * f));
    d[i + 3] = 255;
  }
  return png(set);
}

// ---------- 직접 그리기 (2026-11-14 열매·제작대) ----------
const OUTLINE = [60, 40, 50];
function canvas(w, h) { return { data: Buffer.alloc(w * h * 4), w, h }; }
function dot(img, x, y, [r, g, b], a = 255) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const i = (y * img.w + x) * 4; img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a;
}
function rect(img, x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) dot(img, x, y, c); }
/** 열매 색 (열매 6종: lib/game-config.ts POTIONS) */
const BERRY_COLORS = { apple: [214, 48, 56], blue: [80, 150, 230], fire: [240, 120, 40], thunder: [245, 205, 40], moon: [150, 90, 200], star: [245, 150, 190] };
/** 마을 둥근 나무 위에 열매 6개를 그림 */
async function fruitTree(color) {
  const t = await rawOf(NATURE, [801, 8, 30, 38]);
  for (const [x, y] of [[7, 8], [19, 6], [12, 15], [23, 14], [6, 19], [17, 21]]) {
    rect(t, x - 1, y - 2, x + 1, y + 2, OUTLINE); rect(t, x - 2, y - 1, x + 2, y + 1, OUTLINE);
    rect(t, x - 1, y - 1, x + 1, y + 1, color); dot(t, x - 1, y - 1, [255, 255, 255]);
  }
  return png(t);
}
function mailbox(flag) {
  const m = canvas(16, 32);
  rect(m, 7, 14, 8, 30, [110, 72, 48]); rect(m, 6, 14, 6, 30, OUTLINE); rect(m, 9, 14, 9, 30, OUTLINE);
  rect(m, 3, 6, 12, 15, [206, 58, 58]); rect(m, 2, 7, 2, 14, OUTLINE); rect(m, 13, 7, 13, 14, OUTLINE); rect(m, 3, 5, 12, 5, OUTLINE); rect(m, 3, 16, 12, 16, OUTLINE);
  rect(m, 3, 8, 12, 8, [236, 110, 100]); rect(m, 5, 11, 10, 12, OUTLINE);
  if (flag) { rect(m, 13, 1, 13, 10, OUTLINE); rect(m, 14, 1, 15, 4, [250, 210, 60]); }
  return png(m);
}
function ironIcon() {
  const m = canvas(16, 16);
  rect(m, 3, 9, 13, 13, [120, 128, 150]); rect(m, 4, 6, 11, 8, [190, 195, 210]);
  rect(m, 3, 5, 12, 5, OUTLINE); rect(m, 2, 6, 2, 14, OUTLINE); rect(m, 14, 9, 14, 14, OUTLINE); rect(m, 3, 14, 13, 14, OUTLINE); rect(m, 12, 6, 13, 8, OUTLINE);
  rect(m, 5, 7, 10, 7, [235, 238, 248]);
  return png(m);
}
function sparkleIcon() {
  const m = canvas(16, 16);
  for (let y = 1; y <= 14; y++) {
    const half = y <= 6 ? Math.round((y - 1) * 5 / 5) : Math.round((14 - y) * 5 / 8);
    for (let x = 8 - half; x <= 8 + half; x++) dot(m, x, y, x <= 8 ? [190, 245, 255] : [120, 220, 240]);
    dot(m, 8 - half - 1, y, OUTLINE); dot(m, 8 + half + 1, y, OUTLINE);
  }
  dot(m, 8, 0, OUTLINE); dot(m, 8, 15, OUTLINE); dot(m, 6, 4, [255, 255, 255]); dot(m, 13, 2, [255, 250, 200]); dot(m, 2, 12, [255, 250, 200]);
  return png(m);
}

// ---------- 땅 ----------
// kind: tile = 한 칸 그대로, set = 8px 조각 4×4 (가운데가 땅 안쪽, 가장자리가 테두리), inner = 안쪽(꺾인) 모서리 4조각
const ground = [
  { name: 'grass', file: OUT, rect: [8, 536, 16, 16], kind: 'tile', label: '풀' },
  { name: 'water', file: OUT, rect: [256, 400, 16, 16], kind: 'tile', label: '물' },
  { name: 'sand', file: OUT, rect: [88, 56, 32, 32], kind: 'set', label: '흙길 테두리 세트(모서리·변·끝)' },
  { name: 'sandIn', file: OUT, rect: [96, 96, 32, 32], kind: 'inner', label: '흙길 안쪽 모서리' },
  { name: 'shore', file: OUT, rect: [264, 248, 32, 32], kind: 'set', label: '물가 테두리 세트(모래 물가, 가운데 비어 물이 보임)' },
  { name: 'shoreIn', file: OUT, rect: [256, 336, 32, 32], kind: 'inner', label: '물가 안쪽 모서리' },
  // 돌길: 흙길 세트 모양에 돌 무늬(core_outdoor_nature 의 돌 칸)를 입혀 만듦
  { name: 'stoneSet', file: OUT, rect: [88, 56, 32, 32], kind: 'set', label: '돌길 테두리 세트(흙길 모양 + 돌 무늬)', make: () => restyle([88, 56, 32, 32], NATURE, [736, 640, 16, 16]) },
  { name: 'stoneIn', file: OUT, rect: [96, 96, 32, 32], kind: 'inner', label: '돌길 안쪽 모서리', make: () => restyle([96, 96, 32, 32], NATURE, [736, 640, 16, 16]) },
];

// ---------- 물건 ----------
// cells = [가로, 세로] 칸, foot = 밟을 수 없는 칸 [x, y, 가로, 세로] (그림 왼쪽 위 칸 기준, 없으면 지나갈 수 있음),
// flat = 바닥에 붙은 작은 것(포켓몬보다 항상 아래에 그림)
const objects = [
  { name: 'house', file: BUILD, rect: [194, 310, 76, 90], cells: [5, 6], foot: [0, 3, 5, 3], label: '집' },
  { name: 'treeRound', file: NATURE, rect: [801, 8, 30, 38], cells: [2, 3], foot: [0, 1, 2, 2], label: '둥근 나무' },
  { name: 'treePine', file: NATURE, rect: [705, 4, 30, 42], cells: [2, 3], foot: [0, 1, 2, 2], label: '뾰족 나무' },
  { name: 'pineSmall', file: OUT, rect: [384, 448, 16, 32], cells: [1, 2], foot: [0, 1, 1, 1], label: '작은 뾰족 나무' },
  { name: 'bush', file: OUT, rect: [400, 528, 16, 16], cells: [1, 1], foot: null, label: '덤불(풀숲)' },
  { name: 'bushRose', file: OUT, rect: [384, 528, 16, 16], cells: [1, 1], foot: null, label: '꽃 덤불' },
  { name: 'flowerRed', file: OUT, rect: [448, 448, 16, 16], cells: [1, 1], foot: null, flat: true, label: '빨간 꽃' },
  { name: 'flowerYellow', file: OUT, rect: [464, 448, 16, 16], cells: [1, 1], foot: null, flat: true, label: '노란 꽃' },
  { name: 'flowerWhite', file: OUT, rect: [432, 448, 16, 16], cells: [1, 1], foot: null, flat: true, label: '흰 꽃' },
  { name: 'flowerPink', file: OUT, rect: [464, 384, 16, 16], cells: [1, 1], foot: null, flat: true, label: '분홍 꽃' },
  { name: 'flowerBlue', file: OUT, rect: [480, 384, 16, 16], cells: [1, 1], foot: null, flat: true, label: '파란 꽃' },
  { name: 'flowerOrange', file: OUT, rect: [448, 400, 16, 16], cells: [1, 1], foot: null, flat: true, label: '주황 꽃' },
  { name: 'mushroom', file: OUT, rect: [464, 464, 16, 16], cells: [1, 1], foot: null, flat: true, label: '빨간 버섯' },
  { name: 'mushroomBrown', file: OUT, rect: [448, 464, 16, 16], cells: [1, 1], foot: null, flat: true, label: '갈색 버섯' },
  { name: 'rock', file: OUT, rect: [464, 480, 16, 16], cells: [1, 1], foot: null, flat: true, label: '돌' },
  { name: 'stump', file: OUT, rect: [464, 528, 16, 16], cells: [1, 1], foot: null, flat: true, label: '그루터기' },
  { name: 'lily', file: OUT, rect: [384, 480, 16, 16], cells: [1, 1], foot: null, flat: true, label: '연잎(물 위)' },
  // 나무 울타리 9조각 (3×3 틀: 모서리 4·가로·세로·기둥 하나)
  ...[['TL', 0, 0], ['T', 1, 0], ['TR', 2, 0], ['L', 0, 1], ['Post', 1, 1], ['R', 2, 1], ['BL', 0, 2], ['B', 1, 2], ['BR', 2, 2]].map(([k, cx, cy]) => (
    { name: 'fence' + k, file: OUT, rect: [256 + cx * 16, 416 + cy * 16, 16, 16], cells: [1, 1], foot: [0, 0, 1, 1], label: '나무 울타리 ' + k })),
  // 꾸미기 물건 (2026-11-14, 외곽선이 조금 더 진한 그림)
  { name: 'pot', file: ODDS, rect: [148, 2, 8, 13], cells: [1, 1], foot: [0, 0, 1, 1], label: '꽃 화분' },
  { name: 'flowerBox', file: ODDS, rect: [113, 35, 30, 12], cells: [2, 1], foot: [0, 0, 2, 1], label: '꽃 상자' },
  { name: 'bench', file: ODDS, rect: [115, 0, 26, 15], cells: [2, 1], foot: [0, 0, 2, 1], label: '벤치' },
  // 덤불 (2026-11-14 부모님: 큰 둥근 덤불은 서식지에, 작은 덤불은 꾸미기에)
  { name: 'bushBig', file: ARMM, rect: [256, 192, 32, 32], cells: [2, 2], foot: null, label: '큰 덤불 숲(초록 풀숲 서식지 완성)', make: async () => png(await greenBush([256, 192, 32, 32])) },
  { name: 'bushSmall', file: ARMM, rect: [256, 192, 16, 16], cells: [1, 1], foot: null, label: '작은 덤불(꾸미기)', make: async () => sharp(await png(await greenBush([256, 192, 32, 32]))).resize(16, 16, { kernel: 'nearest' }).png().toBuffer() },
  // 열매나무 6종(열매 색 = 열매 종류), 제작대, 우편함 (2026-11-14 열매·제작대)
  ...Object.entries(BERRY_COLORS).map(([k, c]) => ({ name: 'fruitTree_' + k, file: DRAWN, rect: [801, 8, 30, 38], cells: [2, 3], foot: [0, 1, 2, 2], label: '열매나무(' + k + ')', make: () => fruitTree(c) })),
  { name: 'workbench', file: GEORGE, rect: [80, 48, 48, 32], cells: [3, 2], foot: [0, 1, 3, 1], label: '제작대(줄무늬 지붕 가게)' },
  { name: 'mailbox', file: DRAWN, rect: [0, 0, 16, 32], cells: [1, 2], foot: [0, 1, 1, 1], label: '우편함', make: () => mailbox(false) },
  { name: 'mailboxFlag', file: DRAWN, rect: [0, 0, 16, 32], cells: [1, 2], foot: [0, 1, 1, 1], label: '우편함(택배 옴)', make: () => mailbox(true) },
  { name: 'matIron', file: DRAWN, rect: [0, 0, 16, 16], cells: [1, 1], foot: null, flat: true, label: '재료: 철 (훈련으로만)', make: () => ironIcon() },
  { name: 'matSparkle', file: DRAWN, rect: [0, 0, 16, 16], cells: [1, 1], foot: null, flat: true, label: '재료: 반짝돌 (복습으로만)', make: () => sparkleIcon() },
  { name: 'sapling', file: ARMM, rect: [256, 192, 16, 16], cells: [1, 1], foot: null, flat: true, label: '열매나무 묘목', make: async () => sharp(await png(await greenBush([256, 192, 32, 32]))).resize(12, 12, { kernel: 'nearest' }).extend({ top: 2, bottom: 2, left: 2, right: 2, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer() },
  // 재료 그림 (마을에 떨어진 재료·가방)
  { name: 'matLeaf', file: NATURE, rect: [880, 256, 16, 16], cells: [1, 1], foot: null, flat: true, label: '재료: 풀잎' },
  { name: 'matTwig', file: NATURE, rect: [864, 320, 16, 16], cells: [1, 1], foot: null, flat: true, label: '재료: 나뭇가지' },
  { name: 'matPetal', file: OUT, rect: [464, 384, 16, 16], cells: [1, 1], foot: null, flat: true, label: '재료: 꽃잎' },
  { name: 'matStone', file: NATURE, rect: [656, 64, 16, 16], cells: [1, 1], foot: null, flat: true, label: '재료: 돌멩이' },
  { name: 'matMud', file: NATURE, rect: [640, 0, 16, 16], cells: [1, 1], foot: null, flat: true, label: '재료: 진흙' },
];

async function crop(file, [x, y, w, h]) {
  return sharp(fileOf(file)).extract({ left: x, top: y, width: w, height: h }).png().toBuffer();
}
// 물방울: 예전 그림(village.png)에서 자리를 찾아서
{
  const old = JSON.parse(readFileSync(path.join(root, 'lib', 'data', 'village-atlas.json'), 'utf8'));
  objects.push({ name: 'matDrop', file: 'ninja', rect: old.pieces.m_drop, cells: [1, 1], foot: null, flat: true, label: '재료: 물방울 (임시, 다른 그림체)' });
}

/** 조각들을 16px 칸에 맞춰 한 장에 (가로 sheetW) */
async function packSheet(list, sheetW, place) {
  let x = 0, y = 0, rowH = 0;
  const layers = [], atlas = {};
  for (const p of list) {
    const [, , w, h] = p.rect;
    const bw = p.cells ? p.cells[0] * TILE : w, bh = p.cells ? p.cells[1] * TILE : h;
    if (bw % TILE || bh % TILE) throw new Error(`${p.name}: 16px 배수가 아니에요 (${bw}×${bh})`);
    if (w > bw || h > bh) throw new Error(`${p.name}: 그림(${w}×${h})이 칸(${bw}×${bh})보다 커요`);
    if (x + bw > sheetW) { x = 0; y += rowH; rowH = 0; }
    // 물건은 칸 상자 안에서 아래·가운데로
    layers.push({ input: p.make ? await p.make() : await crop(p.file, p.rect), left: x + Math.floor((bw - w) / 2), top: y + (bh - h) });
    atlas[p.name] = place(p, [x, y, bw, bh]);
    x += bw; rowH = Math.max(rowH, bh);
  }
  return { layers, atlas, width: sheetW, height: y + rowH };
}
async function write(sheet, file) {
  await sharp({ create: { width: sheet.width, height: sheet.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(sheet.layers).png({ compressionLevel: 9 }).toFile(path.join(root, 'public', 'assets', 'village', file));
}
mkdirSync(path.join(root, 'public', 'assets', 'village'), { recursive: true });
const g = await packSheet(ground, 128, (p, r) => ({ rect: r, kind: p.kind, source: sourceOf(p.file), label: p.label }));
const o = await packSheet(objects, 160, (p, r) => ({
  rect: r, cells: p.cells, foot: p.foot, ...(p.flat ? { flat: true } : null), source: sourceOf(p.file), label: p.label,
}));
await write(g, 'ground.png');
// 서준이: 16×32 칸 3장(걷기) × 4줄(아래·왼쪽·오른쪽·위)
const playerFile = path.join(dir, '..', '..', 'sprites', 'postboy.png');
await sharp(playerFile).png({ compressionLevel: 9 }).toFile(path.join(root, 'public', 'assets', 'village', 'player.png'));
const playerMeta = await sharp(playerFile).metadata();
const players = {
  seojun: {
    file: '/assets/village/player.png', width: playerMeta.width, height: playerMeta.height, frame: [16, 32], cells: [1, 2],
    rows: { down: 0, left: 1, right: 2, up: 3 }, walk: [1, 0, 1, 2], source: 'catch', label: '서준이 (빨간 모자 트레이너, 4방향 걷기)',
  },
};
await write(o, 'objects.png');
const manifest = {
  tile: TILE,
  sheets: { ground: { file: '/assets/village/ground.png', width: g.width, height: g.height }, objects: { file: '/assets/village/objects.png', width: o.width, height: o.height } },
  ground: g.atlas, objects: o.atlas, players, sources: SOURCES,
};
writeFileSync(path.join(root, 'lib', 'data', 'village-assets.json'), JSON.stringify(manifest, null, 1) + '\n');

// 사람이 읽는 그림 목록
const row = (n, p, cells, foot) => `| ${n} | ${p.label} | ${cells} | ${foot} | ${SOURCES[p.source].name} | ${SOURCES[p.source].by} | ${SOURCES[p.source].license} |`;
const md = [
  '# 포켓몬 마을 그림 목록',
  '',
  '`scripts/pack-village-town.mjs`가 만든 파일입니다(손으로 고치지 마세요). 기준 타일 16px, 화면에서는 3배(48px)로 그립니다.',
  '',
  '## 땅 (ground.png)',
  '',
  '| 이름 | 설명 | 칸 | 밟기 | 원본 | 그린 사람 | 사용 조건 |',
  '|---|---|---|---|---|---|---|',
  ...Object.entries(g.atlas).map(([n, p]) => row(n, p, p.kind === 'tile' ? '1×1' : '1×1 (8px 조각 16개 세트)', n.startsWith('water') || n.startsWith('shore') ? '못 감(물)' : '감')),
  '',
  '## 물건 (objects.png, 배경 투명)',
  '',
  '| 이름 | 설명 | 칸 | 밟기 | 원본 | 그린 사람 | 사용 조건 |',
  '|---|---|---|---|---|---|---|',
  ...Object.entries(o.atlas).map(([n, p]) => row(n, p, `${p.cells[0]}×${p.cells[1]}`, p.foot ? `못 감: ${p.foot[2]}×${p.foot[3]}칸` : '감')),
  '',
  '## 캐릭터 (player.png, 배경 투명)',
  '',
  '| 이름 | 설명 | 칸 | 밟기 | 원본 | 그린 사람 | 사용 조건 |',
  '|---|---|---|---|---|---|---|',
  ...Object.entries(players).map(([n, p]) => row(n, p, '1×2 (16×32 걷기 3장 × 4방향)', '-')),
  '',
  '## 출처',
  '',
  ...Object.values(SOURCES).map(s => `- ${s.name} — ${s.by} — ${s.license} — ${s.url}`),
  '',
].join('\n');
writeFileSync(path.join(root, 'public', 'assets', 'village', 'ASSETS.md'), md);
console.log(`✅ 땅 ${Object.keys(g.atlas).length}조각(ground.png ${g.width}×${g.height}), 물건 ${Object.keys(o.atlas).length}조각(objects.png ${o.width}×${o.height})`);
