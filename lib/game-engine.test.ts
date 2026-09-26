import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DAILY_ATTEMPTS, DAILY_PER_SUBJECT, SUBJECTS, SUBJECT_TYPES, STARTERS, statReward } from './game-config.ts';
import { applyAction, childView, dailyBoxPicks, ensureDaily, GameError, initialState, nextExploreQuestion, type ActiveBank, type Context, type GameState, type Question } from './game-engine.ts';
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

/** 오늘의 미션을 풀기: correctIds는 맞히고 나머지는 기회를 다 써서 틀림 */
function playDaily(state: GameState, bank: ActiveBank, c: Context, correct: (id: number, i: number) => boolean) {
  ensureDaily(state, bank, c.today, c.random);
  state.daily!.questionIds.forEach((id, i) => {
    if (correct(id, i)) applyAction(state, { type: 'answer', mode: 'daily', questionId: id, choice: answerOf(bank, id) }, c);
    else for (let k = 0; k < DAILY_ATTEMPTS; k++) applyAction(state, { type: 'answer', mode: 'daily', questionId: id, choice: wrongOf(bank, id) }, c);
  });
}

test('일일미션: 과목별 4문제, 정답 1개마다 그 속성 +4 (상식 +8)', () => {
  const bank = makeBank();
  const state = started(bank);
  ensureDaily(state, bank, '2026-09-26', seeded());
  const ids = state.daily!.questionIds;
  assert.equal(ids.length, SUBJECTS.length * DAILY_PER_SUBJECT);
  for (const s of SUBJECTS) assert.equal(ids.filter(id => bank.questions.find(q => q.id === id)!.subject === s).length, DAILY_PER_SUBJECT);
  assert.equal(statReward('국어', 'daily'), 4);
  assert.equal(statReward('상식', 'daily'), 8);
  assert.equal(statReward('국어', 'explore'), 1);

  const q = bank.questions.find(q => q.id === ids[0])!;
  const before = state.stats[q.type];
  const r = applyAction(state, { type: 'answer', mode: 'daily', questionId: q.id, choice: q.answer }, ctx(bank)) as { gained: { amount: number } };
  assert.equal(state.stats[q.type], before + statReward(q.subject, 'daily'));
  assert.equal(r.gained.amount, statReward(q.subject, 'daily'));
  assert.equal(state.exp, 10);
});

test('일일미션: 틀려도 기회가 3번, 다 틀리면 정답을 알려주고 끝', () => {
  const bank = makeBank();
  const state = started(bank);
  ensureDaily(state, bank, '2026-09-26', seeded());
  const [a, b] = state.daily!.questionIds;
  // a: 두 번 틀리고 세 번째에 맞힘
  const r1 = applyAction(state, { type: 'answer', mode: 'daily', questionId: a, choice: wrongOf(bank, a) }, ctx(bank)) as { final: boolean; triesLeft: number; answer?: number };
  assert.deepEqual([r1.final, r1.triesLeft, r1.answer], [false, 2, undefined]); // 기회가 남으면 정답을 알려주지 않음
  applyAction(state, { type: 'answer', mode: 'daily', questionId: a, choice: wrongOf(bank, a) }, ctx(bank));
  const r3 = applyAction(state, { type: 'answer', mode: 'daily', questionId: a, choice: answerOf(bank, a) }, ctx(bank)) as { correct: boolean };
  assert.equal(r3.correct, true);
  assert.ok(state.daily!.correct.includes(a));
  // b: 세 번 모두 틀림
  for (let k = 0; k < 2; k++) applyAction(state, { type: 'answer', mode: 'daily', questionId: b, choice: wrongOf(bank, b) }, ctx(bank));
  const last = applyAction(state, { type: 'answer', mode: 'daily', questionId: b, choice: wrongOf(bank, b) }, ctx(bank)) as { final: boolean; answer: number };
  assert.deepEqual([last.final, last.answer], [true, answerOf(bank, b)]);
  assert.throws(() => applyAction(state, { type: 'answer', mode: 'daily', questionId: b, choice: answerOf(bank, b) }, ctx(bank)), /이미 풀었어요/);

  // 둘 다 다음 날 미션에 다시 나온다 (다시 맞힌 문제 포함)
  for (let seed = 1; seed < 6; seed++) {
    const copy = structuredClone(state);
    ensureDaily(copy, bank, '2026-09-27', seeded(seed));
    assert.ok(copy.daily!.questionIds.includes(a) && copy.daily!.questionIds.includes(b));
  }
});

