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
    assert.match(decorSpotProblem([], [], 'flower', 'flowerRed', x, y, 5) ?? '', /자리/);
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

test('제작대: 레시피마다 한 종류 열매·재료를 빼고 볼을 만듦, 모자라면 무엇이 몇 개 모자란지', () => {
  reset();
  const bank = makeBank();
  const state = started(bank);
  finishDaily(state, bank);
  const v = state.village!;
  fill(state, 'apple', 12);
  fill(state, 'fire', 5);
  v.mats.stone = 2;
  // 몬스터볼: 사과열매 10 + 돌멩이 3 → 돌멩이 1개 모자람
  assert.throws(() => applyAction(state, { type: 'villageMake', recipe: 'poke', berry: 'apple' }, ctx(bank)), /돌멩이 1개가 더 필요해/);
  // 열매는 한 종류만 셈 (사과 12 + 불꽃 5라도 불꽃으로는 5개 모자람)
  v.mats.stone = 10;
  assert.throws(() => applyAction(state, { type: 'villageMake', recipe: 'poke', berry: 'fire' }, ctx(bank)), /5개.*더 필요해/);
  applyAction(state, { type: 'villageMake', recipe: 'poke', berry: 'apple' }, ctx(bank));
  assert.equal(count(state, 'apple'), 2);
  assert.equal(count(state, 'fire'), 5);
  assert.equal(v.mats.stone, 7);
  assert.equal(v.craftedBalls!.length, 1);
  // 슈퍼볼: 철이 모자라면 공부 안내
  fill(state, 'apple', 30);
  assert.throws(() => applyAction(state, { type: 'villageMake', recipe: 'great', berry: 'apple' }, ctx(bank)), /철 2개가 더 필요해! \(트레이너 훈련/);
  v.study = { iron: 2, sparkle: 0 };
  applyAction(state, { type: 'villageMake', recipe: 'great', berry: 'apple' }, ctx(bank));
  assert.equal(v.study.iron, 0);
  // 하이퍼볼: 열매 99 + 반짝돌 1
  fill(state, 'star', 99);
  assert.throws(() => applyAction(state, { type: 'villageMake', recipe: 'ultra', berry: 'star' }, ctx(bank)), /반짝돌 1개가 더 필요해! \(이틀 뒤 복습/);
  v.study = { iron: 0, sparkle: 1 };
  applyAction(state, { type: 'villageMake', recipe: 'ultra', berry: 'star' }, ctx(bank));
  assert.equal(count(state, 'star'), 0);
  assert.deepEqual(v.craftedBalls!.map(b => b.kind), ['poke', 'great', 'ultra']);
  assert.deepEqual(v.craftLog!.map(l => l.recipe), ['poke', 'great', 'ultra']);
  // 레시피 숫자는 보호자가 바꿀 수 있음
  setCraftRules({ pokeBerry: 1, pokeStone: 0 });
  assert.deepEqual(recipeCost('poke'), { berry: 1, stone: 0, iron: 0, sparkle: 0 });
  applyAction(state, { type: 'villageMake', recipe: 'poke', berry: 'fire' }, ctx(bank));
  assert.equal(count(state, 'fire'), 4);
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
    const f = pickCraftedSpecies(state, 'poke', seeded(seed))!;
    assert.ok(!state.dex.includes(f.id));
    assert.ok(f.tier <= 2);
    assert.ok(CATCH_POOLS[0].includes(f.id));
    assert.equal(f.shiny, false);
    const g = pickCraftedSpecies(state, 'great', seeded(seed))!;
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
  const r = applyAction(state, { type: 'openCraftedBall', id }, ctx(bank)) as { caught: number; returned: { berry: string; n: number } };
  assert.equal(r.caught, 0);
  assert.deepEqual(r.returned, { berry: 'apple', n: 10 });
  assert.equal(count(state, 'apple'), 10);
  assert.deepEqual(state.village!.craftLog![0].result, { returned: 10 });
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
  assert.throws(() => applyAction(state, { type: 'openCraftedBall', id }, ctx(bank)), /찾을 수 없어요/);
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
