import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SUBJECTS, SUBJECT_TYPES } from './game-config.ts';
import { applyAction, childView, ensureDaily, initialState, simVillageCraft, villageKeys, villageLevel, villageOpen, villageStars, type ActiveBank, type Context, type GameState, type Question } from './game-engine.ts';
import { GROUND_ROWS } from './village-map.ts';
import { decorSpotProblem } from './village-decor.ts';
import { GATHER_ROCKS, levelNeeds, setCraftRules, TREE_SPOTS, treeSpotsOpen } from './village-craft.ts';
import { choosableRegions, isOpenCell, levelOfStars, MAX_LEVEL, regionAt, REGIONS } from './village-level.ts';
import { dayPickups, MAP_H, MAP_W, MAP_X0, PICK_SPOTS, PLOTS, setVillageRules } from './village.ts';

const TODAY = '2026-11-14';
function seeded(seed = 1) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function makeBank(): ActiveBank {
  let id = 1;
  const questions: Question[] = SUBJECTS.flatMap(subject => Array.from({ length: 3 }, (_, i) => ({
    id: id++, subject, type: SUBJECT_TYPES[subject][i % 3], prompt: `${subject} ${i}`, choices: ['a', 'b', 'c', 'd', 'e'], answer: 0, explanation: '해설', area: '영역',
  })));
  return { id: 7, title: '테스트', questions };
}
const ctx = (bank: ActiveBank, today = TODAY): Context => ({ bank, today, now: today + 'T01:00:00Z', random: seeded() });
function ready(): { state: GameState; bank: ActiveBank } {
  setCraftRules(null); setVillageRules(null);
  const bank = makeBank();
  const state = initialState();
  applyAction(state, { type: 'starter', species: 906 }, ctx(bank));
  ensureDaily(state, bank, TODAY, seeded());
  for (const id of state.daily!.questionIds) applyAction(state, { type: 'answer', mode: 'daily', questionId: id, choice: 0 }, ctx(bank));
  applyAction(state, { type: 'villageEnter' }, ctx(bank));
  return { state, bank };
}

test('구역은 지도를 빈틈·겹침 없이 나누고(5×3), 처음 마을(12×20)은 위쪽 가운데에 예전 지도 그대로', () => {
  const seen = new Set<string>();
  for (const r of REGIONS) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    assert.ok(!seen.has(`${x},${y}`), `겹침 ${x},${y}`);
    seen.add(`${x},${y}`);
  }
  assert.equal(seen.size, MAP_W * MAP_H);
  assert.equal(REGIONS.length, 15);
  const home = REGIONS.find(r => r.id === 'C1')!;
  assert.deepEqual([home.x, home.y, home.w, home.h], [0, 0, 12, 20]);
  assert.equal(-MAP_X0, MAP_X0 + MAP_W - 12, '처음 마을 왼쪽·오른쪽 폭이 같음');
  const old = ['............', '............', '............', '............', '.....==.....', '.ss..==..ss.', '.ss..==..ss.', '.....==.....', '============', '.....==.....',
    '.....==.....', '.....==.....', '.....==.....', '.....==.ss..', '.....==.ss..', '.~~~.==.....', '.~~~.==.....', '.~~~.==.....', '.....==.....', '.....==.....'];
  old.forEach((row, y) => assert.equal(GROUND_ROWS[y].slice(-MAP_X0, -MAP_X0 + 12), row, `처음 마을 ${y}줄이 바뀜`));
});

