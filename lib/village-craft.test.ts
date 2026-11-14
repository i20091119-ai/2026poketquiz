import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setGrowthRules, SUBJECTS, SUBJECT_TYPES } from './game-config.ts';
import { applyAction, berryCapped, childView, ensureDaily, GameError, initialState, pickCraftedSpecies, setOfflineMark, syncOffline, syncVillage, type ActiveBank, type Context, type GameState, type Question } from './game-engine.ts';
import { offlineRulesOf } from './offline.ts';
import { CATCH_POOLS, species } from './pokedex.ts';
import { baseGround, blockedCells, MAP_OBJECTS, plotCellAt } from './village-map.ts';
import { decorSpotProblem } from './village-decor.ts';
import { BERRY_KINDS, berryOfType, CRAFT_DEFAULT, GATHER_ROCKS, ironForWeek, MAILBOX, recipeCost, setCraftRules, TREE_SPOTS, WORKBENCH } from './village-craft.ts';
import { setVillageRules } from './village.ts';
import { REGIONS } from './village-level.ts';

const TODAY = '2026-11-14';
const TOMORROW = '2026-11-15';
function seeded(seed = 1) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function makeBank(perSubject = 3): ActiveBank {
  let id = 1;
  const questions: Question[] = SUBJECTS.flatMap(subject => Array.from({ length: perSubject }, (_, i) => ({
    id: id++, subject, type: SUBJECT_TYPES[subject][i % 3], prompt: `${subject} ${i}`,
    choices: ['a', 'b', 'c', 'd', 'e'], answer: 0, explanation: '해설', area: '영역',
  })));
  return { id: 7, title: '테스트', questions };
}
const ctx = (bank: ActiveBank | null, today = TODAY, random = seeded()): Context => ({ bank, today, now: today + 'T01:00:00Z', random, offlineRules: offlineRulesOf() });
function started(bank: ActiveBank) {
  const state = initialState();
  applyAction(state, { type: 'starter', species: 906 }, ctx(bank)); // 나오하(풀) → 상식 열매
  return state;
}
function finishDaily(state: GameState, bank: ActiveBank, today = TODAY) {
  ensureDaily(state, bank, today, seeded());
  for (const id of state.daily!.questionIds) {
    const q = bank.questions.find(q => q.id === id)!;
    applyAction(state, { type: 'answer', mode: 'daily', questionId: id, choice: q.answer }, ctx(bank, today));
  }
}
const count = (state: GameState, kind: string) => (state.potions ?? []).filter(p => p.kind === kind).length;
function fill(state: GameState, kind: (typeof BERRY_KINDS)[number], n: number) {
  for (let i = 0; i < n; i++) (state.potions ??= []).push({ id: `t${kind}${state.potions!.length}`, kind });
}
function reset() { setCraftRules(null); setVillageRules(null); setGrowthRules(null); }

test('지도: 열매나무·제작대·우편함·바위 자리는 풀밭이고 서로 겹치지 않음, 나무 자리에는 꾸미기를 못 놓음', () => {
  const blocked = blockedCells(MAP_OBJECTS);
  for (const t of TREE_SPOTS) for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 3; dy++) {
    const x = t.x + dx, y = t.y + dy;
    assert.equal(baseGround(x, y), 'grass', `나무 자리 ${x},${y}`);
    assert.equal(plotCellAt(x, y), -1);
    if (dy > 0) assert.ok(!blocked.has(`${x},${y}`), `나무 밑동 자리가 막혀 있음 ${x},${y}`);
    assert.match(decorSpotProblem([], [], 'flower', 'flowerRed', x, y, REGIONS.map(r => r.id)) ?? '', /자리/);
  }
  assert.ok(MAP_OBJECTS.some(o => o.kind === 'workbench' && o.x === WORKBENCH.x && o.y === WORKBENCH.y));
  assert.ok(MAP_OBJECTS.some(o => o.kind === 'mailbox' && o.x === MAILBOX.x && o.y === MAILBOX.y));
  for (const r of GATHER_ROCKS) assert.ok(MAP_OBJECTS.some(o => o.kind === 'rock' && o.x === r.x && o.y === r.y), `바위 ${r.x},${r.y}`);
});

