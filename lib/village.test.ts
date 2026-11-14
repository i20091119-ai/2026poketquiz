import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DAILY_PER_SUBJECT, SUBJECTS, SUBJECT_TYPES } from './game-config.ts';
import { applyAction, childView, ensureDaily, GameError, initialState, simBankDone, syncVillage, type ActiveBank, type Context, type GameState, type Question } from './game-engine.ts';
import { species } from './pokedex.ts';
import { CELL_COUNT, dayPickups, guestPool, habitatOf, setVillageRules, VILLAGE_DEFAULT } from './village.ts';

const TODAY = '2026-11-13';
function seeded(seed = 1) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function makeBank(perSubject = 3): ActiveBank {
  let id = 1;
  const questions: Question[] = SUBJECTS.flatMap(subject => Array.from({ length: perSubject }, (_, i) => ({
    id: id++, subject, type: SUBJECT_TYPES[subject][i % 3], prompt: `${subject} ${i}`,
    choices: ['a', 'b', 'c', 'd', 'e'], answer: 0, explanation: '해설', area: '영역',
  })));
  return { id: 7, title: '테스트', questions };
}
const ctx = (bank: ActiveBank | null, today = TODAY, random = seeded()): Context => ({ bank, today, now: today + 'T01:00:00Z', random });
function started(bank: ActiveBank) {
  const state = initialState();
  applyAction(state, { type: 'starter', species: 906 }, ctx(bank));
  return state;
}
/** 오늘의 미션을 모두 풉니다 (correct = 맞힐지) */
function finishDaily(state: GameState, bank: ActiveBank, today = TODAY, correct = true, random = seeded()) {
  ensureDaily(state, bank, today, random);
  const results = [];
  for (const id of state.daily!.questionIds) {
    const q = bank.questions.find(q => q.id === id)!;
    const choice = correct ? q.answer : (q.answer + 1) % 5;
    results.push(applyAction(state, { type: 'answer', mode: 'daily', questionId: id, choice }, ctx(bank, today, random)));
    if (!correct) results.push(applyAction(state, { type: 'answer', mode: 'daily', questionId: id, choice }, ctx(bank, today, random)));
  }
  return results;
}

test('마을: 미션 전에는 잠기고, 다 풀면 열림 + 미션 재료 2개 (틀려도 다 풀면 열림)', () => {
  setVillageRules(null);
  const bank = makeBank();
  const state = started(bank);
  ensureDaily(state, bank, TODAY, seeded());
  assert.equal(childView(state, bank, TODAY).village.open, false);
  assert.throws(() => applyAction(state, { type: 'villageEnter' }, ctx(bank)), GameError);
  assert.throws(() => applyAction(state, { type: 'villagePick', spot: 0 }, ctx(bank)), GameError);
  const results = finishDaily(state, bank, TODAY, false);
  const view = childView(state, bank, TODAY).village;
  assert.equal(view.open, true);
  const mats = Object.values(view.mats).reduce((a, b) => a + b, 0);
  assert.equal(mats, VILLAGE_DEFAULT.missionMats); // 틀린 답(다시 풀기 포함)에는 재료 없음
  assert.ok(results.some(r => (r as { village?: { mission?: unknown } }).village?.mission));
  applyAction(state, { type: 'villageEnter' }, ctx(bank));
  // 다음 날 미션 전에는 다시 잠김. 마을 안에 있으면(stay) 자정이 지나도 행동 가능
  const next = '2026-11-14';
  ensureDaily(state, bank, next, seeded());
  assert.equal(childView(state, bank, next).village.open, false);
  assert.throws(() => applyAction(state, { type: 'villageEnter' }, ctx(bank, next)), GameError);
  const spot = dayPickups(next, VILLAGE_DEFAULT.pickPerDay)[0].spot;
  assert.doesNotThrow(() => applyAction(state, { type: 'villagePick', spot, stay: true }, ctx(bank, next)));
});

