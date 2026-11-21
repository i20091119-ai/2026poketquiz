// 지도 v2 (2026-11-21 부모님: 처음 마을을 넓혀 서준이 집 옆에 하준이 집). 예전 기록이 그대로 이어지는지
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialState, VILLAGE_MAP_VERSION, widenVillageMap, type GameState } from './game-engine.ts';
import { blockedCells, GROUND_ROWS, MAP_OBJECTS, groundAt } from './village-map.ts';
import { decorSpotProblem } from './village-decor.ts';
import { regionAt } from './village-level.ts';
import { GATHER_ROCKS, TREE_SPOTS } from './village-craft.ts';
import { MAP_W, PICK_SPOTS, PLOTS } from './village.ts';

function oldVillage(): GameState {
  const s = initialState();
  s.village = {
    mats: {}, items: {}, cells: [], habitats: [],
    decorBag: { flower: 1 },
    decor: [
      { item: 'flower', kind: 'flowerRed', x: 3, y: 10 }, // 처음 마을 = 그대로
      { item: 'bench', kind: 'bench', x: 13, y: 6 }, // 예전 오른쪽 풀밭 = +8
      { item: 'fence', kind: 'fenceT', x: 10, y: 2 }, // 하준이 집 터 = 가방으로
      { item: 'flower', kind: 'flowerPink', x: -5, y: 9 }, // 왼쪽 숲 = 그대로
    ],
    terrain: [{ x: 11, y: 3, ground: 'stone' }, { x: 15, y: 8, ground: 'water' }, { x: 2, y: 11, ground: 'path' }],
  } as GameState['village'];
  return s;
}

test('지도 v2: 예전 기록의 오른쪽 자리는 +8, 하준이 집 터에 있던 것은 가방으로, 지운 것 없음, 한 번만', () => {
  const s = oldVillage();
  const before = s.village!.decor!.length + s.village!.terrain!.length + Object.values(s.village!.decorBag!).reduce((a, b) => a + (b ?? 0), 0);
  assert.equal(widenVillageMap(s), true);
  const v = s.village!;
  assert.deepEqual(v.decor!.map(d => [d.item, d.x, d.y]), [['flower', 3, 10], ['bench', 21, 6], ['flower', -5, 9]]);
  assert.deepEqual(v.terrain!.map(t => [t.ground, t.x, t.y]), [['water', 23, 8], ['path', 2, 11]]);
  assert.deepEqual(v.decorBag, { flower: 1, fence: 1, stoneTile: 1 });
  const after = v.decor!.length + v.terrain!.length + Object.values(v.decorBag!).reduce((a, b) => a + (b ?? 0), 0);
  assert.equal(after, before, '물건 수가 그대로 (놓인 것 + 가방)');
  assert.equal(v.mapV, VILLAGE_MAP_VERSION);
  // 두 번 해도 다시 밀리지 않음
  assert.equal(widenVillageMap(s), false);
  assert.equal(v.decor![1].x, 21);
});

test('지도 v2: 새로 시작한 마을·마을이 없는 기록은 옮길 것 없음', () => {
  const s = initialState();
  assert.equal(widenVillageMap(s), false);
  assert.equal(s.village, undefined);
});

test('지도 v2: 처음 마을 20칸 가운데 두 집, 하준이 집 터는 못 지나가고 못 놓음, 문 앞 길', () => {
  assert.equal(MAP_W, 52);
  const hj = MAP_OBJECTS.find(o => o.kind === 'houseHajun')!;
  const sj = MAP_OBJECTS.find(o => o.kind === 'house')!;
  assert.deepEqual([sj.x, hj.x], [4, 10]);
  assert.equal(regionAt(12, 5)!.id, 'C1');
  assert.equal(regionAt(20, 5)!.id, 'D1');
  const blocked = blockedCells();
  for (const [x, y] of [[10, 1], [14, 3], [12, 2]]) assert.ok(blocked.has(`${x},${y}`), `하준이 집 ${x},${y} 막힘`);
  assert.ok(decorSpotProblem([], [], 'flower', 'flowerRed', 12, 2));
  for (let y = 4; y <= 7; y++) for (const x of [11, 12]) assert.equal(groundAt(x, y), 'path', `문 앞 길 ${x},${y}`);
  assert.equal(GROUND_ROWS[8].replace(/^\.+|\.+$/g, '').replace(/=/g, ''), '', '가로 길이 끊기지 않음');
  // 줍기·바위·밭·나무 자리가 막힌 칸이 아님 (열린 처음 마을 것만 검사)
  for (const p of [...PICK_SPOTS, ...GATHER_ROCKS.filter((_, i) => i !== 0)]) if (regionAt(p.x, p.y)?.id === 'C1' && !GATHER_ROCKS.includes(p)) assert.ok(!blocked.has(`${p.x},${p.y}`), `줍는 자리 ${p.x},${p.y}`);
  for (const p of PLOTS) assert.equal(groundAt(p.x, p.y), 'soil', `밭 ${p.x},${p.y}`);
  for (const t of TREE_SPOTS) assert.ok(regionAt(t.x, t.y), `나무 자리 ${t.x},${t.y}`);
});
