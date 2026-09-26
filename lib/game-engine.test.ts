import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DAILY_PER_SUBJECT, SUBJECTS, SUBJECT_TYPES } from './game-config.ts';
import { applyAction, childView, ensureDaily, GameError, initialState, type ActiveBank, type Context, type Question } from './game-engine.ts';
import { CATCH_POOLS, evolutionRequirement, evolutionsOf, species, TOTAL_SPECIES } from './pokedex.ts';
import { sampleQuestions } from './sample-bank.ts';

/** 반복 가능한 난수 */
function seeded(seed = 1) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}
function makeBank(perSubject = 6): ActiveBank {
  let id = 1;
  const questions: Question[] = SUBJECTS.flatMap(subject => Array.from({ length: perSubject }, (_, i) => ({
    id: id++, subject, type: SUBJECT_TYPES[subject][0], prompt: `${subject} ${i}`,
    choices: ['a', 'b', 'c', 'd', 'e'], answer: i % 5, explanation: '해설',
  })));
  return { id: 7, title: '테스트', questions };
}
function ctx(bank: ActiveBank | null, random = seeded()): Context {
  return { bank, today: '2026-09-26', now: '2026-09-26T00:00:00Z', random };
}
function started(bank: ActiveBank) {
  const state = initialState();
  applyAction(state, { type: 'starter', species: 906 }, ctx(bank));
  return state;
}

test('도감 데이터: 1025종, 시작 포켓몬 진화 조건', () => {
  assert.equal(TOTAL_SPECIES, 1025);
  assert.equal(species(906).name, '나오하');
  assert.deepEqual(evolutionsOf(906), [907]);
  assert.deepEqual(evolutionRequirement(907), [{ type: 'grass', amount: 15 }]);
  assert.deepEqual(evolutionRequirement(908), [{ type: 'grass', amount: 25 }, { type: 'dark', amount: 12 }]);
  assert.equal(evolutionsOf(133).length, 8); // 이브이
  for (const pool of CATCH_POOLS) assert.ok(pool.length > 0);
});

test('파트너는 세 시작 포켓몬 중 한 번만 고를 수 있다', () => {
  const bank = makeBank();
  const state = initialState();
  assert.throws(() => applyAction(state, { type: 'starter', species: 1 }, ctx(bank)), GameError);
  applyAction(state, { type: 'starter', species: 909 }, ctx(bank));
  assert.equal(state.owned[0].species, 909);
  assert.equal(state.partner, state.owned[0].uid);
  assert.throws(() => applyAction(state, { type: 'starter', species: 912 }, ctx(bank)), GameError);
});

test('일일미션: 과목별 4문제, 모두 맞히면 상자 1번만', () => {
  const bank = makeBank();
  const state = started(bank);
  ensureDaily(state, bank, '2026-09-26', seeded());
  const ids = state.daily!.questionIds;
  assert.equal(ids.length, SUBJECTS.length * DAILY_PER_SUBJECT);
  for (const s of SUBJECTS) assert.equal(ids.filter(id => bank.questions.find(q => q.id === id)!.subject === s).length, DAILY_PER_SUBJECT);

  assert.throws(() => applyAction(state, { type: 'dailyBox', pick: 0 }, ctx(bank)), /모두 맞혀야/);
  for (const id of ids) {
    const q = bank.questions.find(q => q.id === id)!;
    const wrong = applyAction(state, { type: 'answer', mode: 'daily', questionId: id, choice: (q.answer + 1) % 5 }, ctx(bank));
    assert.equal(wrong?.correct, false);
    applyAction(state, { type: 'answer', mode: 'daily', questionId: id, choice: q.answer }, ctx(bank));
  }
  assert.equal(state.exp, ids.length * 10);
  const statTotal = Object.values(state.stats).reduce((a, b) => a + b, 0);
  assert.equal(statTotal, ids.length);

  const box = applyAction(state, { type: 'dailyBox', pick: 1 }, ctx(bank)) as { items: unknown[] };
  assert.equal(box.items.length, 3);
  assert.equal(state.daily!.claimed, true);
  assert.throws(() => applyAction(state, { type: 'dailyBox', pick: 0 }, ctx(bank)), /이미/);
});

test('같은 날 미션을 다시 맞혀도 보상은 한 번', () => {
  const bank = makeBank();
  const state = started(bank);
  ensureDaily(state, bank, '2026-09-26', seeded());
  const q = bank.questions.find(q => q.id === state.daily!.questionIds[0])!;
  applyAction(state, { type: 'answer', mode: 'daily', questionId: q.id, choice: q.answer }, ctx(bank));
  applyAction(state, { type: 'answer', mode: 'daily', questionId: q.id, choice: q.answer }, ctx(bank));
  assert.equal(state.exp, 10);
});