test('랜덤상자: 모두 맞히면 2개, 15개 이상이면 1개, 그 아래는 없음', () => {
  const bank = makeBank(8);
  const cases: [number, number][] = [[20, 2], [19, 1], [15, 1], [14, 0]];
  for (const [correctCount, picks] of cases) {
    const state = started(bank);
    playDaily(state, bank, ctx(bank), (_, i) => i < correctCount);
    assert.equal(dailyBoxPicks(state), picks, `${correctCount}개 맞힘`);
    const view = childView(state, bank, '2026-09-26').daily!;
    assert.equal(view.finished, true);
    if (!picks) { assert.throws(() => applyAction(state, { type: 'dailyBox', pick: 0 }, ctx(bank)), /맞히지 못했어요/); continue; }
    const first = applyAction(state, { type: 'dailyBox', pick: 0 }, ctx(bank)) as { items: unknown[]; done: boolean };
    assert.equal(first.done, picks === 1);
    if (picks === 2) {
      assert.equal(first.items.filter(Boolean).length, 1); // 안 고른 상자는 아직 숨김
      assert.throws(() => applyAction(state, { type: 'dailyBox', pick: 0 }, ctx(bank)), /이미 연 상자/);
      const second = applyAction(state, { type: 'dailyBox', pick: 2 }, ctx(bank)) as { items: unknown[]; done: boolean };
      assert.equal(second.done, true);
      assert.equal(second.items.filter(Boolean).length, 3); // 다 고르면 모두 공개
    }
    assert.throws(() => applyAction(state, { type: 'dailyBox', pick: 1 }, ctx(bank)), /이미 열었어요/);
  }
});

test('미션을 다 풀기 전에는 상자를 열 수 없다', () => {
  const bank = makeBank();
  const state = started(bank);
  ensureDaily(state, bank, '2026-09-26', seeded());
  const id = state.daily!.questionIds[0];
  applyAction(state, { type: 'answer', mode: 'daily', questionId: id, choice: answerOf(bank, id) }, ctx(bank));
  assert.throws(() => applyAction(state, { type: 'dailyBox', pick: 0 }, ctx(bank)), /먼저 끝내/);
});

test('일일미션은 과목 속성을 고르게 낸다', () => {
  let id = 1;
  const questions: Question[] = SUBJECTS.flatMap(subject => Array.from({ length: 60 }, (_, i) => ({
    id: id++, subject, type: SUBJECT_TYPES[subject][i % SUBJECT_TYPES[subject].length], prompt: '', choices: ['a', 'b', 'c', 'd', 'e'], answer: 0, explanation: '',
  })));
  const bank: ActiveBank = { id: 1, title: '', questions };
  const state = initialState();
  const count: Record<string, number> = {};
  for (let day = 1; day <= 6; day++) {
    ensureDaily(state, bank, `2026-10-0${day}`, seeded(day));
    for (const qid of state.daily!.questionIds) { const t = questions[qid - 1].type; count[t] = (count[t] ?? 0) + 1; }
  }
  // 6일 × 상식 4문제 = 24문제 → 6속성에 4문제씩
  for (const t of SUBJECT_TYPES['상식']) assert.equal(count[t], 4, t);
  for (const t of SUBJECT_TYPES['국어']) assert.equal(count[t], 8, t);
});

test('일일미션만 일주일(정답률 80%, 상자 보상 제외) 풀어도 시작 포켓몬 첫 진화 가능', () => {
  // 실제 문제은행처럼 과목마다 100문제, 속성은 과목 속성에 고르게 퍼짐
  let id = 1;
  const questions: Question[] = SUBJECTS.flatMap(subject => Array.from({ length: 100 }, (_, i) => ({
    id: id++, subject, type: SUBJECT_TYPES[subject][i % SUBJECT_TYPES[subject].length], prompt: `${subject}${i}`,
    choices: ['a', 'b', 'c', 'd', 'e'], answer: i % 5, explanation: '',
  })));
  const bank: ActiveBank = { id: 1, title: '시뮬레이션', questions };
  let ok = 0;
  const RUNS = 20;
  for (let run = 1; run <= RUNS; run++) {
    const state = initialState();
    const random = seeded(run * 101);
    applyAction(state, { type: 'starter', species: 906 }, { bank, today: '2026-10-01', now: '', random });
    for (let day = 0; day < 7; day++) {
      const today = `2026-10-0${day + 1}`;
      playDaily(state, bank, { bank, today, now: today, random }, () => random() < 0.8);
    }
    // 시작 포켓몬(풀/불꽃/물) 각각 첫 진화 조건(15)을 넘었는지
    for (const starter of STARTERS) {
      const [target] = evolutionsOf(starter);
      if (evolutionRequirement(target).every(r => state.stats[r.type] >= r.amount)) ok++;
    }
  }
  console.log(`  일주일 안에 시작 포켓몬 첫 진화 가능: ${ok}/${RUNS * STARTERS.length}`);
  assert.ok(ok >= RUNS * STARTERS.length * 0.95, `일주일 안에 첫 진화 가능: ${ok}/${RUNS * STARTERS.length}`);
});