test('새 구역마다 줍는 자리·바위가 있고, 처음 마을 자리는 그대로', () => {
  const at = (p: { x: number; y: number }) => regionAt(p.x, p.y)!.id;
  assert.deepEqual(PLOTS.slice(0, 3).map(at), ['C1', 'C1', 'C1']);
  assert.ok(PICK_SPOTS.slice(0, 10).every(p => at(p) === 'C1'));
  assert.ok(GATHER_ROCKS.slice(0, 3).every(p => at(p) === 'C1'));
  assert.ok(TREE_SPOTS.slice(0, 3).every(p => at(p) === 'C1'));
  for (const r of REGIONS.filter(q => q.id !== 'C1')) {
    assert.ok(PICK_SPOTS.some(p => at(p) === r.id), `${r.name}: 줍는 자리 없음`);
    assert.ok(GATHER_ROCKS.some(p => at(p) === r.id), `${r.name}: 바위 없음`);
  }
  for (const p of [...PLOTS, ...TREE_SPOTS, ...PICK_SPOTS, ...GATHER_ROCKS]) assert.ok(regionAt(p.x, p.y), `지도 밖 ${p.x},${p.y}`);
  // 처음 마을만 열려 있으면 줍는 자리는 예전 10곳 안에서만
  for (const d of ['2026-11-14', '2026-11-15', '2026-12-01']) assert.ok(dayPickups(d, 3).every(p => p.spot < 10));
  assert.deepEqual(treeSpotsOpen(['C1']), [0, 1, 2]);
  assert.deepEqual(treeSpotsOpen(['C1', 'D1', 'B1']), [0, 1, 2, 3, 4]);
});

test('열 수 있는 땅 = 열린 땅에 붙은 곳 (왼쪽·오른쪽·아래), 열수록 바깥으로', () => {
  const ids = (open: string[]) => choosableRegions(open).map(r => `${r.id}:${r.dir}`).sort();
  assert.deepEqual(ids(['C1']), ['B1:left', 'C2:down', 'D1:right']);
  assert.deepEqual(ids(['C1', 'B1']), ['A1:left', 'B2:down', 'C2:down', 'D1:right']);
  assert.deepEqual(ids(['C1', 'C2']), ['B1:left', 'B2:left', 'C3:down', 'D1:right', 'D2:right']);
  assert.deepEqual(ids(REGIONS.map(r => r.id)), []);
});

test('별 → 레벨: 50 · 120 · 160 · 200 … (레벨마다 40씩 더), 최고 15', () => {
  setCraftRules(null);
  assert.equal(MAX_LEVEL, 15);
  const needs = levelNeeds();
  assert.deepEqual(needs.slice(0, 4), [50, 120, 160, 200]);
  assert.equal(needs.length, 14);
  assert.deepEqual(levelOfStars(0, needs), { level: 1, into: 0, next: 50 });
  assert.deepEqual(levelOfStars(50, needs), { level: 2, into: 0, next: 120 });
  assert.deepEqual(levelOfStars(170, needs), { level: 3, into: 0, next: 160 });
  const all = needs.reduce((a, b) => a + b, 0);
  assert.deepEqual(levelOfStars(all + 5, needs), { level: 15, into: 5, next: null });
});