test('열매나무: 미션 전엔 못 따고, 끝내면 하루 1개, 다음 날 다시 열림 (첫 나무는 파트너 계열 열매)', () => {
  reset();
  const bank = makeBank();
  const state = started(bank);
  const berry = berryOfType(species(906).types[0]);
  assert.equal(childView(state, bank, TODAY).village.craft.trees[0].berry, berry);
  ensureDaily(state, bank, TODAY, seeded());
  assert.throws(() => applyAction(state, { type: 'villageHarvest', spot: 0 }, ctx(bank)), GameError);
  finishDaily(state, bank);
  const before = count(state, berry);
  applyAction(state, { type: 'villageHarvest', spot: 0 }, ctx(bank));
  assert.equal(count(state, berry), before + 1);
  assert.throws(() => applyAction(state, { type: 'villageHarvest', spot: 0 }, ctx(bank)), /오늘 다 땄어/);
  assert.equal(childView(state, bank, TODAY).village.craft.trees[0].ready, false);
  // 다음 날: 미션 전엔 잠김, 끝내면 또 1개 (어제 안 딴 것이 쌓이지는 않음)
  ensureDaily(state, bank, TOMORROW, seeded());
  assert.throws(() => applyAction(state, { type: 'villageHarvest', spot: 0 }, ctx(bank, TOMORROW)), GameError);
  finishDaily(state, bank, TOMORROW);
  applyAction(state, { type: 'villageHarvest', spot: 0 }, ctx(bank, TOMORROW));
  assert.equal(count(state, berry), before + 2);
  assert.equal(state.berrySources?.tree, 2);
});

test('열매 상한 99(종류마다): 나무·손님 열매는 안 들어오고 안내만, 가진 32개는 그대로', () => {
  reset();
  assert.equal(CRAFT_DEFAULT.treeMax, 3);
  const bank = makeBank();
  const state = started(bank);
  const berry = berryOfType(species(906).types[0]);
  fill(state, 'apple', 32);
  finishDaily(state, bank);
  assert.equal(count(state, 'apple'), 32); // 예전에 모은 열매 그대로
  fill(state, berry, 99 - count(state, berry));
  assert.equal(berryCapped(state, berry), true);
  assert.throws(() => applyAction(state, { type: 'villageHarvest', spot: 0 }, ctx(bank)), /가득 찼어/);
  assert.equal(count(state, berry), 99);
  // 따지 못했으니 오늘 기회는 남아 있음
  assert.equal(childView(state, bank, TODAY).village.craft.trees[0].ready, true);
});

test('바위 채집: 하루 5개까지, 다음 날 다시 (보호자가 바꿀 수 있음)', () => {
  reset();
  const bank = makeBank();
  const state = started(bank);
  finishDaily(state, bank);
  state.village!.mats.stone = 0;
  const stone0 = 0;
  for (let i = 0; i < 5; i++) applyAction(state, { type: 'villageGather', rock: i % 3 }, ctx(bank));
  assert.throws(() => applyAction(state, { type: 'villageGather', rock: 0 }, ctx(bank)), /다 캤어/);
  assert.equal(state.village!.mats.stone, stone0 + 5);
  assert.equal(childView(state, bank, TODAY).village.craft.stoneLeft, 0);
  finishDaily(state, bank, TOMORROW);
  state.village!.mats.stone = 0;
  applyAction(state, { type: 'villageGather', rock: 1 }, ctx(bank, TOMORROW));
  setCraftRules({ stoneDaily: 1 });
  assert.throws(() => applyAction(state, { type: 'villageGather', rock: 1 }, ctx(bank, TOMORROW)), /하루 1개/);
  reset();
});

