// 포켓몬 마을 타일 그림을 한 장으로 묶습니다 (2026-11-13).
// 그림 출처: Ninja Adventure Asset Pack (pixel-boy, CC0 1.0 — 누구나 자유롭게 사용 가능). 필요한 조각만 잘라 씁니다.
// 다시 만들 때: node scripts/pack-village-tiles.mjs <풀어 둔 묶음 폴더들…>
//   (Backgrounds/Tilesets, Items/Resource, Actor/Character/Boy 가 들어 있는 폴더를 모두 넘기면 알아서 찾아요)
// 결과: public/assets/village/village.png (한 장) + lib/data/village-atlas.json (조각 이름 → 자리), 둘 다 git에 포함.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const sharp = createRequire(import.meta.url)('sharp');
const roots = process.argv.slice(2);
if (!roots.length) { console.error('사용법: node scripts/pack-village-tiles.mjs <묶음 폴더>…'); process.exit(1); }
const find = rel => {
  for (const r of roots) { const p = path.join(r, rel); if (existsSync(p)) return p; }
  throw new Error('그림을 찾지 못했어요: ' + rel);
};
const FLOOR = 'Backgrounds/Tilesets/TilesetFloor.png';
const WATER = 'Backgrounds/Tilesets/TilesetWater.png';
const NATURE = 'Backgrounds/Tilesets/TilesetNature.png';
const HOUSE = 'Backgrounds/Tilesets/TilesetHouse.png';
const RES = 'Items/Resource/';

/** [이름, 파일, 타일 x, 타일 y, 가로 칸, 세로 칸] (16px 칸 기준) */
const T = (name, file, x, y, w = 1, h = 1) => ({ name, file, rect: [x * 16, y * 16, w * 16, h * 16] });
const pieces = [
  // 풀밭
  T('grass', FLOOR, 0, 12), T('grass1', FLOOR, 1, 12), T('grass2', FLOOR, 2, 12), T('grass3', FLOOR, 3, 12), T('grass4', FLOOR, 4, 12),
  // 흙길·밭 (이웃 칸을 보고 고르는 조각들)
  T('d_tl', FLOOR, 0, 7), T('d_t', FLOOR, 1, 7), T('d_tr', FLOOR, 2, 7),
  T('d_l', FLOOR, 0, 8), T('d_c', FLOOR, 1, 8), T('d_r', FLOOR, 2, 8),
  T('d_bl', FLOOR, 0, 9), T('d_b', FLOOR, 1, 9), T('d_br', FLOOR, 2, 9),
  T('d_v1', FLOOR, 3, 7), T('d_v', FLOOR, 3, 8), T('d_v2', FLOOR, 3, 9),
  T('d_h1', FLOOR, 0, 10), T('d_h', FLOOR, 1, 10), T('d_h2', FLOOR, 2, 10), T('d_one', FLOOR, 3, 10),
  // 물 (연못·물웅덩이)
  T('w_tl', WATER, 0, 6), T('w_t', WATER, 1, 6), T('w_tr', WATER, 2, 6),
  T('w_l', WATER, 0, 7), T('w_c', WATER, 1, 7), T('w_r', WATER, 2, 7),
  T('w_bl', WATER, 0, 8), T('w_b', WATER, 1, 8), T('w_br', WATER, 2, 8),
  T('w_v1', WATER, 3, 6), T('w_v', WATER, 3, 7), T('w_v2', WATER, 3, 8),
  T('w_h1', WATER, 0, 9), T('w_h', WATER, 1, 9), T('w_h2', WATER, 2, 9),
  // 나무·덤불·꽃·돌
  T('tree', NATURE, 0, 0, 2, 2), T('treePink', NATURE, 14, 0, 2, 2), T('bush', NATURE, 1, 10), T('tuft', NATURE, 3, 10),
  T('sunflower', NATURE, 0, 11), T('sunflower2', NATURE, 1, 11), T('redflower', NATURE, 3, 11), T('daisy', NATURE, 6, 11),
  T('rock', NATURE, 4, 13), T('stump', NATURE, 4, 8),
  // 집·문
  T('house', HOUSE, 0, 0, 4, 3), T('gate', HOUSE, 0, 5, 3, 2),
  // 재료 그림
  { name: 'm_leaf', file: RES + 'Grass.png', rect: null }, { name: 'm_drop', file: RES + 'Water.png', rect: null }, { name: 'm_twig', file: RES + 'Branch.png', rect: null },
  // 아이 (4방향 × 4걸음, 16×16 칸: 열 = 아래·위·왼·오른, 행 = 걸음)
  { name: 'boy', file: 'Actor/Character/Boy/SpriteSheet.png', rect: [0, 0, 64, 64] },
];

const SHEET_W = 256;
let x = 0, y = 0, rowH = 0;
const layers = [];
const atlas = {};
for (const p of pieces) {
  const file = find(p.file);
  let img = sharp(file);
  const meta = await img.metadata();
  const [sx, sy, w, h] = p.rect ?? [0, 0, meta.width, meta.height];
  // 16보다 작은 그림(재료)은 16×16 칸 가운데에
  const cw = Math.max(w, 16), ch = Math.max(h, 16);
  if (x + cw > SHEET_W) { x = 0; y += rowH; rowH = 0; }
  const buf = await sharp(file).extract({ left: sx, top: sy, width: w, height: h }).png().toBuffer();
  layers.push({ input: buf, left: x + Math.floor((cw - w) / 2), top: y + Math.floor((ch - h) / 2) });
  atlas[p.name] = [x, y, cw, ch];
  x += cw; rowH = Math.max(rowH, ch);
}
// 물웅덩이 한 칸: 세로 물길 위쪽 끝의 위 절반 + 아래쪽 끝의 아래 절반
{
  const top = await sharp(find(WATER)).extract({ left: 48, top: 96, width: 16, height: 8 }).png().toBuffer();
  const bottom = await sharp(find(WATER)).extract({ left: 48, top: 136, width: 16, height: 8 }).png().toBuffer();
  if (x + 16 > SHEET_W) { x = 0; y += rowH; rowH = 0; }
  layers.push({ input: top, left: x, top: y }, { input: bottom, left: x, top: y + 8 });
  atlas.w_one = [x, y, 16, 16];
  x += 16; rowH = Math.max(rowH, 16);
}
const height = y + rowH;
const root = process.cwd();
mkdirSync(path.join(root, 'public', 'assets', 'village'), { recursive: true });
await sharp({ create: { width: SHEET_W, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(layers).png({ compressionLevel: 9, palette: true }).toFile(path.join(root, 'public', 'assets', 'village', 'village.png'));
writeFileSync(path.join(root, 'lib', 'data', 'village-atlas.json'), JSON.stringify({ width: SHEET_W, height, pieces: atlas }) + '\n');
console.log(`✅ 마을 타일 ${Object.keys(atlas).length}조각 → public/assets/village/village.png (${SHEET_W}×${height})`);