test('열쇠: 레벨이 오르면 1개 → 아이가 붙은 땅 하나를 골라 엶, 잠긴 땅은 막힘', () => {
  const { state, bank } = ready();
  const v = state.village!;
  v.stars = 0;
  assert.equal(villageKeys(state), 0);
  assert.match(decorSpotProblem([], [], 'flower', 'flowerRed', 14, 6) ?? '', /오른쪽 풀밭은 아직 잠겨/);
  v.decorBag = { flower: 2 };
  assert.throws(() => applyAction(state, { type: 'decorPlace', item: 'flower', x: 14, y: 6, stay: true }, ctx(bank)), /잠겨/);
  assert.throws(() => applyAction(state, { type: 'villageUnlock', region: 'D1' }, ctx(bank)), /열쇠가 없어/);
  // 레벨 2 → 열쇠 1개
  simVillageCraft(state, 'levelUp', null, TODAY);
  assert.equal(villageLevel(state), 2);
  assert.equal(villageKeys(state), 1);
  assert.equal(childView(state, bank, TODAY).village.level.keys, 1);
  // 붙어 있지 않은 땅은 못 엶
  assert.throws(() => applyAction(state, { type: 'villageUnlock', region: 'A1' }, ctx(bank)), /바로 옆/);
  // 왼쪽 숲을 고름 → 오른쪽은 아직 잠김
  applyAction(state, { type: 'villageUnlock', region: 'B1' }, ctx(bank));
  assert.deepEqual(villageOpen(state), ['C1', 'B1']);
  assert.equal(villageKeys(state), 0);
  assert.throws(() => applyAction(state, { type: 'decorPlace', item: 'flower', x: 14, y: 6, stay: true }, ctx(bank)), /잠겨/);
  applyAction(state, { type: 'decorPlace', item: 'flower', x: -4, y: 9, stay: true }, ctx(bank));
  v.items = { bush: 1 };
  applyAction(state, { type: 'villagePlace', cell: 16, item: 'bush', stay: true }, ctx(bank)); // 밭 4 = 왼쪽 숲
  assert.throws(() => applyAction(state, { type: 'villagePlace', cell: 12, item: 'bush', stay: true }, ctx(bank)), /잠겨/); // 밭 3 = 오른쪽 풀밭
  assert.equal(childView(state, bank, TODAY).village.craft.treeMax, 4);
  assert.throws(() => applyAction(state, { type: 'villageUnlock', region: 'D1' }, ctx(bank)), /열쇠가 없어/);
  // 레벨 3 → 이제 꽃 들판(A1)도 고를 수 있음
  simVillageCraft(state, 'levelUp', null, TODAY);
  const lv = childView(state, bank, TODAY).village.level;
  assert.deepEqual(lv.regions.filter(r => r.status === 'choose').map(r => r.id).sort(), ['A1', 'B2', 'C2', 'D1']);
  applyAction(state, { type: 'villageUnlock', region: 'A1' }, ctx(bank));
  assert.throws(() => applyAction(state, { type: 'villageUnlock', region: 'A1' }, ctx(bank)), /열쇠가 없어|이미/);
  assert.ok(isOpenCell(-12, 5, villageOpen(state)));
  // 모르는 땅 이름은 무시하고 읽음
  v.opened!.push('Z9');
  assert.deepEqual(villageOpen(state), ['C1', 'B1', 'A1']);
});

test('별은 마을에서 한 일로: 만들기·열매 따기·볼 만들기, 손님 온 날은 하루 한 번', () => {
  const { state, bank } = ready();
  const v = state.village!;
  const s0 = villageStars(state);
  v.mats = { leaf: 10 };
  applyAction(state, { type: 'villageCraft', item: 'bush', stay: true }, ctx(bank));
  assert.equal(villageStars(state), s0 + 1);
  applyAction(state, { type: 'villageHarvest', spot: 0, stay: true }, ctx(bank));
  assert.equal(villageStars(state), s0 + 2);
  for (let i = 0; i < 10; i++) state.potions.push({ id: 'b' + i, kind: 'apple' });
  v.mats.stone = 3;
  applyAction(state, { type: 'villageMake', recipe: 'poke', berry: 'apple', stay: true }, ctx(bank));
  assert.equal(villageStars(state), s0 + 4);
  // 손님 2마리가 온 날: 처음 들어가면 손님마다 서식지 별 2 + 새 손님 별 3, 다시 들어가도 또 주지 않음
  v.guests = { date: TODAY, list: [{ plot: 0, species: 1, habitat: 'green' }, { plot: 1, species: 7, habitat: 'shore' }] };
  v.guestStarDate = undefined;
  applyAction(state, { type: 'villageEnter' }, ctx(bank));
  assert.equal(villageStars(state), s0 + 4 + 2 * 2 + 2 * 3);
  applyAction(state, { type: 'villageEnter' }, ctx(bank));
  assert.equal(villageStars(state), s0 + 4 + 2 * 2 + 2 * 3);
});

test('예전 마을 기록: 별이 없으면 지금까지 한 일(손님·서식지·꾸미기·땅·제작)로 한 번 계산', () => {
  const state = initialState();
  state.met = [1, 4, 7];
  state.village = {
    mats: {}, items: {}, cells: [], habitats: [{ kind: 'green', since: '2026-11-13' }, null, null],
    decor: [{ item: 'flower', kind: 'flowerRed', x: 3, y: 9 }], terrain: [{ x: 3, y: 10, ground: 'stone' }],
  } as unknown as GameState['village'];
  // 3손님×3 + 서식지 1×2 + (꾸미기 1 + 땅 1)×1 = 13
  assert.equal(villageStars(state), 13);
  assert.equal(villageLevel(state), 1);
});
