import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DAILY_PER_SUBJECT, SUBJECTS, SUBJECT_TYPES } from './game-config.ts';
import { applyAction, childView, ensureDaily, GameError, initialState, nextExploreQuestion, type ActiveBank, type Context, type Question } from './game-engine.ts';
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

test('탐험: 과목 완료 → 물약 1번, 전 과목 완료 → 럭셔리볼', () => {
  const bank = makeBank(3);
  const state = started(bank);
  const view0 = childView(state, bank, '2026-09-26');
  assert.equal(view0.explore.length, SUBJECTS.length);

  const solveSubject = (subject: string) => {
    for (const q of bank.questions.filter(q => q.subject === subject && !state.banks[bank.id]?.solved.includes(q.id))) {
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

const answerOf = (bank: ActiveBank, id: number) => bank.questions.find(q => q.id === id)!.answer;
const wrongOf = (bank: ActiveBank, id: number) => (answerOf(bank, id) + 1) % 5;

test('일일미션: 과목별 4문제, 모두 맞히면 상자 1번만', () => {
  const bank = makeBank();
  const state = started(bank);
  ensureDaily(state, bank, '2026-09-26', seeded());
  const ids = state.daily!.questionIds;
  assert.equal(ids.length, SUBJECTS.length * DAILY_PER_SUBJECT);
  for (const s of SUBJECTS) assert.equal(ids.filter(id => bank.questions.find(q => q.id === id)!.subject === s).length, DAILY_PER_SUBJECT);

  assert.throws(() => applyAction(state, { type: 'dailyBox', pick: 0 }, ctx(bank)), /모두 맞혀야/);
  for (const id of ids) applyAction(state, { type: 'answer', mode: 'daily', questionId: id, choice: answerOf(bank, id) }, ctx(bank));
  assert.equal(state.exp, ids.length * 10);
  assert.equal(Object.values(state.stats).reduce((a, b) => a + b, 0), ids.length);

  const box = applyAction(state, { type: 'dailyBox', pick: 1 }, ctx(bank)) as { items: unknown[] };
  assert.equal(box.items.length, 3);
  assert.throws(() => applyAction(state, { type: 'dailyBox', pick: 0 }, ctx(bank)), /이미/);
});

test('일일미션: 틀리면 다시 풀 수 없고, 상자도 없고, 다음 날 미션에 먼저 나온다', () => {
  const bank = makeBank(8);
  const state = started(bank);
  ensureDaily(state, bank, '2026-09-26', seeded());
  const [wrongId, ...rest] = state.daily!.questionIds;

  const r = applyAction(state, { type: 'answer', mode: 'daily', questionId: wrongId, choice: wrongOf(bank, wrongId) }, ctx(bank)) as { correct: boolean; answer: number };
  assert.equal(r.correct, false);
  assert.equal(r.answer, answerOf(bank, wrongId)); // 정답을 알려 준다
  assert.throws(() => applyAction(state, { type: 'answer', mode: 'daily', questionId: wrongId, choice: answerOf(bank, wrongId) }, ctx(bank)), /이미 풀었어요/);
  for (const id of rest) applyAction(state, { type: 'answer', mode: 'daily', questionId: id, choice: answerOf(bank, id) }, ctx(bank));

  const view = childView(state, bank, '2026-09-26').daily!;
  const card = childView(state, bank, '2026-09-26').explore.find(e => e.subject === bank.questions.find(q => q.id === wrongId)!.subject)!;
  assert.equal(card.reviewLater, 1);
  assert.equal(card.inDaily, 0);
  assert.equal(view.finished, true);
  assert.equal(view.complete, false);
  assert.throws(() => applyAction(state, { type: 'dailyBox', pick: 0 }, ctx(bank)), /모두 맞혀야/);
  // 오늘은 탐험에서도 나오지 않는다
  for (let i = 1; i < 20; i++) assert.notEqual(nextExploreQuestion(state, bank, bank.questions.find(q => q.id === wrongId)!.subject, '2026-09-26', seeded(i))?.id, wrongId);

  // 다음 날 미션에는 반드시 다시 나온다
  for (let seed = 1; seed < 10; seed++) {
    const copy = structuredClone(state);
    ensureDaily(copy, bank, '2026-09-27', seeded(seed));
    assert.ok(copy.daily!.questionIds.includes(wrongId));
  }
});

test('탐험: 틀리면 다시 풀 수 없고 안 푼 문제로 남았다가 다른 날 다시 나온다', () => {
  const bank = makeBank(3);
  const state = started(bank);
  const day1 = ctx(bank);
  const day2: Context = { ...ctx(bank), today: '2026-09-27' };
  const [q, ...others] = bank.questions.filter(q => q.subject === '국어');

  applyAction(state, { type: 'answer', mode: 'explore', questionId: q.id, choice: wrongOf(bank, q.id) }, day1);
  assert.throws(() => applyAction(state, { type: 'answer', mode: 'explore', questionId: q.id, choice: q.answer }, day1), /다른 날/);
  for (let i = 1; i < 20; i++) assert.notEqual(nextExploreQuestion(state, bank, '국어', day1.today, seeded(i))?.id, q.id);
  for (const o of others) applyAction(state, { type: 'answer', mode: 'explore', questionId: o.id, choice: o.answer }, day1);
  assert.equal(nextExploreQuestion(state, bank, '국어', day1.today, seeded()), null);

  const v1 = childView(state, bank, day1.today).explore.find(e => e.subject === '국어')!;
  assert.equal(v1.solved, 2); // 틀린 문제는 안 푼 문제
  assert.equal(v1.reviewLater, 1);
  assert.throws(() => applyAction(state, { type: 'exploreReward', subject: '국어', pick: 0 }, day1), /모두 맞혀야/);

  // 다음 날: 다시 나오고, 맞히면 과목 마스터
  assert.equal(childView(state, bank, day2.today).explore.find(e => e.subject === '국어')!.review, 1);
  assert.equal(nextExploreQuestion(state, bank, '국어', day2.today, seeded())?.id, q.id);
  const exp = state.exp;
  const r = applyAction(state, { type: 'answer', mode: 'explore', questionId: q.id, choice: q.answer }, day2) as { reviewed: boolean };
  assert.equal(r.reviewed, true);
  assert.equal(state.exp, exp + 10);
  applyAction(state, { type: 'exploreReward', subject: '국어', pick: 0 }, day2);
});

test('오늘의 미션 문제는 탐험에서 빠진다 (하루에 두 번 풀지 않기)', () => {
  const bank = makeBank(4);
  const state = started(bank);
  ensureDaily(state, bank, '2026-09-26', seeded());
  // 과목당 4문제가 모두 미션에 들어가므로 탐험에는 문제가 없다
  assert.equal(nextExploreQuestion(state, bank, '수학', '2026-09-26', seeded()), null);
  const id = state.daily!.questionIds[0];
  assert.throws(() => applyAction(state, { type: 'answer', mode: 'explore', questionId: id, choice: 0 }, ctx(bank)), /오늘의 미션/);
  assert.equal(childView(state, bank, '2026-09-26').explore.find(e => e.subject === '국어')!.inDaily, 4);
});

test('이미 맞힌 문제를 틀리면 다시 안 푼 문제가 된다', () => {
  const bank = makeBank(1);
  const state = started(bank);
  const q = bank.questions[0];
  applyAction(state, { type: 'answer', mode: 'explore', questionId: q.id, choice: q.answer }, ctx(bank));
  // 다음 날 일일미션에 (맞힌 문제로) 다시 나왔는데 틀림
  const day2: Context = { ...ctx(bank), today: '2026-09-27' };
  ensureDaily(state, bank, day2.today, seeded());
  applyAction(state, { type: 'answer', mode: 'daily', questionId: q.id, choice: wrongOf(bank, q.id) }, day2);
  assert.ok(!state.banks[bank.id].solved.includes(q.id));
});
