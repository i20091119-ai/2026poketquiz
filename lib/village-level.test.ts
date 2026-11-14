import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SUBJECTS, SUBJECT_TYPES } from './game-config.ts';
import { applyAction, childView, ensureDaily, initialState, simVillageCraft, villageLevel, villageStars, type ActiveBank, type Context, type GameState, type Question } from './game-engine.ts';
import { GROUND_ROWS } from './village-map.ts';
import { decorSpotProblem } from './village-decor.ts';
import { GATHER_ROCKS, setCraftRules, TREE_SPOTS, treeSpotsOpen } from './village-craft.ts';
import { isOpenCell, levelAt, levelOfStars, MAX_LEVEL, REGIONS } from './village-level.ts';
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

test('구역은 지도를 빈틈·겹침 없이 나누고, 처음 마을(12×20)은 예전 지도 그대로', () => {
  const seen = new Set<string>();
  for (const r of REGIONS) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    assert.ok(!seen.has(`${x},${y}`), `겹침 ${x},${y}`);
    seen.add(`${x},${y}`);
  }
  assert.equal(seen.size, MAP_W * MAP_H);
  const old = ['............', '............', '............', '............', '.....==.....', '.ss..==..ss.', '.ss..==..ss.', '.....==.....', '============', '.....==.....',
    '.....==.....', '.....==.....', '.....==.....', '.....==.ss..', '.....==.ss..', '.~~~.==.....', '.~~~.==.....', '.~~~.==.....', '.....==.....', '.....==.....'];
  old.forEach((row, y) => assert.equal(GROUND_ROWS[y].slice(-MAP_X0, -MAP_X0 + 12), row, `처음 마을 ${y}줄이 바뀜`));
  // 처음 마을은 위쪽 가운데 (왼쪽·오른쪽에 같은 폭)
  assert.equal(-MAP_X0, MAP_W - 12 + MAP_X0);
  REGIONS.forEach((r, i) => assert.equal(r.level, i + 1));
});

test('새 밭·나무 자리·바위·줍는 자리는 넓어진 구역에 하나씩, 처음 것들은 레벨 1 구역', () => {
  assert.deepEqual(PLOTS.slice(0, 3).map(p => levelAt(p.x, p.y)), [1, 1, 1]);
  assert.deepEqual(PLOTS.slice(3).map(p => levelAt(p.x, p.y)), [2, 3, 4, 5]);
  assert.deepEqual(TREE_SPOTS.slice(3).map(p => levelAt(p.x, p.y)), [2, 3, 4, 5]);
  assert.ok(PICK_SPOTS.slice(0, 10).every(p => levelAt(p.x, p.y) === 1));
  assert.ok(GATHER_ROCKS.slice(0, 3).every(p => levelAt(p.x, p.y) === 1));
  for (let level = 2; level <= MAX_LEVEL; level++) assert.ok(PICK_SPOTS.some(p => levelAt(p.x, p.y) === level), `레벨 ${level} 줍는 자리 없음`);
  // 레벨 1이면 줍는 자리는 예전 10곳 안에서만
  for (const d of ['2026-11-14', '2026-11-15', '2026-12-01']) assert.ok(dayPickups(d, 3, 1).every(p => p.spot < 10));
  assert.deepEqual(treeSpotsOpen(1), [0, 1, 2]);
  assert.deepEqual(treeSpotsOpen(4), [0, 1, 2, 3, 4, 5]);
});

test('별 → 레벨: 50 · +120 · +200 · +300 · +400, 최고 6', () => {
  assert.equal(MAX_LEVEL, 6);
  const needs = [50, 120, 200, 300, 400];
  assert.deepEqual(levelOfStars(0, needs), { level: 1, into: 0, next: 50 });
  assert.deepEqual(levelOfStars(49, needs), { level: 1, into: 49, next: 50 });
  assert.deepEqual(levelOfStars(50, needs), { level: 2, into: 0, next: 120 });
  assert.deepEqual(levelOfStars(170, needs), { level: 3, into: 0, next: 200 });
  assert.equal(levelOfStars(669, needs).level, 4);
  assert.equal(levelOfStars(1069, needs).level, 5);
  assert.deepEqual(levelOfStars(9999, needs), { level: 6, into: 9999 - 1070, next: null });
});

test('안 열린 땅: 꾸미기·밭·나무·바위 막힘, 레벨이 오르면 열림', () => {
  const { state, bank } = ready();
  const v = state.village!;
  v.stars = 0;
  assert.equal(villageLevel(state), 1);
  assert.match(decorSpotProblem([], [], 'flower', 'flowerRed', 14, 6, 1) ?? '', /레벨 2에 열려/);
  assert.equal(decorSpotProblem([], [], 'flower', 'flowerRed', 14, 6, 2), null);
  v.decorBag = { flower: 2 };
  assert.throws(() => applyAction(state, { type: 'decorPlace', item: 'flower', x: 14, y: 6, stay: true }, ctx(bank)), /레벨 2에 열려/);
  v.items = { bush: 1 };
  assert.throws(() => applyAction(state, { type: 'villagePlace', cell: 12, item: 'bush', stay: true }, ctx(bank)), /레벨 2에 열려/);
  assert.throws(() => applyAction(state, { type: 'villageGather', rock: 3, stay: true }, ctx(bank)), /레벨 2에 열려/);
  v.saplings = 1;
  assert.throws(() => applyAction(state, { type: 'villagePlant', spot: 3, berry: 'apple', stay: true }, ctx(bank)), /레벨 2에 열려/);
  // 레벨 2로
  simVillageCraft(state, 'levelUp', null, TODAY);
  assert.equal(villageLevel(state), 2);
  applyAction(state, { type: 'decorPlace', item: 'flower', x: 14, y: 6, stay: true }, ctx(bank));
  applyAction(state, { type: 'villagePlace', cell: 12, item: 'bush', stay: true }, ctx(bank));
  applyAction(state, { type: 'villagePlant', spot: 3, berry: 'apple', stay: true }, ctx(bank));
  assert.equal(childView(state, bank, TODAY).village.craft.treeMax, 4);
  // 레벨 3 구역은 아직
  assert.throws(() => applyAction(state, { type: 'villagePlace', cell: 16, item: 'bush', stay: true }, ctx(bank)), /레벨 3에 열려/);
  // 축하 팝업: 본 레벨 1 → 2
  const lv = childView(state, bank, TODAY).village.level;
  assert.equal(lv.level, 2);
  assert.equal(lv.seen, 1);
  assert.deepEqual(lv.regions.filter(r => r.open).map(r => r.name), ['처음 마을', '오른쪽 풀밭']);
  applyAction(state, { type: 'villageLevelSeen' }, ctx(bank));
  assert.equal(childView(state, bank, TODAY).village.level.seen, 2);
  assert.ok(isOpenCell(15, 4, 2) && !isOpenCell(2, 22, 2) && !isOpenCell(-3, 5, 2));
  // 레벨 3 = 왼쪽 숲 (x가 음수)
  simVillageCraft(state, 'levelUp', null, TODAY);
  assert.equal(decorSpotProblem([], [], 'flower', 'flowerRed', -4, 9, 3), null);
  applyAction(state, { type: 'decorPlace', item: 'flower', x: -4, y: 9, stay: true }, ctx(bank));
  assert.ok(state.village!.decor!.some(d => d.x === -4 && d.y === 9));
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
