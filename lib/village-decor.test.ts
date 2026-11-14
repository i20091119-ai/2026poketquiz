// 마을 꾸미기 (2026-11-14): 만들기·놓기·치우기 규칙, 놓을 수 있는 곳, 울타리 모양, 예전 기록
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyAction, childView, GameError, initialState, type Context, type GameState } from './game-engine.ts';
import { cleanDecorCosts, DECOR_INFO, DECOR_ITEMS, decorCost, decorSpotProblem, fenceKind, setDecorCosts, type DecorPlaced } from './village-decor.ts';
import { baseGround, objectInfo } from './village-map.ts';
import { MAP_H, MAP_W, PICK_SPOTS, setVillageRules, START_POS } from './village.ts';
import assets from './data/village-assets.json' with { type: 'json' };

const TODAY = '2026-11-14';
const ctx = (): Context => ({ bank: null, today: TODAY, now: TODAY + 'T01:00:00Z', random: () => 0.5 });
/** 오늘 미션을 끝낸(마을이 열린) 기록 */
function openVillage(mats = 10): GameState {
  const state = initialState();
  state.owned = [{ uid: 'p1', species: 906, obtainedAt: TODAY }];
  state.partner = 'p1';
  state.daily = { date: TODAY, bankId: 0, questionIds: [1], correct: [1], wrong: [], tries: {}, box: null, claimed: true };
  state.village = { mats: { leaf: mats, drop: mats, petal: mats, twig: mats }, items: {}, cells: [], habitats: [] };
  return state;
}
const throws = (fn: () => unknown, re: RegExp) => assert.throws(fn, (e: unknown) => e instanceof GameError && re.test(e.message));

test('꾸미기 물건 11가지: 그림이 그림 목록에 있고 재료가 있음', () => {
  assert.equal(DECOR_ITEMS.length, 11);
  for (const k of DECOR_ITEMS) {
    for (const v of DECOR_INFO[k].variants) assert.ok(v in assets.objects, `${k}: 그림 ${v} 없음`);
    assert.ok(Object.values(DECOR_INFO[k].cost).some(n => (n ?? 0) > 0), `${k}: 재료 없음`);
  }
});

test('만들기 → 가방 → 놓기 → 다시 가방 (재료가 줄고, 놓은 자리는 기록에 남음)', () => {
  setVillageRules(null); setDecorCosts(null);
  const state = openVillage();
  applyAction(state, { type: 'decorCraft', item: 'bench' }, ctx());
  assert.equal(state.village!.mats.twig, 6);
  assert.equal(state.village!.decorBag!.bench, 1);
  const spot = { x: 2, y: 8 + 1 }; // 가로 길 바로 아래 풀밭
  assert.equal(baseGround(spot.x, spot.y), 'grass');
  applyAction(state, { type: 'decorPlace', item: 'bench', x: 8, y: 11 }, ctx());
  assert.equal(state.village!.decor!.length, 1);
  assert.equal(state.village!.decorBag!.bench, 0);
  const view = childView(state, null, TODAY);
  assert.equal(view.village.decor.length, 1);
  applyAction(state, { type: 'decorTake', x: 9, y: 11 }, ctx()); // 벤치 오른쪽 칸을 눌러도 됨
  assert.equal(state.village!.decor!.length, 0);
  assert.equal(state.village!.decorBag!.bench, 1);
});

test('재료가 모자라면, 가방에 없으면, 마을이 닫혀 있으면 안 됨', () => {
  setDecorCosts(null);
  const state = openVillage(1);
  throws(() => applyAction(state, { type: 'decorCraft', item: 'bench' }, ctx()), /나뭇가지.*3개 더/);
  throws(() => applyAction(state, { type: 'decorPlace', item: 'flower', x: 8, y: 11 }, ctx()), /가방에 없어요/);
  state.daily = null;
  throws(() => applyAction(state, { type: 'decorCraft', item: 'flower' }, ctx()), /미션/);
});