test('마을: 정답 재료는 확률(첫 시도만), 재료가 볼·열매·조각을 바꾸지 않음', () => {
  setVillageRules({ quizChance: 100 });
  const bank = makeBank();
  const state = started(bank);
  const before = { balls: state.balls.length, potions: state.potions.length, legend: JSON.stringify(state.legend ?? null) };
  finishDaily(state, bank);
  const total = Object.values(state.village!.mats).reduce((a, b) => a + (b ?? 0), 0);
  assert.equal(total, SUBJECTS.length * DAILY_PER_SUBJECT + VILLAGE_DEFAULT.missionMats);
  assert.deepEqual({ balls: state.balls.length, potions: state.potions.length, legend: JSON.stringify(state.legend ?? null) }, before);
  // 다시 풀어서 맞힌 문제는 재료 없음
  const s2 = started(bank);
  ensureDaily(s2, bank, TODAY, seeded());
  const id = s2.daily!.questionIds[0];
  applyAction(s2, { type: 'answer', mode: 'daily', questionId: id, choice: 1 }, ctx(bank));
  const r = applyAction(s2, { type: 'answer', mode: 'daily', questionId: id, choice: 0 }, ctx(bank)) as { village: unknown };
  assert.equal(r.village, null);
  setVillageRules(null);
});

test('마을: 하루 줍기 3개, 종류별 최대 20개', () => {
  setVillageRules(null);
  const bank = makeBank();
  const state = started(bank);
  finishDaily(state, bank);
  const spots = dayPickups(TODAY, 3);
  assert.equal(spots.length, 3);
  for (const p of spots) applyAction(state, { type: 'villagePick', spot: p.spot }, ctx(bank));
  assert.throws(() => applyAction(state, { type: 'villagePick', spot: spots[0].spot }, ctx(bank)), GameError);
  assert.equal(childView(state, bank, TODAY).village.pickLeft, 0);
  state.village!.mats = { leaf: 20, drop: 20, petal: 20, twig: 20, stone: 20, mud: 20 };
  const s2 = started(bank); finishDaily(s2, bank); s2.village!.mats = { leaf: 20, drop: 20, petal: 20, twig: 20, stone: 20, mud: 20 };
  assert.throws(() => applyAction(s2, { type: 'villagePick', spot: spots[0].spot }, ctx(bank)), /가득/);
});

test('마을: 만들기 3가지 → 서식지 3가지 → 다음 날 맞는 손님, 📖 방명록(획득 아님)', () => {
  setVillageRules(null);
  const bank = makeBank();
  const state = started(bank);
  finishDaily(state, bank);
  state.village!.mats = { leaf: 12, drop: 4, petal: 8 };
  for (let i = 0; i < 6; i++) applyAction(state, { type: 'villageCraft', item: 'bush' }, ctx(bank));
  for (let i = 0; i < 2; i++) applyAction(state, { type: 'villageCraft', item: 'puddle' }, ctx(bank));
  for (let i = 0; i < 4; i++) applyAction(state, { type: 'villageCraft', item: 'flowers' }, ctx(bank));
  assert.throws(() => applyAction(state, { type: 'villageCraft', item: 'bush' }, ctx(bank)), /더 필요/);
  const plan = ['bush', 'bush', 'bush', 'bush', 'bush', 'puddle', 'puddle', 'bush', 'flowers', 'flowers', 'flowers', 'flowers'] as const;
  plan.forEach((item, cell) => applyAction(state, { type: 'villagePlace', cell, item }, ctx(bank)));
  assert.equal(plan.length, 12); // 처음 마을 밭 3개 (넓어진 구역 밭은 레벨로 열림)
  assert.equal(CELL_COUNT, 48);
  assert.deepEqual(state.village!.habitats.slice(0, 3).map(h => h?.kind), ['green', 'shore', 'garden']);
  assert.ok(state.village!.habitats.slice(3).every(h => !h));
  // 오늘은 손님 없음
  syncVillage(state, TODAY, seeded());
  assert.equal(childView(state, bank, TODAY).village.guests.length, 0);
  // 다음 날 서식지마다 1마리, 타입이 맞고 전설·환상 아님
  const next = '2026-11-14';
  const owned = state.owned.length;
  syncVillage(state, next, seeded(5));
  finishDaily(state, bank, next);
  applyAction(state, { type: 'villageEnter' }, ctx(bank, next));
  const guests = childView(state, bank, next).village.guests;
  assert.equal(guests.length, 3);
  const types = { green: ['grass'], shore: ['water'], garden: ['bug', 'fairy'] } as const;
  for (const g of guests) {
    const sp = species(g.species);
    assert.ok(sp.tier < 3);
    assert.ok(sp.types.some(t => (types[g.habitat] as readonly string[]).includes(t)));
  }
  assert.equal(state.owned.length, owned); // 손님은 획득이 아님
  assert.deepEqual(Object.keys(state.village!.guestbook!).map(Number).sort(), guests.map(g => g.species).sort()); // 📖 방명록 (2026-11-14, 도감 "만남" 대신)
  // 되가져오면 서식지가 풀림
  applyAction(state, { type: 'villageTake', cell: 0 }, ctx(bank, next));
  assert.equal(state.village!.habitats[0], null);
  assert.equal(state.village!.items.bush, 1);
});

