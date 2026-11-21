// 마을 지도(칸 단위 기록)와 그림 목록이 서로 맞는지 검사 (2026-11-13)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import assets from './data/village-assets.json' with { type: 'json' };
import { autotileQuarters, baseGround, blockedCells, GROUND_LEGEND, GROUND_ROWS, groundAt, MAP_OBJECTS, objectInfo, plotCellAt } from './village-map.ts';
import { CELL_COUNT, cellPos, MAP_H, MAP_W, PICK_SPOTS, PLOTS, START_POS } from './village.ts';

test('땅 층은 MAP_W × MAP_H 칸이고 아는 글자만 씀', () => {
  assert.equal(GROUND_ROWS.length, MAP_H);
  for (const row of GROUND_ROWS) {
    assert.equal(row.length, MAP_W);
    for (const ch of row) assert.ok(ch in GROUND_LEGEND, `모르는 땅 글자: ${ch}`);
  }
});

test('밭 칸은 모두 밭(soil)이고 칸 번호가 cellPos와 맞음', () => {
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const p = cellPos(cell);
    assert.equal(baseGround(p.x, p.y), 'soil');
    assert.equal(plotCellAt(p.x, p.y), cell);
  }
  const soil = GROUND_ROWS.join('').split('').filter(c => c === 's').length;
  assert.equal(soil, PLOTS.length * 4, '밭이 아닌 곳에 s가 있음');
});

test('처음 자리·재료 줍는 자리는 걸을 수 있음', () => {
  const blocked = blockedCells();
  for (const p of [START_POS, ...PICK_SPOTS]) {
    assert.ok(!blocked.has(`${p.x},${p.y}`), `막힌 자리: ${p.x},${p.y}`);
    assert.notEqual(baseGround(p.x, p.y), 'water');
  }
});

test('밭에 놓은 물웅덩이는 물 땅이 됨', () => {
  const cells = Array(CELL_COUNT).fill(null);
  cells[0] = 'puddle';
  const p = cellPos(0);
  assert.equal(groundAt(p.x, p.y, cells), 'water');
  assert.equal(groundAt(p.x + 1, p.y, cells), 'soil');
});

test('모든 그림은 16px 배수, 물건 그림 크기 = 칸 × 16, 밟는 칸은 그림 안', () => {
  assert.equal(assets.tile, 16);
  for (const [name, g] of Object.entries(assets.ground)) for (const n of g.rect) assert.equal(n % 16, 0, name);
  for (const [name, o] of Object.entries(assets.objects)) {
    assert.equal(o.rect[2], o.cells[0] * 16, name);
    assert.equal(o.rect[3], o.cells[1] * 16, name);
    if (o.foot) assert.ok(o.foot[0] + o.foot[2] <= o.cells[0] && o.foot[1] + o.foot[3] <= o.cells[1], name);
    assert.ok(o.source in assets.sources, `${name}: 출처 없음`);
  }
  for (const g of Object.values(assets.ground)) assert.ok(g.source in assets.sources);
});

test('지도 물건은 그림 목록에 있고, 막힌 칸이 길·밭·물 위에 없음', () => {
  for (const o of MAP_OBJECTS) {
    const f = objectInfo(o.kind).foot;
    if (!f) continue;
    for (let dy = 0; dy < f[3]; dy++) for (let dx = 0; dx < f[2]; dx++) {
      const x: number = o.x + f[0] + dx, y: number = o.y + f[1] + dy;
      if (y < 0) continue;
      assert.equal(baseGround(x, y), 'grass', `${o.kind} 막힌 칸 ${x},${y}`);
    }
  }
});

test('오토타일: 어떤 모양이든 칸마다 8px 조각 4개, 그림판 안', () => {
  const shapes = [
    (x: number, y: number) => x === 0 && y === 0, // 한 칸
    (x: number, y: number) => y === 0 && x >= 0 && x < 3, // 가로 줄
    (x: number, y: number) => (x === 0 && y >= 0 && y < 3) || (y === 2 && x >= 0 && x < 3), // ㄴ 자
    (x: number, y: number) => x >= 0 && x < 3 && y >= 0 && y < 3 && !(x === 2 && y === 0), // 안쪽 모서리 있는 모양
  ];
  for (const kind of ['path', 'water'] as const) for (const same of shapes) {
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
      if (!same(x, y)) continue;
      const q = autotileQuarters(kind, same, x, y);
      assert.equal(q.length, 4);
      for (const [sx, sy] of q) assert.ok(sx >= 0 && sy >= 0 && sx + 8 <= assets.sheets.ground.width && sy + 8 <= assets.sheets.ground.height);
    }
  }
});