test('두 번 틀리면 힌트를 준다', () => {
  const bank = makeBank();
  const state = started(bank);
  const q = bank.questions[0];
  const first = applyAction(state, { type: 'answer', mode: 'explore', questionId: q.id, choice: (q.answer + 1) % 5 }, ctx(bank)) as { hint?: string };
  const second = applyAction(state, { type: 'answer', mode: 'explore', questionId: q.id, choice: (q.answer + 1) % 5 }, ctx(bank)) as { hint?: string };
  assert.equal(first.hint, undefined);
  assert.equal(second.hint, '해설');
});

test('탐험: 과목 완료 → 물약 1번, 전 과목 완료 → 럭셔리볼', () => {
  const bank = makeBank(3);
  const state = started(bank);
  const view0 = childView(state, bank, '2026-09-26');
  assert.equal(view0.explore.length, SUBJECTS.length);

  const solveSubject = (subject: string) => {
    for (const q of bank.questions.filter(q => q.subject === subject)) {
      applyAction(state, { type: 'answer', mode: 'explore', questionId: q.id, choice: q.answer }, ctx(bank));
    }
  };
  assert.throws(() => applyAction(state, { type: 'exploreReward', subject: '국어', pick: 0 }, ctx(bank)), /모두 맞혀야/);
  solveSubject('국어');
  const before = { ...state.stats };
  const reward = applyAction(state, { type: 'exploreReward', subject: '국어', pick: 2 }, ctx(bank)) as { items: { type: string; amount: number }[] };
  const chosen = reward.items[2];
  assert.ok(SUBJECT_TYPES['국어'].includes(chosen.type as never));
  assert.equal(state.stats[chosen.type as keyof typeof state.stats], before[chosen.type as keyof typeof before] + chosen.amount);
  assert.throws(() => applyAction(state, { type: 'exploreReward', subject: '국어', pick: 0 }, ctx(bank)), /이미/);

  assert.throws(() => applyAction(state, { type: 'masterReward', pick: 0 }, ctx(bank)), /모든 과목/);
  for (const s of SUBJECTS) solveSubject(s);
  applyAction(state, { type: 'masterReward', pick: 0 }, ctx(bank));
  assert.equal(state.balls.length, 1);
  assert.equal(state.balls[0].kind, 'luxury');
  const opened = applyAction(state, { type: 'openBall', ballId: state.balls[0].id }, ctx(bank)) as { caught: number };
  assert.ok(opened.caught > 0);
  assert.equal(state.balls.length, 0);
  assert.ok(state.dex.includes(opened.caught));
});

test('탐험 마스터 볼은 약 50%가 희귀 이상', () => {
  const state = initialState();
  const random = seeded(42);
  let rare = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    state.balls.push({ id: 'x' + i, kind: 'luxury' });
    const r = applyAction(state, { type: 'openBall', ballId: 'x' + i }, ctx(null, random)) as { tier: number };
    if (r.tier >= 2) rare++;
  }
  assert.ok(Math.abs(rare / N - 0.5) < 0.03, `희귀 비율 ${rare / N}`);
});

test('진화: 스탯이 모자라면 실패, 충분하면 소모하고 진화', () => {
  const bank = makeBank();
  const state = started(bank);
  const uid = state.owned[0].uid;
  assert.throws(() => applyAction(state, { type: 'evolve', uid, target: 907 }, ctx(bank)), /부족/);
  assert.throws(() => applyAction(state, { type: 'evolve', uid, target: 908 }, ctx(bank)), /진화할 수 없어요/);
  state.stats.grass = 20;
  applyAction(state, { type: 'evolve', uid, target: 907 }, ctx(bank));
  assert.equal(state.stats.grass, 5);
  assert.equal(state.owned[0].species, 907);
  assert.ok(state.dex.includes(907));
  assert.equal(state.partner, uid);
});

test('이미 가진 포켓몬이 또 나오면 스탯 보너스', () => {
  const state = initialState();
  const random = seeded(3);
  for (let i = 0; i < 300; i++) {
    state.balls.push({ id: 'b' + i, kind: 'poke' });
    applyAction(state, { type: 'openBall', ballId: 'b' + i }, ctx(null, random));
  }
  const species = state.owned.map(p => p.species);
  assert.equal(new Set(species).size, species.length);
});

test('부모가 지운 문제는 오늘의 미션에서 빠진다', () => {
  const bank = makeBank();
  const state = started(bank);
  ensureDaily(state, bank, '2026-09-26', seeded());
  const removed = state.daily!.questionIds[0];
  const smaller = { ...bank, questions: bank.questions.filter(q => q.id !== removed) };
  assert.equal(ensureDaily(state, smaller, '2026-09-26', seeded()), true);
  assert.ok(!state.daily!.questionIds.includes(removed));
});

test('샘플 문제은행은 모두 형식이 맞다', () => {
  assert.equal(sampleQuestions.length, 35);
  for (const q of sampleQuestions) {
    assert.equal(q.choices.length, 5);
    assert.equal(new Set(q.choices).size, 5);
    assert.ok(q.answer >= 0 && q.answer < 5);
    assert.ok(SUBJECT_TYPES[q.subject].includes(q.type), `${q.prompt}: ${q.type}`);
  }
});