test('손님에게 말 걸기: 손님마다 하루 1번, 확률(0%면 없음, 100%면 열매 1개)', () => {
  reset();
  const bank = makeBank();
  const state = started(bank);
  finishDaily(state, bank);
  // 서식지 + 손님을 바로 넣어 둠
  state.village!.guests = { date: TODAY, list: [{ plot: 0, species: 1, habitat: 'grass' }] } as never;
  setCraftRules({ guestChance: 0 });
  const r0 = applyAction(state, { type: 'villageTalk', plot: 0 }, ctx(bank)) as { gift: unknown };
  assert.equal(r0.gift, null);
  setCraftRules({ guestChance: 100 });
  const again = applyAction(state, { type: 'villageTalk', plot: 0 }, ctx(bank)) as { gift: unknown };
  assert.equal(again.gift, null); // 오늘은 이미 말 걺
  state.village!.guests = { date: TOMORROW, list: [{ plot: 0, species: 1, habitat: 'grass' }] } as never;
  finishDaily(state, bank, TOMORROW);
  const total = (state.potions ?? []).length;
  const r1 = applyAction(state, { type: 'villageTalk', plot: 0 }, ctx(bank, TOMORROW)) as { gift: string };
  assert.ok(BERRY_KINDS.includes(r1.gift as never));
  assert.equal((state.potions ?? []).length, total + 1);
  assert.equal(state.berrySources?.guest, 1);
  reset();
});

test('철: 훈련 주 정산 때 우편함 택배 (5 이상 → 2개, 3 이상 → 1개), 나중에 고쳐 넘기면 차이만', () => {
  reset();
  assert.equal(ironForWeek(5), 2);
  assert.equal(ironForWeek(3.5), 1);
  assert.equal(ironForWeek(2.5), 0);
  const bank = makeBank();
  const state = started(bank);
  const rules = offlineRulesOf();
  // 2026-11-02(월)~08(일): ● 3개 = 3 → 철 1
  for (const d of ['2026-11-02', '2026-11-03', '2026-11-04']) setOfflineMark(state, d, 'full', '2026-11-09', rules);
  syncOffline(state, ctx(bank, '2026-11-10'));
  assert.equal(state.village!.mail!.reduce((n, m) => n + m.amount, 0), 1);
  // 나중에 ● 2개를 더 적으면 (합계 5) 1개 더
  for (const d of ['2026-11-05', '2026-11-06']) setOfflineMark(state, d, 'full', '2026-11-10', rules);
  syncOffline(state, ctx(bank, '2026-11-11'));
  assert.equal(state.village!.mail!.reduce((n, m) => n + m.amount, 0), 2);
  // 우편함 열기 → 철 2
  finishDaily(state, bank);
  const r = applyAction(state, { type: 'villageMail' }, ctx(bank)) as { iron: number };
  assert.equal(r.iron, 2);
  assert.equal(state.village!.study!.iron, 2);
  assert.equal(state.village!.mail!.length, 0);
});

