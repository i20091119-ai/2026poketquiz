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
  ninja: {
    name: 'Ninja Adventure Asset Pack',
    by: 'pixel-boy',
    license: 'CC0 1.0',
    url: 'https://pixel-boy.itch.io/ninja-adventure-asset-pack',
  },
};
const OUT = 'core_outdoor.png', NATURE = 'core_outdoor_nature.png', BUILD = 'core_buildings.png';
const fileOf = f => (f === 'ninja' ? path.join(root, 'public', 'assets', 'village', 'village.png') : path.join(dir, f));
const sourceOf = f => (f === BUILD ? 'house' : f === 'ninja' ? 'ninja' : 'outdoor');

// ---------- 땅 ----------
// kind: tile = 한 칸 그대로, set = 8px 조각 4×4 (가운데가 땅 안쪽, 가장자리가 테두리), inner = 안쪽(꺾인) 모서리 4조각
const ground = [
  { name: 'grass', file: OUT, rect: [8, 536, 16, 16], kind: 'tile', label: '풀' },
  { name: 'water', file: OUT, rect: [256, 400, 16, 16], kind: 'tile', label: '물' },
  { name: 'sand', file: OUT, rect: [88, 56, 32, 32], kind: 'set', label: '흙길 테두리 세트(모서리·변·끝)' },
  { name: 'sandIn', file: OUT, rect: [96, 96, 32, 32], kind: 'inner', label: '흙길 안쪽 모서리' },
  { name: 'shore', file: OUT, rect: [264, 248, 32, 32], kind: 'set', label: '물가 테두리 세트(모래 물가, 가운데 비어 물이 보임)' },
  { name: 'shoreIn', file: OUT, rect: [256, 336, 32, 32], kind: 'inner', label: '물가 안쪽 모서리' },
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
  // 재료 그림 (마을에 떨어진 재료·가방)
  { name: 'matLeaf', file: NATURE, rect: [880, 256, 16, 16], cells: [1, 1], foot: null, flat: true, label: '재료: 풀잎' },
  { name: 'matTwig', file: NATURE, rect: [864, 320, 16, 16], cells: [1, 1], foot: null, flat: true, label: '재료: 나뭇가지' },
  { name: 'matPetal', file: OUT, rect: [464, 384, 16, 16], cells: [1, 1], foot: null, flat: true, label: '재료: 꽃잎' },
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
    layers.push({ input: await crop(p.file, p.rect), left: x + Math.floor((bw - w) / 2), top: y + (bh - h) });
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
