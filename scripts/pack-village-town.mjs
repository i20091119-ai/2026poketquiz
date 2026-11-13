// 포켓몬 마을 바닥·나무·집 그림을 한 장으로 묶습니다 (2026-11-13, 부모님이 고른 "위에서 본 도트 마을").
// 그림 출처: Tuxemon 게임의 무료 타일 (CC BY-SA 4.0 등, 그린 사람은 public/assets/village/LICENSE.txt).
// 다시 만들 때: node scripts/pack-village-town.mjs <Tuxemon 저장소의 mods/tuxemon/gfx/tilesets 폴더>
// 결과: public/assets/village/town.png (한 장) + lib/data/village-town.json (조각 이름 → [x, y, 가로, 세로]), 둘 다 git에 포함.
// 원본 묶음은 git에 넣지 않습니다.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const sharp = createRequire(import.meta.url)('sharp');
const dir = process.argv[2];
if (!dir || !existsSync(path.join(dir, 'core_outdoor.png'))) {
  console.error('사용법: node scripts/pack-village-town.mjs <Tuxemon mods/tuxemon/gfx/tilesets 폴더>');
  process.exit(1);
}
const OUT = 'core_outdoor.png', WATER = 'core_outdoor_water.png', NATURE = 'core_outdoor_nature.png', BUILD = 'core_buildings.png';
/** [이름, 파일, x, y, 가로, 세로] (원본 그림의 점 단위) */
const P = (name, file, x, y, w = 16, h = 16) => ({ name, file, rect: [x, y, w, h] });
const pieces = [
  // 바닥: 풀 한 칸, 흙(8점 조각 4×4 묶음), 흙 안쪽 모서리 묶음, 연못 테두리(48×48), 물 한 칸
  P('grass', OUT, 8, 536),
  P('sand', OUT, 88, 56, 32, 32),
  P('sandIn', OUT, 96, 96, 32, 32),
  P('rim', WATER, 96, 16, 48, 48),
  P('water', WATER, 144, 16),
  // 나무·집
  P('treeRound', NATURE, 801, 8, 30, 38),
  P('treePine', NATURE, 705, 4, 30, 42),
  P('house', BUILD, 194, 310, 76, 90),
  // 꾸밈·만든 물건
  P('bush', OUT, 400, 528), P('bushRose', OUT, 384, 528),
  P('flowerRed', OUT, 448, 448), P('flowerYellow', OUT, 464, 448), P('flowerWhite', OUT, 432, 448),
  P('flowerPink', OUT, 464, 384), P('flowerBlue', OUT, 480, 384), P('flowerOrange', OUT, 448, 400),
  P('mushroom', OUT, 464, 464), P('mushroomBrown', OUT, 448, 464),
  P('rock', OUT, 464, 480), P('lily', OUT, 384, 480), P('stump', OUT, 464, 528),
];

const SHEET_W = 192;
let x = 0, y = 0, rowH = 0;
const layers = [];
const atlas = {};
for (const p of pieces) {
  const [sx, sy, w, h] = p.rect;
  if (x + w > SHEET_W) { x = 0; y += rowH; rowH = 0; }
  const input = await sharp(path.join(dir, p.file)).extract({ left: sx, top: sy, width: w, height: h }).png().toBuffer();
  layers.push({ input, left: x, top: y });
  atlas[p.name] = [x, y, w, h];
  x += w; rowH = Math.max(rowH, h);
}
const height = y + rowH;
const root = process.cwd();
mkdirSync(path.join(root, 'public', 'assets', 'village'), { recursive: true });
await sharp({ create: { width: SHEET_W, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(layers).png({ compressionLevel: 9 }).toFile(path.join(root, 'public', 'assets', 'village', 'town.png'));
writeFileSync(path.join(root, 'lib', 'data', 'village-town.json'), JSON.stringify({ width: SHEET_W, height, pieces: atlas }) + '\n');
console.log(`✅ 마을 그림 ${Object.keys(atlas).length}조각 → public/assets/village/town.png (${SHEET_W}×${height})`);