test('복습 모드: 문제은행을 다 맞히면 이미 푼 문제로 같은 수, 전에 틀린 문제 먼저, 끝내면 마을 열림', () => {
  setVillageRules(null);
  const bank = makeBank(4);
  const state = started(bank);
  // 수학 첫 문제는 전에 틀린 적 있음
  const math = bank.questions.filter(q => q.subject === '수학');
  state.banks[bank.id] = { solved: [], wrong: { [math[3].id]: 1 }, review: {}, subjectRewards: [] } as unknown as GameState['banks'][string];
  simBankDone(state, bank, TODAY, seeded());
  const d = state.daily!;
  assert.equal(d.review, true);
  assert.equal(d.questionIds.length, SUBJECTS.length * DAILY_PER_SUBJECT);
  assert.ok(d.questionIds.includes(math[3].id));
  assert.equal(childView(state, bank, TODAY).daily!.review, true);
  finishDaily(state, bank);
  assert.equal(childView(state, bank, TODAY).village.open, true);
  assert.equal(Object.values(state.village!.mats).reduce((a, b) => a + (b ?? 0), 0) >= VILLAGE_DEFAULT.reviewMissionMats, true);
});

test('마을 시간 제한: 하루 ○분 / 문제당 ○분', () => {
  const bank = makeBank();
  const state = started(bank);
  finishDaily(state, bank);
  setVillageRules({ timeMode: 'daily', dailyMinutes: 10 });
  state.quizLog![TODAY].villageSeconds = 600;
  assert.throws(() => applyAction(state, { type: 'villageEnter' }, ctx(bank)), /시간/);
  setVillageRules({ timeMode: 'perQuiz', perQuestions: 6, perMinutes: 10 }); // 18문제 → 30분
  assert.equal(childView(state, bank, TODAY).village.time.allowedMinutes, 30);
  assert.doesNotThrow(() => applyAction(state, { type: 'villageEnter' }, ctx(bank)));
  setVillageRules(null);
});

test('서식지 판정과 손님 후보', () => {
  assert.equal(habitatOf(['bush', 'bush', 'bush', 'bush']), 'green');
  assert.equal(habitatOf(['puddle', 'bush', 'bush', 'puddle']), 'shore');
  assert.equal(habitatOf(['flowers', 'flowers', 'flowers', 'flowers']), 'garden');
  assert.equal(habitatOf(['bush', 'bush', 'bush', null]), null);
  assert.equal(habitatOf(['bush', 'flowers', 'bush', 'bush']), null);
  for (const h of ['green', 'shore', 'garden'] as const) assert.ok(guestPool(h).length > 30 && guestPool(h).every(id => species(id).tier < 3));
});