test('놓을 수 있는 곳: 풀밭만, 길·밭·물·집·다른 물건·처음 자리·재료 자리는 안 됨, 연잎은 물 위만', () => {
  const none: DecorPlaced[] = [];
  assert.equal(decorSpotProblem(none, 'flower', 'flowerRed', 8, 11), null);
  assert.match(decorSpotProblem(none, 'flower', 'flowerRed', 5, 10) ?? '', /풀밭/); // 흙길
  assert.match(decorSpotProblem(none, 'flower', 'flowerRed', 1, 5) ?? '', /풀밭|밭/); // 밭
  assert.match(decorSpotProblem(none, 'flower', 'flowerRed', 2, 16) ?? '', /풀밭/); // 연못
  assert.ok(decorSpotProblem(none, 'flower', 'flowerRed', 5, 2)); // 집
  assert.ok(decorSpotProblem(none, 'flower', 'flowerRed', START_POS.x, START_POS.y));
  for (const p of PICK_SPOTS) assert.ok(decorSpotProblem(none, 'flower', 'flowerRed', p.x, p.y), `재료 자리 ${p.x},${p.y}`);
  assert.equal(decorSpotProblem(none, 'lily', 'lily', 1, 15), null);
  assert.match(decorSpotProblem(none, 'lily', 'lily', 8, 11) ?? '', /물 위/);
  const placed: DecorPlaced[] = [{ item: 'bench', kind: 'bench', x: 8, y: 11 }];
  assert.match(decorSpotProblem(placed, 'flower', 'flowerRed', 9, 11) ?? '', /이미/);
  assert.match(decorSpotProblem(none, 'bench', 'bench', MAP_W - 1, 14) ?? '', /밖/); // 2칸짜리가 지도 밖으로
  // 어디에도 놓을 곳이 있는지 (지도 전체에 풀밭 자리가 넉넉한지)
  let ok = 0;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (!decorSpotProblem(none, 'flower', 'flowerRed', x, y)) ok++;
  assert.ok(ok >= 60, `놓을 수 있는 칸 ${ok}`);
});

test('울타리는 이웃을 보고 모양이 이어짐', () => {
  const f = (x: number, y: number): DecorPlaced => ({ item: 'fence', kind: 'fenceT', x, y });
  const line = [f(1, 1), f(2, 1), f(3, 1)];
  assert.equal(fenceKind(line, 2, 1), 'fenceT');
  const corner = [f(1, 1), f(2, 1), f(1, 2)];
  assert.equal(fenceKind(corner, 1, 1), 'fenceTL');
  assert.equal(fenceKind([f(1, 1), f(1, 2)], 1, 2), 'fenceL');
  assert.equal(fenceKind([f(5, 5)], 5, 5), 'fencePost');
  for (const k of ['fenceT', 'fenceTL', 'fenceL', 'fencePost'] as const) assert.ok(objectInfo(k).foot, '울타리는 막힘');
});

test('보호자가 바꾼 재료 수: 0~20, 하나 이상은 1 이상인 것만 받음', () => {
  assert.deepEqual(cleanDecorCosts({ bench: { twig: 2 }, flower: { petal: 0 }, pot: { twig: 99 }, nope: { leaf: 1 } }), { bench: { twig: 2 } });
  setDecorCosts({ bench: { twig: 2 } });
  assert.deepEqual(decorCost('bench'), { twig: 2 });
  setDecorCosts(null);
  assert.deepEqual(decorCost('bench'), { twig: 4 });
});

test('예전 마을 기록(꾸미기 없음)도 그대로 열리고 빈 가방으로 보임', () => {
  const state = openVillage();
  delete state.village!.decor; delete state.village!.decorBag;
  const view = childView(state, null, TODAY);
  assert.deepEqual(view.village.decor, []);
  assert.equal(view.village.decorBag.flower, 0);
  assert.equal(state.village!.mats.leaf, 10, '보기만으로 기록이 바뀌지 않음');
});