test('철은 이 기능 전에 정산한 주에는 소급하지 않음', () => {
  const bank = makeBank();
  const state = started(bank);
  const rules = offlineRulesOf();
  for (const d of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']) setOfflineMark(state, d, 'full', '2026-11-09', rules);
  syncOffline(state, ctx(bank, '2026-11-10'));
  // 예전 기록처럼 iron 표시를 지움
  delete (state.offline!.weeks['2026-11-02'] as { iron?: number }).iron;
  state.village!.mail = [];
  syncOffline(state, ctx(bank, '2026-11-11'));
  assert.equal(state.village!.mail!.length, 0);
});

test('반짝돌: 이틀 뒤 복습 문제를 첫 시도에 맞히면 +1 (그냥 정답은 없음)', () => {
  reset();
  const bank = makeBank();
  const state = started(bank);
  const q = bank.questions[0];
  const wrong = (q.answer + 1) % 5;
  applyAction(state, { type: 'answer', mode: 'explore', questionId: q.id, choice: wrong }, ctx(bank, '2026-11-12'));
  applyAction(state, { type: 'answer', mode: 'explore', questionId: q.id, choice: wrong }, ctx(bank, '2026-11-12'));
  const other = bank.questions[1];
  const r0 = applyAction(state, { type: 'answer', mode: 'explore', questionId: other.id, choice: other.answer }, ctx(bank, TODAY)) as { sparkle?: number };
  assert.equal(r0.sparkle ?? 0, 0);
  const r = applyAction(state, { type: 'answer', mode: 'explore', questionId: q.id, choice: q.answer }, ctx(bank, TODAY)) as { sparkle?: number };
  assert.equal(r.sparkle, 1);
  assert.equal(state.village!.study!.sparkle, 1);
});

test('제작대: 열매는 종류 상관없이 합쳐서(많이 가진 것부터, 골라서도), 몬스터볼에도 반짝돌, 모자라면 무엇이 몇 개 모자란지', () => {
  reset();
  const bank = makeBank();
  const state = started(bank);
  finishDaily(state, bank);
  const v = state.village!;
  v.study = { iron: 0, sparkle: 0 };
  fill(state, 'apple', 6);
  fill(state, 'fire', 5);
  v.mats.stone = 2;
  // 몬스터볼: 열매 10 + 돌멩이 3 + 반짝돌 1 (2026-11-14) → 돌멩이 1개·반짝돌 1개 모자람
  assert.deepEqual(recipeCost('poke'), { berry: 10, stone: 3, iron: 0, sparkle: 1 });
  assert.throws(() => applyAction(state, { type: 'villageMake', recipe: 'poke' }, ctx(bank)), /돌멩이 1개, 반짝돌 1개가 더 필요해/);
  v.mats.stone = 10;
  v.study = { iron: 0, sparkle: 3 };
  // 사과 6 + 불꽃 5 = 11개 → 합쳐서 10개 (많이 가진 사과부터)
  applyAction(state, { type: 'villageMake', recipe: 'poke' }, ctx(bank));
  assert.equal(count(state, 'apple'), 0);
  assert.equal(count(state, 'fire'), 1);
  assert.equal(v.mats.stone, 7);
  assert.equal(v.study.sparkle, 2);
  assert.deepEqual(v.craftLog![0].berries, { apple: 6, fire: 4 });
  // 아이가 고른 대로 (합이 맞아야 함)
  fill(state, 'apple', 12);
  assert.throws(() => applyAction(state, { type: 'villageMake', recipe: 'poke', berries: { apple: 5 } }, ctx(bank)), /열매 수가 맞지 않아/);
  applyAction(state, { type: 'villageMake', recipe: 'poke', berries: { apple: 9, fire: 1 } }, ctx(bank));
  assert.deepEqual([count(state, 'apple'), count(state, 'fire')], [3, 0]);
  // 열매가 모자라면 "열매 n개"
  assert.throws(() => applyAction(state, { type: 'villageMake', recipe: 'great' }, ctx(bank)), /열매 27개, 돌멩이 1개, 철 2개가 더 필요해! \(트레이너 훈련/);
  // 하이퍼볼: 여러 종류 합쳐 99
  fill(state, 'star', 50); fill(state, 'moon', 46);
  v.study = { iron: 0, sparkle: 1 };
  applyAction(state, { type: 'villageMake', recipe: 'ultra' }, ctx(bank));
  assert.deepEqual([count(state, 'star'), count(state, 'moon'), count(state, 'apple')], [0, 0, 0]);
  assert.deepEqual(v.craftedBalls!.map(b => b.kind), ['poke', 'poke', 'ultra']);
  reset();
});

test('묘목: 만들고 골라 심기, 다음 날부터 열매, 3그루까지', () => {
  reset();
  const bank = makeBank();
  const state = started(bank);
  finishDaily(state, bank);
  const v = state.village!;
  v.mats.stone = 20;
  fill(state, 'moon', 30);
  applyAction(state, { type: 'villageMake', recipe: 'sapling', berry: 'moon' }, ctx(bank));
  assert.equal(v.saplings, 1);
  assert.throws(() => applyAction(state, { type: 'villagePlant', spot: 0, berry: 'blue' }, ctx(bank)), /벌써 나무/);
  applyAction(state, { type: 'villagePlant', spot: 1, berry: 'blue' }, ctx(bank));
  assert.equal(v.saplings, 0);
  assert.throws(() => applyAction(state, { type: 'villageHarvest', spot: 1 }, ctx(bank)), /내일부터/);
  applyAction(state, { type: 'villageMake', recipe: 'sapling', berry: 'moon' }, ctx(bank));
  // 나무 2그루 + 묘목 1 = 3 → 더는 못 만듦
  assert.throws(() => applyAction(state, { type: 'villageMake', recipe: 'sapling', berry: 'moon' }, ctx(bank)), /3그루까지/);
  applyAction(state, { type: 'villagePlant', spot: 2, berry: 'thunder' }, ctx(bank));
  assert.equal(childView(state, bank, TODAY).village.craft.trees.length, 3);
  finishDaily(state, bank, TOMORROW);
  const blue = count(state, 'blue');
  applyAction(state, { type: 'villageHarvest', spot: 1 }, ctx(bank, TOMORROW));
  assert.equal(count(state, 'blue'), blue + 1);
});

test('제작 볼 열기: 아직 도감에 없는 포켓몬만(전설·환상 없음), 다 만나면 이로치, 그것도 없으면 열매 돌려받기', () => {
  reset();
  const bank = makeBank();
  const state = started(bank);
  for (let seed = 1; seed < 60; seed++) {
    const f = pickCraftedSpecies(state, 'poke', seeded(seed), 0)!;
    assert.ok(!state.dex.includes(f.id));
    assert.ok(f.tier <= 2);
    assert.ok(CATCH_POOLS[0].includes(f.id));
    assert.equal(f.shiny, false);
    const g = pickCraftedSpecies(state, 'great', seeded(seed), 0)!;
    assert.ok(CATCH_POOLS[1].includes(g.id));
  }
  // 하이퍼볼 이로치 확률: 100%면 늘 이로치, 0%면 없음
  assert.equal(pickCraftedSpecies(state, 'ultra', seeded(3), 100)!.shiny, true);
  assert.equal(pickCraftedSpecies(state, 'ultra', seeded(3), 0)!.shiny, false);
  // 보통 등급을 다 만나면 가까운 등급(조금 드묾)에서
  for (const id of CATCH_POOLS[0]) state.dex.push(id);
  assert.ok(CATCH_POOLS[1].includes(pickCraftedSpecies(state, 'poke', seeded(5))!.id));
  // 1~3등급을 다 만나면 아직 없는 이로치
  for (const t of [1, 2]) for (const id of CATCH_POOLS[t]) state.dex.push(id);
  const s = pickCraftedSpecies(state, 'poke', seeded(5))!;
  assert.equal(s.shiny, true);
  // 이로치까지 다 있으면 null → 볼을 열면 열매를 돌려받음
  state.shiny = [0, 1, 2].flatMap(t => CATCH_POOLS[t]);
  assert.equal(pickCraftedSpecies(state, 'poke', seeded(5)), null);
  finishDaily(state, bank);
  state.village!.mats.stone = 10;
  fill(state, 'apple', 10);
  applyAction(state, { type: 'villageMake', recipe: 'poke', berry: 'apple' }, ctx(bank));
  const id = state.village!.craftedBalls![0].id;
  const before = { stone: state.village!.mats.stone, sparkle: state.village!.study?.sparkle ?? 0, iron: state.village!.study?.iron ?? 0 };
  const r = applyAction(state, { type: 'openCraftedBall', id }, ctx(bank)) as { caught: number; returned: { berry: string; n: number }; message: string };
  assert.equal(r.caught, 0);
  // 쓴 재료를 모두 돌려받음: 열매 10 + 돌멩이 3 + 반짝돌 1 (몬스터볼)
  assert.deepEqual(r.returned, { berry: 'apple', n: 10, stone: 3, iron: 0, sparkle: 1 });
  assert.equal(count(state, 'apple'), 10);
  assert.equal(state.village!.mats.stone, before.stone + 3);
  assert.equal(state.village!.study!.sparkle, before.sparkle + 1);
  assert.equal(state.village!.study!.iron, before.iron);
  assert.match(r.message, /열매 10개, 돌멩이 3개, 반짝돌 1개/);
  assert.deepEqual(state.village!.craftLog![0].result, { returned: 10, stone: 3, iron: 0, sparkle: 1 });
});

test('제작 볼 열기: 새 포켓몬이 들어오고 제작 기록에 남음', () => {
  reset();
  const bank = makeBank();
  const state = started(bank);
  finishDaily(state, bank);
  state.village!.mats.stone = 10;
  fill(state, 'apple', 10);
  applyAction(state, { type: 'villageMake', recipe: 'poke', berry: 'apple' }, ctx(bank));
  const id = state.village!.craftedBalls![0].id;
  const owned = state.owned.length;
  const r = applyAction(state, { type: 'openCraftedBall', id }, ctx(bank)) as { caught: number };
  assert.ok(r.caught > 0);
  assert.equal(state.owned.length, owned + 1);
  assert.ok(state.dex.includes(r.caught));
  assert.ok(species(r.caught).tier < 3);
  assert.equal(state.village!.craftedBalls!.length, 0);
  assert.equal((state.village!.craftLog![0].result as { species: number }).species, r.caught);
  assert.throws(() => applyAction(state, { type: 'openCraftedBall', id }, ctx(bank)), /찾을 수 없어/);
});

test('syncVillage는 열매나무 기록을 건드리지 않고, 예전 마을 기록도 그대로 읽힘', () => {
  reset();
  const bank = makeBank();
  const state = started(bank);
  finishDaily(state, bank);
  applyAction(state, { type: 'villageEnter' }, ctx(bank));
  const old = structuredClone(state.village!);
  delete old.trees; delete old.study; delete old.craftedBalls;
  state.village = old;
  syncVillage(state, TOMORROW, seeded());
  const view = childView(state, bank, TOMORROW).village.craft;
  assert.equal(view.trees.length, 1);
  assert.equal(view.iron, 0);
  assert.equal(view.balls.length, 0);
});

// ---------- 낚시·벌레잡기 (2026-11-14) ----------
test('도구: 재료로 낚싯대·잠자리채를 만들고, 15번 쓰면 부서짐 (하나씩만)', () => {
  reset();
  const bank = makeBank();
  const state = started(bank);
  finishDaily(state, bank);
  const v = state.village!;
  v.mats = { twig: 1, leaf: 2 };
  assert.throws(() => applyAction(state, { type: 'toolCraft', tool: 'rod', stay: true }, ctx(bank)), /나뭇가지 2개가 더 필요해/);
  v.mats = { twig: 5, leaf: 2, petal: 2 };
  applyAction(state, { type: 'toolCraft', tool: 'rod', stay: true }, ctx(bank));
  assert.deepEqual([v.mats.twig, v.mats.leaf], [2, 0]);
  assert.equal(v.tools!.rod, 15);
  assert.throws(() => applyAction(state, { type: 'toolCraft', tool: 'rod', stay: true }, ctx(bank)), /벌써 있어/);
  applyAction(state, { type: 'toolCraft', tool: 'net', stay: true }, ctx(bank));
  assert.equal(v.tools!.net, 15);
  // 낚시는 물 칸에서만 (처음 마을 연못 x1~3, y15~17)
  assert.throws(() => applyAction(state, { type: 'villageCatch', tool: 'rod', x: 5, y: 9, hit: true, stay: true }, ctx(bank)), /물가에서만/);
  // 잠긴 땅은 안 됨
  assert.throws(() => applyAction(state, { type: 'villageCatch', tool: 'net', x: 14, y: 6, hit: true, stay: true }, ctx(bank)), /할 수 없어/);
  // 놓쳐도 1번 닳음
  const r0 = applyAction(state, { type: 'villageCatch', tool: 'rod', x: 2, y: 16, hit: false, stay: true }, ctx(bank)) as { hit: boolean; left: number };
  assert.deepEqual([r0.hit, r0.left], [false, 14]);
  for (let i = 0; i < 14; i++) applyAction(state, { type: 'villageCatch', tool: 'rod', x: 2, y: 16, hit: true, stay: true }, ctx(bank, TODAY, seeded(i + 2)));
  assert.equal(v.tools!.rod, 0);
  assert.equal(v.caught!.rod, 14);
  assert.throws(() => applyAction(state, { type: 'villageCatch', tool: 'rod', x: 2, y: 16, hit: true, stay: true }, ctx(bank)), /없어!/);
  // 부서지면 다시 만들 수 있음
  v.mats = { twig: 3, leaf: 2 };
  applyAction(state, { type: 'toolCraft', tool: 'rod', stay: true }, ctx(bank));
  assert.equal(v.tools!.rod, 15);
  // 보호자가 횟수를 바꿀 수 있음
  setCraftRules({ toolUses: 3 });
  v.tools!.net = 0; v.mats = { twig: 2, petal: 2 };
  applyAction(state, { type: 'toolCraft', tool: 'net', stay: true }, ctx(bank));
  assert.equal(v.tools!.net, 3);
  reset();
});

test('잡으면: 낚시 = 물방울·진흙, 벌레 = 꽃잎·풀잎(가끔 열매), 포켓몬은 📖 방명록에만 (가진 포켓몬은 그대로)', () => {
  reset();
  const bank = makeBank();
  const state = started(bank);
  finishDaily(state, bank);
  const v = state.village!;
  v.tools = { rod: 15, net: 15 };
  v.mats = {};
  const owned = state.owned.length, dex = state.dex.length;
  setCraftRules({ catchBerry: 0, catchMeet: 100, toolUses: 15 });
  const r = applyAction(state, { type: 'villageCatch', tool: 'rod', x: 2, y: 16, hit: true, stay: true }, ctx(bank, TODAY, seeded(7))) as { mat: string; met: { species: number; fresh: boolean } };
  assert.ok(['drop', 'mud'].includes(r.mat));
  assert.ok(species(r.met.species).types.includes('water'));
  assert.ok(species(r.met.species).tier < 3);
  assert.ok(state.village!.guestbook![String(r.met.species)]);
  assert.equal(r.met.fresh, true);
  const b = applyAction(state, { type: 'villageCatch', tool: 'net', x: 4, y: 10, hit: true, stay: true }, ctx(bank, TODAY, seeded(9))) as { mat: string; met: { species: number } };
  assert.ok(['petal', 'leaf'].includes(b.mat));
  assert.ok(species(b.met.species).types.some(t => t === 'bug' || t === 'fairy'));
  assert.equal(state.owned.length, owned);
  assert.equal(state.dex.length, dex);
  // 열매 100%면 열매 (상한이면 재료로)
  setCraftRules({ catchBerry: 100, catchMeet: 0 });
  const before = (state.potions ?? []).length;
  const c = applyAction(state, { type: 'villageCatch', tool: 'net', x: 4, y: 10, hit: true, stay: true }, ctx(bank, TODAY, seeded(11))) as { berry: string | null };
  assert.ok(c.berry);
  assert.equal((state.potions ?? []).length, before + 1);
  assert.equal(state.berrySources?.catch, 1);
  reset();
});
