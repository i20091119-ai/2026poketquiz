import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTIVITY_LOG_DAYS, BALLS, DAILY_BOX_TABLE, GIFT_SIZES, SHINY_CHANCE_DEFAULT, EVOLUTION_COST, DAILY_ATTEMPTS, DAILY_CANDY, EXP_EXCHANGE, WEAK_AREA, EXP_GIFT, DAILY_PER_SUBJECT, SUBJECTS, SUBJECT_TYPES, STARTERS, TYPE_INFO, statReward, iGa, GROWTH_DEFAULT, setGrowthRules, growth, evolutionCost } from './game-config.ts';
import { activityList, applyAction, areaReport, seedAreaStats, recordBattleLevels, battleStartsLeft, battleTimeUp, candySummary, childView, claimCandy, isWeakArea, dailyBoxPicks, ensureDaily, GameError, initialState, nextExploreQuestion, recordBattleProgress, startBattle, battleLogList, type ActiveBank, type Context, type GameState, type Question, recordShiny, simGiveBalls, simGiveShinies, shiftDate, sendGift, giftCounts, battleTickets, battleStartsAvailable, unseenReplies, markRepliesSeen, limitedView, limitedReport, syncLimited, simLimited, resetLimitedIntro, battleIvOf, battleIvList, simBattlePower, simHearts, expExchangeToday, teamOf, createOuting, reviewOuting, syncOutings, outingView, outingReport, simOutingFill, openRetryToday, lockedToday } from './game-engine.ts';
import { LIMITED_EVENTS, limitedShinyMultiplier } from './limited-events.ts';
import { CATCH_POOLS, heartGoalOf, evolutionRequirement, evolutionsOf, isStrong, isValidThird, setStrongOverrides, shinyColor, shinyName, species, SPECIES, TOTAL_SPECIES } from './pokedex.ts';
import { THIRD_TYPE } from './strong-pokemon.ts';
import { megaByKey, megaImages, megaLabel, MEGAS, TOTAL_MEGAS } from './megas.ts';
import { readFileSync } from 'node:fs';
import { afterAction, beforeAction, daySummary, type LogEntry } from './activity-log.ts';
import { buildChildExport } from './child-export.ts';
import { GIFT_CANDY, GIFT_EXP, REPLY_TEXT_MAX } from './game-config.ts';
import { sampleQuestions } from './sample-bank.ts';

/** 반복 가능한 난수 */
function seeded(seed = 1) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}
function makeBank(perSubject = 6): ActiveBank {
  let id = 1;
  const questions: Question[] = SUBJECTS.flatMap(subject => Array.from({ length: perSubject }, (_, i) => ({
    id: id++, subject, type: SUBJECT_TYPES[subject][0], prompt: `${subject} ${i}`,
    choices: ['a', 'b', 'c', 'd', 'e'], answer: i % 5, explanation: '해설', area: `영역${i % 2}`,
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
  assert.deepEqual(evolutionRequirement(907), [{ type: 'grass', amount: 36 }]); // 시작 포켓몬 계열은 센 포켓몬
  assert.deepEqual(evolutionRequirement(908), [{ type: 'grass', amount: 70 }, { type: 'dark', amount: 30 }, { type: 'psychic', amount: 20 }]); // 2026-10-03: 3단계 센 포켓몬 합계 120
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
  const reward = applyAction(state, { type: 'exploreReward', subject: '국어', pick: 2 }, ctx(bank)) as unknown as { items: { kind: string; potion: string }[] };
  assert.equal(reward.items[2].kind, 'potion');
  assert.deepEqual(state.potions.map(p => p.kind), [reward.items[2].potion]); // 물약은 가방으로
  assert.deepEqual(state.stats, before); // 스탯은 먹일 때 오름
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

test('진화: 에너지·💗가 모자라면 실패, 충분하면 에너지를 소모하고 진화, 💗는 0부터', () => {
  const bank = makeBank();
  const state = started(bank);
  const uid = state.owned[0].uid;
  assert.throws(() => applyAction(state, { type: 'evolve', uid, target: 907 }, ctx(bank)), /에너지가 부족/);
  assert.throws(() => applyAction(state, { type: 'evolve', uid, target: 908 }, ctx(bank)), /진화할 수 없어요/);
  state.stats.grass = 41;
  state.hearts = { 906: 29 };
  assert.throws(() => applyAction(state, { type: 'evolve', uid, target: 907 }, ctx(bank)), /💗가 1개 더 필요해! 모험 팀으로 문제를 더 풀어 보자/);
  assert.equal(state.stats.grass, 41); // 실패하면 에너지는 그대로
  state.hearts = { 906: 30 };
  applyAction(state, { type: 'evolve', uid, target: 907 }, ctx(bank));
  assert.equal(state.stats.grass, 5);
  assert.equal(state.hearts[906], 0);
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
  // 기본 모습끼리, 이로치끼리는 겹치지 않음 (이로치는 기본 모습과 따로 한 마리)
  for (const shiny of [false, true]) {
    const species = state.owned.filter(p => !!p.shiny === shiny).map(p => p.species);
    assert.equal(new Set(species).size, species.length);
  }
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
  assert.equal(sampleQuestions.length, 42);
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

test('보호자 "오늘 다시 풀게 열기": 오늘 틀려 잠긴 문제를 그 과목만 오늘 다시 풀 수 있다', () => {
  const bank = makeBank(3);
  const state = started(bank);
  const day1 = ctx(bank);
  const [q, ...others] = bank.questions.filter(q => q.subject === '국어');
  const h = bank.questions.find(q => q.subject === '역사')!;
  for (const o of others) applyAction(state, { type: 'answer', mode: 'explore', questionId: o.id, choice: o.answer }, day1);
  applyAction(state, { type: 'answer', mode: 'explore', questionId: q.id, choice: wrongOf(bank, q.id) }, day1);
  applyAction(state, { type: 'answer', mode: 'explore', questionId: h.id, choice: wrongOf(bank, h.id) }, day1);
  assert.equal(lockedToday(state, bank, '국어', day1.today), 1);
  assert.equal(nextExploreQuestion(state, bank, '국어', day1.today, seeded()), null);

  assert.equal(openRetryToday(state, bank, '국어', day1.today), 1);
  assert.equal(lockedToday(state, bank, '국어', day1.today), 0);
  assert.equal(lockedToday(state, bank, '역사', day1.today), 1); // 다른 과목은 그대로
  assert.equal(state.banks[bank.id].wrong[q.id], 1); // 틀린 횟수 기록은 그대로
  assert.equal(nextExploreQuestion(state, bank, '국어', day1.today, seeded())?.id, q.id);
  const r = applyAction(state, { type: 'answer', mode: 'explore', questionId: q.id, choice: q.answer }, day1) as { reviewed: boolean };
  assert.equal(r.reviewed, true);
  applyAction(state, { type: 'exploreReward', subject: '국어', pick: 0 }, day1);
  assert.equal(openRetryToday(state, bank, '국어', day1.today), 0);
});

test('보호자 "오늘 다시 풀게 열기": 오늘의 미션에서 틀린 문제도 탐험에서 다시 풀 수 있다', () => {
  const bank = makeBank(3);
  const state = started(bank);
  const day1 = ctx(bank);
  ensureDaily(state, bank, day1.today, seeded());
  const id = state.daily!.questionIds[0];
  const q = bank.questions.find(x => x.id === id)!;
  for (let i = 0; i < DAILY_ATTEMPTS; i++) applyAction(state, { type: 'answer', mode: 'daily', questionId: id, choice: wrongOf(bank, id) }, day1);
  assert.equal(openRetryToday(state, bank, q.subject, day1.today), 1);
  applyAction(state, { type: 'answer', mode: 'explore', questionId: id, choice: q.answer }, day1);
  assert.ok(state.banks[bank.id].solved.includes(id));
});

test('오늘의 미션 문제는 탐험에서 빠진다 (하루에 두 번 풀지 않기)', () => {
  const bank = makeBank(3);
  const state = started(bank);
  ensureDaily(state, bank, '2026-09-26', seeded());
  // 과목당 3문제가 모두 미션에 들어가므로 탐험에는 문제가 없다
  assert.equal(nextExploreQuestion(state, bank, '수학', '2026-09-26', seeded()), null);
  const id = state.daily!.questionIds[0];
  assert.throws(() => applyAction(state, { type: 'answer', mode: 'explore', questionId: id, choice: 0 }, ctx(bank)), /오늘의 미션/);
  assert.equal(childView(state, bank, '2026-09-26').explore.find(e => e.subject === '국어')!.inDaily, 3);
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

test('일일미션: 과목별 3문제, 정답 1개마다 그 속성 +5', () => {
  const bank = makeBank();
  const state = started(bank);
  ensureDaily(state, bank, '2026-09-26', seeded());
  const ids = state.daily!.questionIds;
  assert.equal(ids.length, SUBJECTS.length * DAILY_PER_SUBJECT);
  for (const s of SUBJECTS) assert.equal(ids.filter(id => bank.questions.find(q => q.id === id)!.subject === s).length, DAILY_PER_SUBJECT);
  for (const s of SUBJECTS) {
    assert.equal(SUBJECT_TYPES[s].length, 3, s);
    assert.equal(statReward(s, 'daily'), 5);
  }
  assert.equal(new Set(SUBJECTS.flatMap(s => SUBJECT_TYPES[s])).size, 18); // 18속성 모두 한 번씩
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

test('랜덤상자: 18개 모두 맞히면 2개, 15개 이상이면 1개, 그 아래는 없음', () => {
  const bank = makeBank(8);
  const cases: [number, number][] = [[18, 2], [17, 1], [15, 1], [14, 0]];
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
    id: id++, subject, type: SUBJECT_TYPES[subject][i % SUBJECT_TYPES[subject].length], prompt: '', choices: ['a', 'b', 'c', 'd', 'e'], answer: 0, explanation: '', area: '',
  })));
  const bank: ActiveBank = { id: 1, title: '', questions };
  const state = initialState();
  const count: Record<string, number> = {};
  for (let day = 1; day <= 6; day++) {
    ensureDaily(state, bank, `2026-10-0${day}`, seeded(day));
    for (const qid of state.daily!.questionIds) { const t = questions[qid - 1].type; count[t] = (count[t] ?? 0) + 1; }
  }
  // 6일 × 과목당 3문제 = 18문제 → 속성마다 6문제씩
  for (const s of SUBJECTS) for (const t of SUBJECT_TYPES[s]) assert.equal(count[t], 6, t);
});

test('일일미션만 2주(정답률 80%, 상자 보상 제외) 풀면 시작 포켓몬 첫 진화 가능', () => {
  // 실제 문제은행처럼 과목마다 100문제, 속성은 과목 속성에 고르게 퍼짐
  let id = 1;
  const questions: Question[] = SUBJECTS.flatMap(subject => Array.from({ length: 100 }, (_, i) => ({
    id: id++, subject, type: SUBJECT_TYPES[subject][i % SUBJECT_TYPES[subject].length], prompt: `${subject}${i}`,
    choices: ['a', 'b', 'c', 'd', 'e'], answer: i % 5, explanation: '', area: '',
  })));
  const bank: ActiveBank = { id: 1, title: '시뮬레이션', questions };
  let ok = 0;
  const RUNS = 20;
  for (let run = 1; run <= RUNS; run++) {
    const state = initialState();
    const random = seeded(run * 101);
    applyAction(state, { type: 'starter', species: 906 }, { bank, today: '2026-10-01', now: '', random });
    for (let day = 0; day < 14; day++) {
      const today = `2026-10-${String(day + 1).padStart(2, '0')}`;
      playDaily(state, bank, { bank, today, now: today, random }, () => random() < 0.8);
    }
    // 시작 포켓몬(풀/불꽃/물) 각각 첫 진화 조건(센 포켓몬 36)을 넘었는지
    for (const starter of STARTERS) {
      const [target] = evolutionsOf(starter);
      if (evolutionRequirement(target).every(r => state.stats[r.type] >= r.amount)) ok++;
    }
  }
  console.log(`  2주 안에 시작 포켓몬 첫 진화 가능: ${ok}/${RUNS * STARTERS.length}`);
  assert.ok(ok >= RUNS * STARTERS.length * 0.95, `2주 안에 첫 진화 가능: ${ok}/${RUNS * STARTERS.length}`);
});

test('센 모습일수록 진화에 스탯이 더 많이 든다 (1→2단계보다 2→3단계가 2배 넘게)', () => {
  const [c2, c3] = [EVOLUTION_COST[2], EVOLUTION_COST[3]];
  assert.ok(c3.single > c2.single * 2, `속성 1개: ${c2.single} → ${c3.single}`);
  assert.ok(c3.dual[0] + c3.dual[1] > (c2.dual[0] + c2.dual[1]) * 2, '속성 2개 합계');
});

test('센 포켓몬: 1.2배쯤 더 들고, 절반쯤은 이야기에 맞는 도전 속성으로 3과목이 필요', () => {
  const subjectOf = (t: string) => SUBJECTS.find(sub => (SUBJECT_TYPES[sub] as string[]).includes(t));
  assert.deepEqual(evolutionRequirement(6), [{ type: 'fire', amount: 70 }, { type: 'flying', amount: 30 }, { type: 'dark', amount: 20 }]); // 리자몽 불꽃·비행 + 악
  assert.deepEqual(evolutionRequirement(130), [{ type: 'water', amount: 24 }, { type: 'flying', amount: 12 }]); // 갸라도스: 센 포켓몬, 도전 속성 없음
  assert.deepEqual(evolutionRequirement(25), [{ type: 'electric', amount: 36 }]); // 피카츄: 인기 포켓몬
  assert.deepEqual(evolutionRequirement(2), [{ type: 'grass', amount: 24 }, { type: 'poison', amount: 12 }]); // 이상해풀
  assert.ok(!isStrong(20) && evolutionRequirement(20).reduce((a, r) => a + r.amount, 0) === 30, '레트라: 보통 포켓몬');
  for (const [id, third] of Object.entries(THIRD_TYPE)) {
    const s = species(Number(id));
    assert.ok(isStrong(s.id), `${s.name}: 센 포켓몬이어야 함`);
    assert.equal(s.types.length, 2, `${s.name}: 속성 2개`);
    const subjects = new Set([...s.types, third].map(subjectOf));
    assert.equal(subjects.size, 3, `${s.name}: 3과목이어야 함 (${s.types.join('/')} + ${third})`);
  }
  const strongFinals = SPECIES.filter(s => isStrong(s.id) && evolutionsOf(s.id).length === 0 && s.tier >= 2);
  const share = Object.keys(THIRD_TYPE).length / strongFinals.length;
  assert.ok(share >= 0.4 && share <= 0.6, `도전 속성이 있는 센 포켓몬 비율 ${share.toFixed(2)}`);
});

test('속성 변경: 보호자가 바꾼 센 포켓몬·도전 속성이 진화 조건에 반영되고, 3과목이 안 되는 속성은 무시', () => {
  try {
    setStrongOverrides({ strong: { 130: false, 20: true }, third: { 6: 'psychic', 448: '', 3: 'fire' } });
    assert.deepEqual(evolutionRequirement(130), [{ type: 'water', amount: 20 }, { type: 'flying', amount: 10 }]); // 갸라도스 → 보통
    assert.deepEqual(evolutionRequirement(20), [{ type: 'normal', amount: 36 }]); // 레트라 → 센 포켓몬
    assert.deepEqual(evolutionRequirement(6).map(r => r.type), ['fire', 'flying', 'psychic']); // 리자몽 도전 속성 바꿈
    assert.deepEqual(evolutionRequirement(448).map(r => r.type), ['fighting', 'steel']); // 루카리오 도전 속성 없앰
    assert.deepEqual(evolutionRequirement(3).map(r => r.type), ['grass', 'poison', 'fire']); // 불꽃(한자)은 3과목이 되므로 가능
    setStrongOverrides({ strong: {}, third: { 3: 'bug' } }); // 벌레 = 풀과 같은 상식 → 3과목이 안 돼서 무시
    assert.deepEqual(evolutionRequirement(3).map(r => r.type), ['grass', 'poison']);
    assert.ok(!isValidThird(3, 'bug') && isValidThird(3, 'fire'));
  } finally {
    setStrongOverrides(null);
  }
  assert.deepEqual(evolutionRequirement(6).map(r => r.type), ['fire', 'flying', 'dark']);
});

test('이로치: 볼에서 확률로 나오고, 이미 가진 포켓몬이어도 이로치는 새로 얻고, 진화하면 이로치 도감에 추가', () => {
  const bank = makeBank();
  const state = started(bank); // 나오하
  const open = (kind: 'poke' | 'shiny', chance: number, random: () => number) => {
    state.balls.push({ id: 'bx' + state.balls.length, kind });
    const id = state.balls[state.balls.length - 1].id;
    return applyAction(state, { type: 'openBall', ballId: id }, { ...ctx(bank), random, shinyChance: { poke: chance } }) as { caught: number; shiny: boolean; duplicate: boolean; message: string };
  };
  // 확률 0%면 이로치 없음
  assert.equal(open('poke', 0, () => 0.5).shiny, false);
  // 확률 100%면 항상 이로치: 새로 얻고 이로치 도감에 들어감, 기본 도감에는 이로치 칸이 따로 섞이지 않음
  const r = open('poke', 100, () => 0.5);
  assert.equal(r.shiny, true);
  assert.ok(state.owned.some(p => p.shiny && p.species === r.caught));
  assert.ok(state.shiny!.includes(r.caught));
  assert.match(r.message, /이로치다/);
  // 이미 기본 모습을 가진 포켓몬이 이로치로 나와도 새로 얻음(스탯 보너스 아님)
  const before = { ...state.stats };
  const starterShiny = open('shiny', 0, () => 0); // 이로치 볼: 가진 포켓몬의 첫 모습 → 이로치 확정 (나오하 계열은 아직 이로치 없음)
  assert.equal(starterShiny.shiny, true);
  assert.equal(starterShiny.caught, 906);
  assert.equal(starterShiny.duplicate, false);
  assert.deepEqual(state.stats, before);
  assert.equal(state.owned.filter(p => p.species === 906).length, 2); // 기본 + 이로치 각각 한 마리
  // 같은 이로치가 또 나오면 우정 보너스
  const again = open('shiny', 0, () => 0);
  assert.equal(again.duplicate, true);
  // 이로치를 진화시키면 진화한 모습도 이로치 도감에 (기본 도감에는 안 들어감)
  const shinyP = state.owned.find(p => p.shiny && p.species === 906)!;
  state.stats.grass = 100;
  state.hearts = { 906: 30 };
  applyAction(state, { type: 'evolve', uid: shinyP.uid, target: 907 }, ctx(bank));
  assert.equal(shinyP.species, 907);
  assert.ok(state.shiny!.includes(907) && state.shiny!.includes(906));
  assert.ok(!state.dex.includes(907));
});

test('이로치 확률: 기본값(몬스터볼 2·슈퍼볼 4·하이퍼볼 7·마스터볼·럭셔리볼·희귀 볼 12)', () => {
  assert.deepEqual(SHINY_CHANCE_DEFAULT, { poke: 2, great: 4, ultra: 7, master: 12, luxury: 12, rare: 12 });
});

test('이로치 볼: 보호자 큰 선물과 일일미션 상자에 들어 있고, 시뮬레이션 도우미가 이로치를 넣는다', () => {
  assert.ok((GIFT_SIZES.large.options as readonly string[]).includes('shinyBall'));
  assert.ok(DAILY_BOX_TABLE.some(r => r.item.kind === 'ball' && r.item.ball === 'shiny'));
  const bank = makeBank();
  const state = started(bank);
  assert.equal(simGiveShinies(state, '2026-10-02'), 1);
  assert.equal(simGiveShinies(state, '2026-10-02'), 0);
  assert.ok(state.owned.some(p => p.shiny) && state.owned.some(p => !p.shiny));
  const n = state.balls.length;
  assert.equal(simGiveBalls(state), Object.keys(BALLS).length);
  assert.equal(state.balls.length, n + Object.keys(BALLS).length);
});

test('메가 도감: 포켓로그의 메가 모습 96개, 키가 겹치지 않고 모두 도감에 있는 포켓몬이며 지금은 0마리', () => {
  assert.equal(TOTAL_MEGAS, 96);
  assert.equal(new Set(MEGAS.map(m => m.key)).size, 96);
  for (const m of MEGAS) {
    assert.ok(species(m.species), `${m.name}: 도감 번호`);
    assert.ok(m.name.startsWith('메가'), m.name);
    assert.ok(m.art > 10000, `${m.name}: PokeAPI 그림 번호`);
    assert.ok(megaImages(m.art)[0].endsWith(`/mega/${m.art}.png`));
  }
  assert.equal(megaByKey('6-mega-x')?.name, '메가리자몽X');
  assert.equal(megaByKey('978-mega-curly')?.name, '메가싸리용(젖힌 모습)');
  const state = started(makeBank());
  assert.deepEqual(childView(state, makeBank(), '2026-10-02').megas, []);
});

test('아이템: 가방에 모았다가 포켓몬에게 먹이면 적힌 속성이 모두 오른다', () => {
  const bank = makeBank();
  const state = started(bank); // 나오하(풀) — 다음 진화 나로테(풀 36)
  state.potions.push({ id: 'm1', kind: 'apple' }, { id: 'm2', kind: 'potion' }, { id: 'm3', kind: 'apple' });
  const uid = state.owned[0].uid;
  const r = applyAction(state, { type: 'usePotion', potionId: 'm1', uid }, ctx(bank)) as unknown as { types: string[]; amount: number };
  assert.deepEqual([...r.types], ['grass', 'bug', 'ground']); // 사과열매 = 자연 계열
  assert.deepEqual([state.stats.grass, state.stats.bug, state.stats.ground, state.stats.water], [5, 5, 5, 0]);
  assert.throws(() => applyAction(state, { type: 'usePotion', potionId: 'm1', uid }, ctx(bank)), /찾을 수 없어요/);
  applyAction(state, { type: 'usePotion', potionId: 'm2', uid }, ctx(bank)); // 상처약 = 모든 속성 +5
  assert.ok(Object.values(state.stats).every(v => v >= 5));
  assert.equal(state.stats.grass, 10);
  applyAction(state, { type: 'usePotion', potionId: 'm3', uid }, ctx(bank));
  assert.equal(state.stats.grass, 15);
  assert.equal(state.potions.length, 0);
  assert.throws(() => applyAction(state, { type: 'evolve', uid, target: 907 }, ctx(bank)), /부족/); // 아이템 3개(15)만으로는 모자람
  state.stats = { ...state.stats, grass: 36 }; // 문제를 더 풀어서 36이 됨
  state.hearts = { 906: 30 }; // 모험 팀으로 친해짐
  applyAction(state, { type: 'evolve', uid, target: 907 }, ctx(bank));
  assert.equal(state.owned[0].species, 907);
});

test('탐험 보상 아이템은 주로 그 과목 열매', () => {
  const bank = makeBank(1);
  let own = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const state = started(bank);
    const q = bank.questions.find(q => q.subject === '상식')!;
    applyAction(state, { type: 'answer', mode: 'explore', questionId: q.id, choice: q.answer }, ctx(bank, seeded(seed)));
    const r = applyAction(state, { type: 'exploreReward', subject: '상식', pick: 0 }, ctx(bank, seeded(seed))) as unknown as { items: { potion: string }[] };
    own += r.items.filter(i => i.potion === 'apple').length;
  }
  assert.ok(own / 120 > 0.45 && own / 120 < 0.75, `상식 열매 비율 ${own / 120}`);
});

test('경험치를 스탯으로 바꾸기: 경험치 50 → 고른 속성 +5, 모은 경험치 기록은 남는다', () => {
  const bank = makeBank();
  const state = started(bank);
  state.exp = 120;
  assert.throws(() => applyAction(state, { type: 'exchangeExp', statType: 'nope' as never }, ctx(bank)), GameError);
  applyAction(state, { type: 'exchangeExp', statType: 'grass' }, ctx(bank));
  applyAction(state, { type: 'exchangeExp', statType: 'grass' }, ctx(bank));
  assert.equal(state.stats.grass, EXP_EXCHANGE.amount * 2);
  assert.throws(() => applyAction(state, { type: 'exchangeExp', statType: 'grass' }, ctx(bank)), GameError);
  const view = childView(state, bank, '2026-09-26');
  assert.equal(view.exp, 120 - EXP_EXCHANGE.cost * 2);
  assert.equal(view.expTotal, 120);
});

test('경험치 선물: 모은 경험치 500마다 볼 하나, 스탯으로 바꿔 써도 줄지 않는다', () => {
  const bank = makeBank();
  const state = started(bank);
  state.exp = EXP_GIFT.every - 10;
  assert.throws(() => applyAction(state, { type: 'expGift', pick: 0 }, ctx(bank)), GameError);
  applyAction(state, { type: 'exchangeExp', statType: 'fire' }, ctx(bank));
  state.exp += 10 + EXP_GIFT.every; // 모은 경험치 1000: 선물 2개
  assert.equal(childView(state, bank, '2026-09-26').expGifts.ready, 2);
  const balls = state.balls.length;
  applyAction(state, { type: 'expGift', pick: 1 }, ctx(bank));
  applyAction(state, { type: 'expGift', pick: 2 }, ctx(bank));
  assert.equal(state.balls.length, balls + 2);
  assert.equal(state.balls.at(-1)!.kind, EXP_GIFT.ball);
  assert.throws(() => applyAction(state, { type: 'expGift', pick: 0 }, ctx(bank)), GameError);
  assert.equal(childView(state, bank, '2026-09-26').expGifts.left, EXP_GIFT.every);
});

test('예전 기록(새 항목 없음)도 그대로 읽힌다', () => {
  const bank = makeBank();
  const old = started(bank) as GameState & { expSpent?: number; expGifts?: number };
  old.exp = 730; old.stats.grass = 12;
  delete old.expSpent; delete old.expGifts;
  const view = childView(old, bank, '2026-09-26');
  assert.equal(view.exp, 730);
  assert.equal(view.stats.grass, 12);
  assert.equal(view.expGifts.ready, 1);
});

test('포켓로그 시도 횟수: 하루 1번, 다음 날 다시 1번', () => {
  const state = initialState();
  assert.equal(battleStartsLeft(state, '2026-09-27'), 1);
  assert.equal(startBattle(state, '2026-09-27'), true);
  assert.equal(battleStartsLeft(state, '2026-09-27'), 0);
  assert.equal(startBattle(state, '2026-09-27'), false);
  assert.equal(battleStartsLeft(state, '2026-09-28'), 1);
  assert.equal(startBattle(state, '2026-09-28'), true);
  assert.deepEqual(state.battle, { date: '2026-09-28', starts: 1 });
});

test('포켓로그 기록: 날짜별 최고 웨이브·플레이 시간·새 게임 횟수, 오래된 날은 지움', () => {
  const state = initialState();
  startBattle(state, '2026-09-27');
  recordBattleProgress(state, '2026-09-27', 3, 60);
  recordBattleProgress(state, '2026-09-27', 12, 60);
  recordBattleProgress(state, '2026-09-27', 5, 999); // 낮은 웨이브는 무시, 초는 한도까지만
  assert.deepEqual(state.battleLog!['2026-09-27'], { maxWave: 12, seconds: 240, starts: 1 });
  for (let d = 1; d <= 40; d++) recordBattleProgress(state, shiftDate('2026-10-01', d - 1), 1, 10);
  const list = battleLogList(state);
  assert.equal(list.length, ACTIVITY_LOG_DAYS);
  assert.equal(list[0].date, shiftDate('2026-10-01', 39));
  assert.ok(!state.battleLog!['2026-09-27']);
});

test('시뮬레이션 날짜 넘기기: 월말·연말을 넘어가도 하루씩 더한다', () => {
  assert.equal(shiftDate('2026-09-28', 0), '2026-09-28');
  assert.equal(shiftDate('2026-09-30', 1), '2026-10-01');
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDate('2028-02-28', 2), '2028-03-01');
  assert.equal(shiftDate('이상한 값', 1), '이상한 값');
});

test('일일미션 사탕: 다 풀면 파트너에게 3개, 모두 맞히면 5개, 하루 한 번, 게임이 가져가면 목록에서 빠진다', () => {
  const bank = makeBank(8);
  for (const [correctCount, amount] of [[18, DAILY_CANDY.perfect], [17, DAILY_CANDY.finished], [10, DAILY_CANDY.finished]] as const) {
    const state = started(bank);
    assert.equal(candySummary(state, '2026-09-26').today, null);
    playDaily(state, bank, ctx(bank), (_, i) => i < correctCount);
    const c = candySummary(state, '2026-09-26');
    assert.equal(c.today?.amount, amount, `${correctCount}개 맞힘`);
    assert.equal(c.today?.species, state.owned[0].species);
    assert.equal(c.pending, amount);
    assert.equal(c.sent, amount);
    assert.equal(state.candy!.pending.length, 1);
    // 게임이 가져가면 목록에서 빠지고, 보낸 총량은 남는다
    assert.equal(claimCandy(state, [state.candy!.pending[0].id, '없는번호']), 1);
    assert.equal(candySummary(state, '2026-09-26').pending, 0);
    assert.equal(candySummary(state, '2026-09-26').sent, amount);
    // 다음 날은 아직 안 줌
    assert.equal(candySummary(state, '2026-09-27').today, null);
  }
});

test('약점 영역: 최근 5번 중 2번 이상 틀리면 약점, 4번 이상 맞히면 보통으로 돌아온다', () => {
  assert.equal(isWeakArea(undefined), false);
  assert.equal(isWeakArea({ recent: 'ox', correct: 1, wrong: 1 }), false);
  assert.equal(isWeakArea({ recent: 'oxx', correct: 1, wrong: 2 }), true);
  assert.equal(isWeakArea({ recent: 'xxoooo', correct: 4, wrong: 2 }), false); // 최근 5번은 xoooo → 틀림 1번
  assert.equal(isWeakArea({ recent: 'xoxoo', correct: 3, wrong: 2 }), true);
  assert.equal(WEAK_AREA.recent, 5);
});

test('영역별 성적: 첫 시도 결과만 기록하고, 약점 영역 문제가 다음 미션에 먼저 나온다 (과목당 최대 2개)', () => {
  const bank = makeBank(8); // 과목마다 영역0/영역1 이 4문제씩
  const state = started(bank);
  const c = ctx(bank);
  // 오늘 미션: 수학 문제 중 영역0 문제는 모두 첫 시도에 틀리고(그 뒤 맞힘), 나머지는 맞힘
  ensureDaily(state, bank, c.today, c.random);
  for (const id of state.daily!.questionIds) {
    const q = bank.questions.find(q => q.id === id)!;
    const wrongFirst = q.subject === '수학' && q.area === '영역0';
    if (wrongFirst) applyAction(state, { type: 'answer', mode: 'daily', questionId: id, choice: (q.answer + 1) % 5 }, c);
    applyAction(state, { type: 'answer', mode: 'daily', questionId: id, choice: q.answer }, c);
  }
  const math = areaReport(state, bank).find(r => r.subject === '수학')!;
  const a0 = math.areas.find(a => a.area === '영역0')!;
  assert.ok(a0.wrong >= 1 && a0.correct === 0, '첫 시도에 틀린 것은 오답으로만 기록');
  // 탐험에서도 영역0을 한 번 더 틀려 약점으로 만든다
  const q0 = bank.questions.find(q => q.subject === '수학' && q.area === '영역0' && !state.daily!.questionIds.includes(q.id))!;
  applyAction(state, { type: 'answer', mode: 'explore', questionId: q0.id, choice: (q0.answer + 1) % 5 }, c);
  assert.equal(areaReport(state, bank).find(r => r.subject === '수학')!.areas.find(a => a.area === '영역0')!.weak, true);
  // 다음 날 미션: 수학 3문제 중 영역0 문제가 최대 2개(복습 문제 제외)까지 먼저 들어간다
  const tomorrow = { ...c, today: '2026-09-27' };
  ensureDaily(state, bank, tomorrow.today, tomorrow.random);
  const mathIds = state.daily!.questionIds.map(id => bank.questions.find(q => q.id === id)!).filter(q => q.subject === '수학');
  assert.equal(mathIds.length, 3);
  assert.ok(mathIds.filter(q => q.area === '영역0').length >= 1, '약점 영역 문제가 들어간다');
  const view = childView(state, bank, '2026-09-26');
  assert.ok(view.explore.length === 6);
});

test('퀴즈 시간·활동 요약: 1분마다 보낸 초를 하루 단위로 모으고, 그래프용 목록은 빈 날을 0으로 채운다', () => {
  const bank = makeBank(3);
  const state = started(bank);
  const c = ctx(bank);
  applyAction(state, { type: 'quizTime', seconds: 60 }, c);
  applyAction(state, { type: 'quizTime', seconds: 999 }, c); // 한 번에 120초까지만
  assert.equal(state.quizLog!['2026-09-26'].seconds, 180);
  const list = activityList(state, '2026-09-28', 7);
  assert.equal(list.length, 7);
  assert.equal(list[0].date, '2026-09-22');
  assert.equal(list.find(d => d.date === '2026-09-26')!.quizSeconds, 180);
  assert.equal(list[6].quizSeconds, 0);
  // 포켓로그 하루 제한
  recordBattleProgress(state, '2026-09-28', 3, 120);
  assert.equal(battleTimeUp(state, '2026-09-28', 0), false); // 제한 없음
  assert.equal(battleTimeUp(state, '2026-09-28', 2), true);
  assert.equal(battleTimeUp(state, '2026-09-28', 30), false);
});

test('포켓로그 최고 레벨: 계열별로 가장 높은 레벨만 남고, 이상한 값은 무시한다', () => {
  const state = initialState();
  recordBattleLevels(state, [{ starter: 906, level: 12 }, { starter: 81, level: 7 }]);
  recordBattleLevels(state, [{ starter: 906, level: 9 }, { starter: 81, level: 15 }, { starter: 0, level: 3 }, { starter: 25, level: 999 }]);
  assert.deepEqual(state.battleLevels, { 906: 12, 81: 15 });
  const bank = makeBank(3);
  assert.equal(childView(state, bank, '2026-09-26').battleLevels[81], 15);
});

test('포켓로그 이벤트 이로치는 도감에 한 번씩만 남고 아이 화면에 보인다', () => {
  const state = initialState();
  assert.equal(recordShiny(state, [25, 25, 0, 99999, 6]), 2);
  assert.equal(recordShiny(state, [25]), 0);
  assert.deepEqual(state.shiny, [25, 6]);
  assert.deepEqual(childView(state, makeBank(3), '2026-09-26').shiny, [25, 6]);
});

test('이로치 이름은 색 이름 + 포켓몬 이름이고, 모든 포켓몬에 색 이름이 있다', () => {
  assert.equal(shinyName(384), shinyColor(384) + '레쿠쟈');
  assert.equal(shinyColor(384), '블랙');
  assert.equal(shinyColor(130), '레드');
  for (let id = 1; id <= TOTAL_SPECIES; id++) assert.notEqual(shinyColor(id), '이로치', `#${id} 색 이름 없음`);
});

const at = (today: string): Context => ({ bank: null, today, now: today + 'T00:00:00Z', random: seeded() });

test('보호자 선물: 한도 안에서 보내고, 아이가 열어 고른 것을 받고, 답장은 한 번만', () => {
  const state = initialState();
  applyAction(state, { type: 'starter', species: 912 }, at('2026-09-28'));
  const today = '2026-09-28', now = '2026-09-28T10:00:00.000Z';
  const g1 = sendGift(state, { from: 'mom', reason: '숙제', size: 'small', letter: '잘했어' }, today, now);
  sendGift(state, { from: 'dad', reason: '독서', size: 'small' }, today, now);
  assert.throws(() => sendGift(state, { from: 'mom', reason: '운동', size: 'small' }, today, now), /하루에 2개/);
  const g2 = sendGift(state, { from: 'mom', reason: '정리정돈', size: 'medium' }, today, now);
  const g3 = sendGift(state, { from: 'dad', reason: '운동', size: 'large' }, today, now);
  // 큰 선물은 주 1개: 같은 주 다른 날에도 못 보냄, 다음 주 월요일부터 가능
  assert.throws(() => sendGift(state, { from: 'dad', reason: '운동', size: 'large' }, '2026-10-04', now), /일주일에 1개/);
  assert.ok(sendGift(state, { from: 'dad', reason: '운동', size: 'large' }, '2026-10-05', now));
  assert.deepEqual(giftCounts(state, today), { small: 2, medium: 1, large: 1 });
  // 열기: 경험치
  const expBefore = state.exp;
  const r1 = applyAction(state, { type: 'openGift', id: g1.id, choice: 'exp' }, at(today)) as { gift: { opened: { got: string } | null } };
  assert.equal(state.exp, expBefore + GIFT_EXP);
  assert.ok(r1.gift.opened);
  assert.throws(() => applyAction(state, { type: 'openGift', id: g1.id, choice: 'exp' }, at(today)), /이미 연/);
  // 크기에 없는 선택은 거부, 열매는 계열 필요
  assert.throws(() => applyAction(state, { type: 'openGift', id: g2.id, choice: 'exp' }, at(today)), /선물 중 하나/);
  const r2 = applyAction(state, { type: 'openGift', id: g2.id, choice: 'candy' }, at(today)) as { gift: { opened: { got: string } } };
  assert.match(r2.gift.opened.got, /사탕 3개/);
  assert.equal(state.candy?.pending.reduce((s, c) => s + c.amount, 0), GIFT_CANDY);
  // 큰 선물: 배틀 추가권 → 하루 횟수를 다 쓴 뒤 한 번 더
  applyAction(state, { type: 'openGift', id: g3.id, choice: 'ticket' }, at(today));
  assert.equal(battleTickets(state), 1);
  assert.equal(startBattle(state, today), true); // 하루 1번
  assert.equal(battleStartsLeft(state, today), 0);
  assert.equal(battleStartsAvailable(state, today), 1);
  assert.equal(startBattle(state, today), true); // 추가권 사용
  assert.equal(battleTickets(state), 0);
  assert.equal(startBattle(state, today), false);
  // 답장: 한 번만, 30자 제한
  applyAction(state, { type: 'replyGift', id: g1.id, sticker: 'thanks', text: 'a'.repeat(50) }, at(today));
  assert.equal(state.gifts![0].reply?.text.length, REPLY_TEXT_MAX);
  assert.throws(() => applyAction(state, { type: 'replyGift', id: g1.id, sticker: 'love' }, at(today)), /한 번만/);
  assert.equal(unseenReplies(state), 1);
  assert.equal(markRepliesSeen(state), 1);
  assert.equal(unseenReplies(state), 0);
  const view = childView(state, makeBank(3), today);
  assert.equal(view.gifts[0].id, state.gifts![state.gifts!.length - 1].id); // 최근 것부터
  assert.equal(view.battle.tickets, 0);
});

test('선물 열매는 고른 계열 열매가 가방에 들어가고, 몬스터볼은 볼 번호를 돌려준다', () => {
  const state = initialState();
  applyAction(state, { type: 'starter', species: 906 }, at('2026-09-28'));
  const a = sendGift(state, { from: 'mom', reason: '숙제', size: 'small' }, '2026-09-28', 'now');
  assert.throws(() => applyAction(state, { type: 'openGift', id: a.id, choice: 'berry' }, at('2026-09-28')), /계열/);
  applyAction(state, { type: 'openGift', id: a.id, choice: 'berry', subject: '수학' }, at('2026-09-28'));
  assert.equal(state.potions[0].kind, 'thunder');
  const b = sendGift(state, { from: 'mom', reason: '숙제', size: 'large' }, '2026-09-28', 'now');
  const r = applyAction(state, { type: 'openGift', id: b.id, choice: 'ball' }, at('2026-09-28')) as { ballIds: string[] };
  assert.equal(r.ballIds.length, 1);
  assert.equal(state.balls[0].id, r.ballIds[0]);
  assert.equal(state.balls[0].kind, 'poke');
});

test('포켓로그의 이로치 색 이름 파일이 퀴즈 앱과 같고, 메가 이름에 이모지가 붙는다', () => {
  const a = readFileSync(new URL('./data/shiny-colors.json', import.meta.url), 'utf8');
  const b = readFileSync(new URL('../battle/src/data/quiz-shiny-colors.json', import.meta.url), 'utf8');
  assert.equal(a, b);
  assert.ok(megaLabel(MEGAS[0]).endsWith(MEGAS[0].name));
  assert.notEqual(megaLabel(MEGAS[0]), MEGAS[0].name);
});

/** 행동 하나를 적용하고 그 활동 기록을 돌려줌 */
function logged(state: GameState, action: Parameters<typeof applyAction>[1], c: Context): { result: ReturnType<typeof applyAction>; log: LogEntry[] } {
  const before = beforeAction(state, action, c.today);
  const result = applyAction(state, action, c);
  return { result, log: afterAction(before, state, action, result, c) };
}

test('활동 기록: 문제 풀이에 고른 답·정답 여부·몇 번째 시도인지, 스탯 변화가 남는다', () => {
  const bank = makeBank();
  const c = ctx(bank);
  const state = started(bank);
  ensureDaily(state, bank, c.today, c.random);
  const q = bank.questions.find(q => state.daily!.questionIds.includes(q.id))!;
  const wrongChoice = (q.answer + 1) % 5;
  const first = logged(state, { type: 'answer', mode: 'daily', questionId: q.id, choice: wrongChoice }, c);
  const a1 = first.log.find(e => e.kind === 'answer')!.data;
  assert.equal(a1.correct, false);
  assert.equal(a1.attempt, 1);
  assert.equal(a1.chosen, wrongChoice + 1);
  assert.equal(a1.answer, q.answer + 1);
  assert.equal(a1.mode, '일일미션');
  assert.equal(a1.prompt, q.prompt);
  assert.equal(first.log.some(e => e.kind === 'stat'), false); // 틀리면 스탯 변화 없음
  const second = logged(state, { type: 'answer', mode: 'daily', questionId: q.id, choice: q.answer }, c);
  const a2 = second.log.find(e => e.kind === 'answer')!.data;
  assert.equal(a2.correct, true);
  assert.equal(a2.attempt, 2);
  const stat = second.log.find(e => e.kind === 'stat')!.data;
  assert.equal((stat.deltas as Record<string, number>)[TYPE_INFO[q.type].label], 5);
  assert.equal(stat.exp, 10);
});

test('활동 기록: 볼에서 얻은 포켓몬(얻은 방법)과 진화, 시작 파트너', () => {
  const bank = makeBank();
  const c = ctx(bank);
  const state = initialState();
  const start = logged(state, { type: 'starter', species: 906 }, c);
  assert.equal(start.log.find(e => e.kind === 'pokemon')!.data.how, '시작 파트너');
  state.balls.push({ id: 'bx', kind: 'poke' });
  const ball = logged(state, { type: 'openBall', ballId: 'bx' }, c);
  assert.ok(ball.log.some(e => e.kind === 'ball' && e.data.ballLabel === '몬스터볼'));
  const got = ball.log.find(e => e.kind === 'pokemon');
  if (got) assert.equal(got.data.how, '몬스터볼 열기');
  state.stats.grass = 41;
  state.hearts = { 906: 30 };
  const evo = logged(state, { type: 'evolve', uid: state.owned[0].uid, target: 907 }, c);
  const e = evo.log.find(e => e.kind === 'evolve')!.data;
  assert.equal(e.to, 907);
  assert.equal(e.from, 906);
  assert.ok(evo.log.some(e => e.kind === 'stat' && (e.data.deltas as Record<string, number>)[TYPE_INFO.grass.label] === -36));
});

test('아이 기록 내보내기: 판·하루 활동·보유 포켓몬이 들어가고 모든 항목의 시작일이 적힌다', () => {
  const bank = makeBank();
  const state = started(bank);
  state.quizLog = { '2026-09-25': { seconds: 600, answered: 18, correct: 15 } };
  const rows = [
    { seq: 1, at: '2026-09-26T01:00:00Z', date: '2026-09-26', kind: 'battleStart', data: { date: '2026-09-26' } },
    { seq: 2, at: '2026-09-26T01:20:00Z', date: '2026-09-26', kind: 'battleRun', data: { runId: String(Date.parse('2026-09-26T01:20:00Z')), endedAt: '2026-09-26T01:20:00Z', wave: 12, result: '게임 오버', party: [{ species: 25, level: 30, shiny: false }] } },
    { seq: 3, at: '2026-09-26T01:10:00Z', date: '2026-09-26', kind: 'revive', data: { mode: '게임 오버 화면' } },
    { seq: 4, at: '2026-09-26T02:00:00Z', date: '2026-09-26', kind: 'day', data: daySummary(state, '2026-09-26').data },
  ];
  const file = buildChildExport({ state, rows, since: '2026-09-26', appVersion: 'test', exportedAt: '2026-09-27T00:00:00Z' });
  assert.equal(file.포켓로그.판.length, 1);
  assert.equal(file.포켓로그.판[0].startTime, '2026-09-26 10:00:00');
  assert.equal(file.포켓로그.판[0].wave, 12);
  assert.equal(file.포켓로그.판[0].reviveUsed, 1);
  assert.equal(file.포켓로그.판[0].party[0].name, '피카츄');
  assert.ok(file.하루활동.some(d => d.date === '2026-09-25' && d.quizSeconds === 600));
  assert.equal(file.성장.보유포켓몬.length, 1);
  
  const since = (item: string) => file.기록시작.항목별.find(i => i.item === item)!.since;
  assert.equal(since('포켓로그 새 판 시작'), '2026-09-26');
  assert.match(since('진화 기록'), /이후 아직 없음/);
  assert.doesNotThrow(() => JSON.stringify(file));
});

test('영역별 성적: 영역 기능 전에 푼 문제도 지난 기록으로 한 번 채워진다', () => {
  const bank = makeBank();
  const state = started(bank);
  const kor = bank.questions.filter(q => q.subject === '국어');
  state.banks[bank.id] = { solved: kor.slice(0, 3).map(q => q.id), wrong: { [kor[0].id]: 2, [kor[4].id]: 1 }, review: {}, subjectRewards: [], masterClaimed: false };
  const report = areaReport(state, bank).find(r => r.subject === '국어')!.areas;
  const correct = report.reduce((n, a) => n + a.correct, 0);
  const wrong = report.reduce((n, a) => n + a.wrong, 0);
  assert.equal(correct, 3);
  assert.equal(wrong, 3);
  assert.ok(report.every(a => !a.weak)); // 언제 틀렸는지 몰라 약점으로는 잡지 않음
  // 한 번만: 이후 풀이는 그대로 쌓이고 다시 채우지 않음
  const before = JSON.stringify(state.banks[bank.id].areas);
  assert.equal(seedAreaStats(state, bank), false);
  assert.equal(JSON.stringify(state.banks[bank.id].areas), before);
});

test('아이 기록 내보내기: 게임 오버 화면에서 쓴 부활권은 그 판에 붙고, 처음부터 다시 하기 앞 기록은 나뉘고, 모르는 포켓몬 번호도 견딘다', () => {
  const state = started(makeBank());
  state.battleLevels = { 2019: 12 } as Record<number, number>; // 퀴즈 도감에 없는 번호
  const run = (id: string, at: string, wave: number) => ({ at, kind: 'battleRun', data: { runId: id, endedAt: at, wave, result: '게임 오버', party: [{ species: 2019, level: 9, shiny: false }] } });
  const rows = [
    { seq: 1, at: '2026-09-20T01:00:00Z', date: '2026-09-20', kind: 'answer', data: { prompt: '옛 기록' } },
    { seq: 2, at: '2026-09-21T01:00:00Z', date: '2026-09-21', kind: 'reset', data: {} },
    { seq: 3, ...run('1', '2026-10-01T01:00:00Z', 10), date: '2026-10-01' },
    // 판 B: 게임 오버 화면에서 부활(01:20) → 진짜 끝(01:40)
    { seq: 4, at: '2026-10-02T01:20:00Z', date: '2026-10-02', kind: 'revive', data: { mode: '게임 오버 화면', runId: null } },
    { seq: 5, ...run('2', '2026-10-02T01:40:00Z', 20), date: '2026-10-02' },
    { seq: 6, ...run('2', '2026-10-02T01:40:00Z', 20), date: '2026-10-02' }, // 같은 판이 또 올라옴
  ];
  const file = buildChildExport({ state, rows, since: '2026-09-20', appVersion: 't', exportedAt: '2026-10-03T00:00:00Z' });
  assert.equal(file.포켓로그.판.length, 2);
  assert.deepEqual(file.포켓로그.판.map(r => r.reviveUsed), [0, 1]);
  assert.equal(file.포켓로그.판[0].party[0].name, '#2019');
  assert.equal(file.문제풀이.length, 0); // 다시 하기 앞의 문제 풀이는 본문에서 빠짐
  assert.equal(file.처음부터다시하기_이전기록?.기록.length, 1);
  assert.doesNotThrow(() => JSON.stringify(file));
});

test('활동 기록: 어제 미션의 시도 횟수는 오늘 풀이에 이어지지 않는다', () => {
  const bank = makeBank();
  const c = ctx(bank);
  const state = started(bank);
  ensureDaily(state, bank, c.today, c.random);
  const q = bank.questions.find(q => state.daily!.questionIds.includes(q.id))!;
  state.daily!.tries[q.id] = 2;
  const action = { type: 'answer' as const, mode: 'daily' as const, questionId: q.id, choice: q.answer };
  assert.equal(beforeAction(state, action, c.today).tries, 2);
  assert.equal(beforeAction(state, action, '2026-09-27').tries, 0); // 날짜가 달라진 뒤의 풀이
});

// ---------- 기간 한정 이벤트: 레인보우 컬러체인지 ----------
const RB = LIMITED_EVENTS.find(e => e.kind === 'rainbow')!;
const rbCtx = (bank: ActiveBank, today = RB.start, random = seeded()): Context => ({ bank, today, now: today + 'T03:00:00Z', random });
/** 그 과목 탐험 문제를 하나 받아 맞히거나(true) 틀림(false) */
function exploreAnswer(state: GameState, bank: ActiveBank, subject: typeof SUBJECTS[number], ok: boolean, c: Context) {
  const pq = nextExploreQuestion(state, bank, subject, c.today, c.random);
  assert.ok(pq, `${subject} 탐험 문제가 있어야 함`);
  const q = bank.questions.find(q => q.id === pq.id)!;
  return applyAction(state, { type: 'answer', mode: 'explore', questionId: q.id, choice: ok ? q.answer : (q.answer + 1) % 5 }, c) as { correct: boolean; rainbow: { kind: string; message: string; count: number; goal: number; stage: string } | null };
}

test('레인보우: 시작 전에는 아무 데도 안 보이고, 기간 중에만 열리며 이로치 확률 5배', () => {
  const bank = makeBank(12);
  const state = started(bank);
  assert.deepEqual(limitedView(state, shiftDate(RB.start, -1), 600), []);
  assert.equal(limitedShinyMultiplier(shiftDate(RB.start, -1)), 1);
  assert.equal(limitedShinyMultiplier(RB.start), 5);
  assert.equal(limitedShinyMultiplier(RB.end), 5);
  assert.equal(limitedShinyMultiplier(shiftDate(RB.end, 1)), 1);
  assert.throws(() => applyAction(state, { type: 'limitedAccept', id: RB.id }, rbCtx(bank, shiftDate(RB.start, -1))), /열려 있는 이벤트가 아니/);
  const v = limitedView(state, RB.start, 0)[0];
  assert.equal(v.phase, 'active');
  assert.equal(v.seen, false); // 처음 열면 팝업
  assert.equal(v.leftLabel, '2일 0시간');
  // 볼 이로치: 기간 중 몬스터볼 2% → 10%
  const trials = 4000;
  let shinyN = 0;
  const random = seeded(11);
  for (let i = 0; i < trials; i++) {
    state.balls.push({ id: 'z' + i, kind: 'poke' });
    const r = applyAction(state, { type: 'openBall', ballId: 'z' + i }, rbCtx(bank, RB.start, random)) as { shiny: boolean };
    if (r.shiny) shinyN++;
  }
  assert.ok(shinyN / trials > 0.07 && shinyN / trials < 0.13, `이로치 비율 ${shinyN / trials}`);
});

test('레인보우: "나중에"는 팝업만 닫고, 도전해야 조각을 셈. 10문제 연속이면 조각, 틀리면 그 과목만 0부터', () => {
  const bank = makeBank(12);
  const state = started(bank);
  const c = rbCtx(bank);
  applyAction(state, { type: 'limitedSeen', id: RB.id }, c);
  assert.equal(limitedView(state, c.today, 0)[0].seen, true);
  assert.equal(limitedView(state, c.today, 0)[0].accepted, false);
  assert.equal(exploreAnswer(state, bank, '국어', true, c).rainbow, null); // 도전 전에는 안 셈
  applyAction(state, { type: 'limitedAccept', id: RB.id }, c);
  for (let i = 0; i < 3; i++) assert.equal(exploreAnswer(state, bank, '수학', true, c).rainbow?.kind, 'progress');
  const reset = exploreAnswer(state, bank, '수학', false, c).rainbow!;
  assert.equal(reset.kind, 'reset');
  assert.equal(reset.message, '앗! 수학은 처음부터 다시 해 보자. 할 수 있어!');
  assert.equal(limitedView(state, c.today, 0)[0].subjects.find(s => s.subject === '수학')!.streak, 0);
  // 국어는 이미 1문제 맞혔지만 도전 전이라 0부터: 10개 연속
  let last;
  for (let i = 0; i < 10; i++) last = exploreAnswer(state, bank, '국어', true, c).rainbow!;
  assert.equal(last!.kind, 'piece');
  assert.equal(last!.message, '🩷 국어 조각 얻었다! 이제 5개 남았어!');
  const v = limitedView(state, c.today, 0)[0];
  assert.equal(v.pieceCount, 1);
  assert.equal(v.subjects.find(s => s.subject === '국어')!.piece, true);
  // 조각을 얻은 과목은 더 세지 않음
  const more = nextExploreQuestion(state, bank, '국어', c.today, c.random);
  if (more) assert.equal(exploreAnswer(state, bank, '국어', true, c).rainbow, null);
});

test('레인보우: 다 푼 과목은 이미 맞힌 문제로 다시 도전하고, 틀려도 마스터 기록은 그대로', () => {
  const bank = makeBank(6);
  const state = started(bank);
  const prog = { solved: bank.questions.map(q => q.id), wrong: {}, review: {}, subjectRewards: [...SUBJECTS], masterClaimed: true };
  state.banks[bank.id] = prog;
  const c = rbCtx(bank);
  // 도전 전: 다 푼 과목은 탐험 문제가 없음
  assert.equal(nextExploreQuestion(state, bank, '영어', c.today, c.random), null);
  applyAction(state, { type: 'limitedAccept', id: RB.id }, c);
  assert.equal(childView(state, bank, c.today).explore.find(e => e.subject === '영어')!.rainbowReplay, true);
  const solvedBefore = [...state.banks[bank.id].solved];
  const statsBefore = JSON.stringify(state.stats);
  exploreAnswer(state, bank, '영어', true, c);
  const r = exploreAnswer(state, bank, '영어', false, c);
  assert.equal(r.correct, false);
  assert.deepEqual(state.banks[bank.id].solved, solvedBefore); // 마스터 그대로
  assert.deepEqual(state.banks[bank.id].wrong, {});
  assert.equal(JSON.stringify(state.stats), statsBefore); // 다시 풀기는 스탯 보상 없음
  // 6문제뿐인 과목도 10연속 가능 (다시 나옴), 오늘 틀린 문제는 오늘 안 나옴
  let last;
  for (let i = 0; i < 10; i++) last = exploreAnswer(state, bank, '영어', true, c).rainbow!;
  assert.equal(last!.kind, 'piece');
  assert.equal(childView(state, bank, c.today).explore.find(e => e.subject === '영어')!.available, 0);
});

test('레인보우: 6개 완성 → 가진 포켓몬 하나를 골라 이로치로 (이미 이로치는 안 됨, 한 번만)', () => {
  const bank = makeBank(6);
  const state = started(bank);
  state.banks[bank.id] = { solved: bank.questions.map(q => q.id), wrong: {}, review: {}, subjectRewards: [], masterClaimed: false };
  const c = rbCtx(bank, RB.end);
  applyAction(state, { type: 'limitedAccept', id: RB.id }, c);
  simLimited(state, RB.id, 'pieces5', c.today);
  const leftSubject = SUBJECTS.find(s => !state.limited![RB.id].pieces.includes(s))!;
  let last;
  for (let i = 0; i < 9; i++) last = exploreAnswer(state, bank, leftSubject, true, c).rainbow!;
  assert.equal(last!.kind, 'progress');
  last = exploreAnswer(state, bank, leftSubject, true, c).rainbow!;
  assert.equal(last.kind, 'complete');
  assert.equal(last.message, '🌈 무지개 완성! 이로치로 바꿀 포켓몬을 골라 봐!');
  const v = limitedView(state, c.today, 21 * 60)[0];
  assert.equal(v.canChange, true);
  assert.equal(v.remind, false); // 다 모았으면 저녁 안내 없음
  const partner = state.owned[0];
  state.owned.push({ uid: 'sx', species: 25, obtainedAt: c.now, shiny: true });
  assert.throws(() => applyAction(state, { type: 'limitedShinyChange', id: RB.id, uid: 'sx' }, c), /이미 이로치/);
  const r = applyAction(state, { type: 'limitedShinyChange', id: RB.id, uid: partner.uid }, c) as { message: string };
  assert.equal(r.message, `✨ ${iGa(species(partner.species).name)} 반짝반짝 변신했어! 이로치 도감에 들어갔어!`);
  assert.equal(iGa('피카츄'), '피카츄가');
  assert.equal(iGa('이상해꽃'), '이상해꽃이');
  assert.equal(partner.shiny, true);
  assert.equal(state.partner, partner.uid); // 파트너 그대로
  assert.ok(state.shiny!.includes(partner.species));
  assert.throws(() => applyAction(state, { type: 'limitedShinyChange', id: RB.id, uid: partner.uid }, c), /이미 이로치로 바꿨/);
  assert.equal(limitedView(state, c.today, 0)[0].changed!.species, partner.species);
});

test('레인보우: 마지막 날 저녁 9시 안내, 끝나면 정산(3개 이상 사탕 3개, 2개 이하 없음, 안 한 아이는 안 보임)', () => {
  const bank = makeBank(6);
  const mk = (pieces: number) => {
    const state = started(bank);
    applyAction(state, { type: 'limitedAccept', id: RB.id }, rbCtx(bank));
    const lp = state.limited![RB.id];
    lp.pieces = SUBJECTS.slice(0, pieces);
    return state;
  };
  const s3 = mk(3);
  assert.equal(limitedView(s3, RB.end, 20 * 60 + 59)[0].remind, false);
  assert.equal(limitedView(s3, RB.end, 21 * 60)[0].remind, true);
  assert.equal(limitedView(s3, RB.start, 22 * 60)[0].remind, false); // 첫날 밤은 아님
  assert.equal(limitedView(s3, RB.end, 21 * 60)[0].leftLabel, '3시간 0분');
  const after = shiftDate(RB.end, 1);
  const sent = s3.candy?.sent ?? 0;
  assert.equal(syncLimited(s3, after), true);
  assert.equal(syncLimited(s3, after), false); // 한 번만
  assert.deepEqual(s3.limited![RB.id].ended, { date: after, pieces: 3, candy: 3 });
  assert.equal(s3.candy!.sent, sent + 3);
  const v = limitedView(s3, after, 0)[0];
  assert.equal(v.phase, 'ended');
  assert.equal(v.endSeen, false);
  applyAction(s3, { type: 'limitedNotice', id: RB.id, notice: 'end' }, rbCtx(bank, after));
  assert.equal(limitedView(s3, after, 0)[0].endSeen, true);
  const s2 = mk(2);
  syncLimited(s2, after);
  assert.equal(s2.limited![RB.id].ended!.candy, 0);
  // 도전하지 않은 아이: 끝난 뒤에는 카드도 없음, 정산도 없음
  const none = started(bank);
  assert.equal(syncLimited(none, after), false);
  assert.deepEqual(limitedView(none, after, 0), []);
  assert.equal(limitedReport(s3, after)[0].ended!.candy, 3);
  // 끝난 뒤에는 조각을 더 셀 수 없음
  assert.throws(() => applyAction(s2, { type: 'limitedAccept', id: RB.id }, rbCtx(bank, after)), /열려 있는 이벤트가 아니/);
});

test('보호자 이벤트 기록에는 예약된(시작 전) 기간 한정 이벤트도 보인다', () => {
  const state = started(makeBank());
  const before = shiftDate(RB.start, -1);
  const r = limitedReport(state, before);
  assert.ok(r.some(e => e.id === RB.id && e.phase === 'before'));
  assert.deepEqual(limitedView(state, before, 0), []); // 아이 화면에는 여전히 안 보임
});

test('보호자 "팝업 다시 보이게": 본 것·진행 없는 시작은 되돌리고, 진행이 있으면 그대로 둔다', () => {
  const bank = makeBank(12);
  const c = rbCtx(bank);
  // 1) 팝업만 보고 "나중에"
  const a = started(bank);
  applyAction(a, { type: 'limitedSeen', id: RB.id }, c);
  assert.equal(limitedView(a, c.today, 0)[0].seen, true);
  assert.equal(resetLimitedIntro(a, RB.id).changed, true);
  assert.equal(limitedView(a, c.today, 0)[0].seen, false); // 다시 팝업
  assert.equal(limitedView(a, c.today, 0)[0].accepted, false);
  // 2) "도전할래!"까지 눌렀지만 아직 진행 0 → 시작 전으로
  const b = started(bank);
  applyAction(b, { type: 'limitedAccept', id: RB.id }, c);
  exploreAnswer(b, bank, '국어', false, c); // 틀려도 연속 0이면 진행 아님
  assert.equal(resetLimitedIntro(b, RB.id).changed, true);
  assert.equal(limitedView(b, c.today, 0)[0].accepted, false);
  assert.equal(limitedView(b, c.today, 0)[0].seen, false);
  // 3) 연속 1이라도 있으면 되돌리지 않음
  const d = started(bank);
  applyAction(d, { type: 'limitedAccept', id: RB.id }, c);
  exploreAnswer(d, bank, '수학', true, c);
  const before = JSON.stringify(d.limited);
  const r = resetLimitedIntro(d, RB.id);
  assert.equal(r.changed, false);
  assert.match(r.message, /수학 1/);
  assert.equal(JSON.stringify(d.limited), before);
  // 4) 아무도 안 봤으면 그대로
  assert.equal(resetLimitedIntro(started(bank), RB.id).changed, false);
});

test('레인보우 소개 팝업은 기기마다 한 번: 보호자 폰에서 봐도 아이 폰에는 처음처럼', () => {
  const bank = makeBank(6);
  const c = rbCtx(bank);
  const state = started(bank);
  applyAction(state, { type: 'limitedSeen', id: RB.id, device: 'dad-phone' }, c);
  const v = limitedView(state, c.today, 0)[0];
  assert.deepEqual(v.seenDevices, ['dad-phone']);
  assert.equal(v.seenDevices.includes('kid-phone'), false); // 아이 폰은 아직 → 팝업
  applyAction(state, { type: 'limitedSeen', id: RB.id, device: 'dad-phone' }, c);
  assert.deepEqual(limitedView(state, c.today, 0)[0].seenDevices, ['dad-phone']); // 중복 없음
  // 예전처럼 기기 없이 "봤음"만 있는 기록(오늘 아빠가 본 것)도 아이 폰에는 팝업
  const old = started(bank);
  old.limited = { [RB.id]: { seen: c.today, streak: {}, used: {}, pieces: [], pieceAt: {} } };
  assert.deepEqual(limitedView(old, c.today, 0)[0].seenDevices, []);
});

test('레인보우 히든 스테이지: 무지개 규칙은 그대로, 변신 뒤에 황금 조각(20연속)이 열리고 이로치 하나 더', () => {
  const bank = makeBank(6);
  const state = started(bank);
  state.banks[bank.id] = { solved: bank.questions.map(q => q.id), wrong: {}, review: {}, subjectRewards: [...SUBJECTS], masterClaimed: true };
  state.owned.push({ uid: 'x2', species: 25, obtainedAt: 't' });
  const c = rbCtx(bank);
  applyAction(state, { type: 'limitedAccept', id: RB.id }, c);
  // 무지개 규칙은 그대로 10연속
  let r;
  for (let i = 0; i < 10; i++) r = exploreAnswer(state, bank, '국어', true, c).rainbow!;
  assert.equal(r!.kind, 'piece');
  assert.equal(r!.goal, 10);
  simLimited(state, RB.id, 'pieces5', c.today);
  const last = SUBJECTS.find(s => !state.limited![RB.id].pieces.includes(s))!;
  for (let i = 0; i < 10; i++) r = exploreAnswer(state, bank, last, true, c).rainbow!;
  assert.equal(r!.kind, 'complete');
  // 완성했지만 변신 전: 황금은 아직 안 열림, 탐험 연속도 안 셈
  assert.equal(limitedView(state, c.today, 0)[0].gold, null);
  assert.equal(nextExploreQuestion(state, bank, '국어', c.today, c.random), null);
  const first = state.owned[0];
  applyAction(state, { type: 'limitedShinyChange', id: RB.id, uid: first.uid }, c);
  const v = limitedView(state, c.today, 0)[0];
  assert.ok(v.gold);
  assert.equal(v.gold!.introSeen, false); // 열릴 때 팝업
  assert.equal(v.gold!.goal, 20);
  applyAction(state, { type: 'limitedNotice', id: RB.id, notice: 'gold' }, c);
  assert.equal(limitedView(state, c.today, 0)[0].gold!.introSeen, true);
  // 황금: 20연속 (다 푼 과목은 맞힌 문제로 다시), 틀리면 0
  for (let i = 0; i < 5; i++) assert.equal(exploreAnswer(state, bank, '영어', true, c).rainbow!.stage, 'gold');
  const reset = exploreAnswer(state, bank, '영어', false, c).rainbow!;
  assert.equal(reset.kind, 'reset');
  for (let i = 0; i < 19; i++) r = exploreAnswer(state, bank, '수학', true, c).rainbow!;
  assert.equal(r!.kind, 'progress');
  assert.equal(r!.count, 19);
  r = exploreAnswer(state, bank, '수학', true, c).rainbow!;
  assert.equal(r.kind, 'piece');
  assert.equal(r.message, '👑 수학 황금 조각 얻었다! 이제 5개 남았어!');
  assert.deepEqual(state.limited![RB.id].pieces.length, 6); // 무지개 조각은 그대로
  simLimited(state, RB.id, 'gold5', c.today);
  const goldLast = SUBJECTS.find(s => !state.limited![RB.id].gold!.pieces.includes(s))!;
  for (let i = 0; i < 20; i++) r = exploreAnswer(state, bank, goldLast, true, c).rainbow!;
  assert.equal(r!.kind, 'complete');
  assert.equal(r!.message, '👑 황금 조각 완성! 이로치로 바꿀 포켓몬을 하나 더 골라 봐!');
  assert.equal(limitedView(state, c.today, 0)[0].gold!.canChange, true);
  // 이미 이로치(첫 변신)는 안 됨, 다른 포켓몬은 됨, 한 번만
  assert.throws(() => applyAction(state, { type: 'limitedShinyChange', id: RB.id, uid: first.uid, stage: 'gold' }, c), /이미 이로치/);
  applyAction(state, { type: 'limitedShinyChange', id: RB.id, uid: 'x2', stage: 'gold' }, c);
  assert.equal(state.owned.find(p => p.uid === 'x2')!.shiny, true);
  assert.ok(state.shiny!.includes(25));
  assert.throws(() => applyAction(state, { type: 'limitedShinyChange', id: RB.id, uid: 'x2', stage: 'gold' }, c), /이미 이로치로 바꿨/);
  // 황금까지 끝나면 더 세지 않음
  assert.equal(nextExploreQuestion(state, bank, '국어', c.today, c.random), null); // 다 푼 과목은 다시 풀기도 끝
});

test('레인보우 히든 스테이지: 이미 변신을 끝낸 기록은 다음에 열 때 황금 조각이 열림, 끝난 뒤엔 안 열림·정산에 남음', () => {
  const bank = makeBank(6);
  const mk = () => {
    const s = started(bank);
    s.limited = { [RB.id]: { acceptedAt: RB.start, seen: RB.start, streak: {}, used: {}, pieces: [...SUBJECTS], pieceAt: {}, completedAt: RB.start, changed: { uid: 'p1', species: 906, at: 't' } } };
    return s;
  };
  const a = mk();
  assert.equal(syncLimited(a, RB.start), true); // 배포 전에 변신까지 끝낸 아이도 열림
  assert.ok(a.limited![RB.id].gold);
  assert.equal(syncLimited(a, RB.start), false);
  const b = mk();
  syncLimited(b, shiftDate(RB.end, 1)); // 기간이 끝난 뒤에는 열리지 않고 정산만
  assert.equal(b.limited![RB.id].gold, undefined);
  assert.equal(b.limited![RB.id].ended!.goldPieces, undefined);
  syncLimited(a, shiftDate(RB.end, 1));
  assert.equal(a.limited![RB.id].ended!.goldPieces, 0);
  assert.equal(a.limited![RB.id].ended!.candy, 3); // 사탕 규칙은 그대로
});

test('배틀 힘: 열매·상처약을 먹인 계열은 포켓로그 개체값 +1 (기본 15, 최대 31), 속성 스탯은 그대로 오름', () => {
  const bank = makeBank();
  const c = ctx(bank);
  const state = started(bank); // 나오하(906)
  const uid = state.owned[0].uid;
  state.owned.push({ uid: 'sh', species: 907, obtainedAt: 't', shiny: true }); // 같은 계열 이로치(진화형)
  state.owned.push({ uid: 'other', species: 25, obtainedAt: 't' });
  assert.equal(battleIvOf(state, 906), 15);
  state.potions.push({ id: 'm1', kind: 'apple' });
  const grassBefore = state.stats.grass;
  const r = applyAction(state, { type: 'usePotion', potionId: 'm1', uid }, c) as { message: string; battleIv: number };
  assert.equal(r.message, `${species(906).name}에게 먹였어! 에너지 +5, 배틀 힘도 쑥!`);
  assert.equal(state.stats.grass, grassBefore + 5); // 속성 스탯은 그대로 오름
  assert.equal(r.battleIv, 16);
  assert.equal(battleIvOf(state, 907), 16); // 같은 계열(이로치 진화형 포함)은 같은 값
  assert.equal(battleIvOf(state, 25), 15); // 다른 계열은 그대로
  const list = battleIvList(state);
  assert.equal(list['906'], 16);
  assert.equal(list['907'], 16);
  assert.equal(list['25'], 15);
  // 최대 31에서 멈춤
  simBattlePower(state, 'max');
  assert.equal(battleIvOf(state, 906), 31);
  state.potions.push({ id: 'm2', kind: 'potion' });
  const r2 = applyAction(state, { type: 'usePotion', potionId: 'm2', uid: 'other' }, c) as { message: string; battleIv: number };
  assert.equal(r2.battleIv, 31);
  assert.match(r2.message, /배틀 힘은 이미 최고야!/);
});

// ---------- 모험 팀 · 💗 친해짐 · ★ 배틀 힘 (2026-10-03) ----------
/** 일일미션 문제 하나를 맞힘 (오늘 미션에서 아직 안 푼 문제) */
function answerDaily(state: GameState, bank: ActiveBank, c: Context) {
  ensureDaily(state, bank, c.today, c.random);
  const d = state.daily!;
  const id = d.questionIds.find(id => !d.correct.includes(id) && !d.wrong.includes(id))!;
  const q = bank.questions.find(q => q.id === id)!;
  return applyAction(state, { type: 'answer', mode: 'daily', questionId: id, choice: q.answer }, c) as { hearts: { name: string; role: string; amount: number; hearts: number; goal: number; filled: boolean; stars: number }[] };
}

test('모험 팀: 정답 하나에 파트너 💗+2, 친구 💗+1 (일일미션·탐험 모두), 친구가 없으면 파트너만', () => {
  const bank = makeBank();
  const c = ctx(bank);
  const state = started(bank); // 나오하
  const r1 = answerDaily(state, bank, c);
  assert.equal(r1.hearts.length, 1);
  assert.equal(r1.hearts[0].role, 'partner');
  assert.equal(r1.hearts[0].amount, GROWTH_DEFAULT.heartPartner);
  assert.equal(state.hearts![906], 2);
  // 친구 2마리
  state.owned.push({ uid: 'f1', species: 25, obtainedAt: 't' }, { uid: 'f2', species: 1, obtainedAt: 't' }, { uid: 'f3', species: 4, obtainedAt: 't' });
  assert.throws(() => applyAction(state, { type: 'team', friends: ['f1', 'f2', 'f3'] }, c), /2마리까지/);
  assert.throws(() => applyAction(state, { type: 'team', friends: ['nope'] }, c), /만나지 못한/);
  applyAction(state, { type: 'team', friends: ['f1', 'f2'] }, c);
  assert.deepEqual(childView(state, bank, c.today).team, ['f1', 'f2']);
  const r2 = answerDaily(state, bank, c);
  assert.deepEqual(r2.hearts.map(h => [h.role, h.amount]), [['partner', 2], ['friend', 1], ['friend', 1]]);
  assert.deepEqual([state.hearts![906], state.hearts![172], state.hearts![1]], [4, 1, 1]); // 피카츄 계열은 첫 모습 피츄(172) 기준
  // 탐험 정답도 💗
  const q = bank.questions.find(q => !state.daily!.questionIds.includes(q.id))!;
  const r3 = applyAction(state, { type: 'answer', mode: 'explore', questionId: q.id, choice: q.answer }, c) as { hearts: unknown[] };
  assert.equal(r3.hearts.length, 3);
  assert.equal(state.hearts![906], 6);
  // 틀리면 💗 없음
  const q2 = bank.questions.find(x => x.subject === q.subject && x.id !== q.id && !state.daily!.questionIds.includes(x.id))!;
  const wrong = applyAction(state, { type: 'answer', mode: 'explore', questionId: q2.id, choice: (q2.answer + 1) % 5 }, c) as { hearts?: unknown[] };
  assert.equal(wrong.hearts, undefined);
  assert.equal(state.hearts![906], 6);
  // 팀을 바꿔도 모은 💗는 그 계열에 남음
  applyAction(state, { type: 'team', friends: ['f3'] }, c);
  assert.equal(state.hearts![172], 2);
  assert.deepEqual(teamOf(state).friends.map(p => p.uid), ['f3']);
  // 친구를 파트너로 바꾸면 원래 파트너가 그 친구 자리로
  const starter = state.partner!;
  applyAction(state, { type: 'partner', uid: 'f3' }, c);
  assert.equal(state.partner, 'f3');
  assert.deepEqual(state.team, [starter]);
});

test('모험 팀: 💗는 진화에 필요한 만큼 차면 "친해졌어", 다 진화한 포켓몬은 💗 10칸마다 ★+1', () => {
  const bank = makeBank();
  const c = ctx(bank);
  const state = started(bank);
  assert.equal(heartGoalOf(906), 30);
  assert.equal(heartGoalOf(907), 80);
  assert.equal(heartGoalOf(908), 10); // 다 진화하면 ★까지 10칸
  state.hearts = { 906: 29 };
  const r = answerDaily(state, bank, c);
  assert.equal(r.hearts[0].filled, true);
  assert.equal(state.hearts[906], 30); // 진화에 필요한 만큼까지만
  answerDaily(state, bank, c);
  assert.equal(state.hearts[906], 30);
  // 다 진화한 모습 (이미 진화한 포켓몬은 그대로)
  state.owned[0].species = 908;
  state.hearts = { 906: 9 };
  const r2 = answerDaily(state, bank, c);
  assert.equal(r2.hearts[0].stars, 1);
  assert.equal(battleIvOf(state, 908), 16);
  assert.equal(state.hearts[906], 1); // 10칸을 넘은 💗는 다음 칸으로
  // ★이 최대면 💗 칸이 찬 채로 멈춤
  simBattlePower(state, 'max');
  state.hearts = { 906: 9 };
  answerDaily(state, bank, c);
  assert.equal(state.hearts[906], 10);
  assert.equal(battleIvOf(state, 908), GROWTH_DEFAULT.ivMax);
});

test('★ 배틀 힘: 그 포켓몬 속성 에너지 10 → ★+1, 다른 속성·부족·최대면 실패', () => {
  const bank = makeBank();
  const c = ctx(bank);
  const state = started(bank); // 나오하(풀)
  const uid = state.owned[0].uid;
  assert.throws(() => applyAction(state, { type: 'energyStar', uid, statType: 'fire' }, c), /이 포켓몬의 속성/);
  state.stats.grass = 9;
  assert.throws(() => applyAction(state, { type: 'energyStar', uid, statType: 'grass' }, c), /풀 에너지가 1개 더 필요해!/);
  state.stats.grass = 25;
  const r = applyAction(state, { type: 'energyStar', uid, statType: 'grass' }, c) as { message: string; battleIv: number };
  assert.equal(r.message, '⭐ 배틀 힘이 올랐어! 배틀에서 더 세졌어!');
  assert.equal(r.battleIv, 16);
  assert.equal(state.stats.grass, 15);
  simBattlePower(state, 'max');
  assert.throws(() => applyAction(state, { type: 'energyStar', uid, statType: 'grass' }, c), /이미 최고/);
  assert.equal(state.stats.grass, 15);
});

test('경험치 → 에너지 바꾸기는 하루 5번까지, 다음 날 다시', () => {
  const bank = makeBank();
  const c = ctx(bank);
  const state = started(bank);
  state.exp = 1000;
  for (let i = 0; i < GROWTH_DEFAULT.expExchangePerDay; i++) {
    const r = applyAction(state, { type: 'exchangeExp', statType: 'grass' }, c) as { message: string; todayLeft: number };
    assert.equal(r.todayLeft, GROWTH_DEFAULT.expExchangePerDay - 1 - i);
  }
  assert.throws(() => applyAction(state, { type: 'exchangeExp', statType: 'grass' }, c), /오늘은 다 바꿨어. 내일 또 바꿀 수 있어!/);
  assert.equal(expExchangeToday(state, c.today).left, 0);
  assert.equal(state.stats.grass, 25);
  const next = { ...c, today: shiftDate(c.today, 1) };
  assert.equal(expExchangeToday(state, next.today).left, 5);
  applyAction(state, { type: 'exchangeExp', statType: 'grass' }, next);
  assert.equal(state.stats.grass, 30);
});

test('성장 규칙: 3단계 에너지는 보통 100(70+30), 센 포켓몬 120(84+36, 3과목 70+30+20), 보호자가 바꾸면 비율대로', () => {
  assert.deepEqual(evolutionCost(3, false), { single: 100, dual: [70, 30], triple: [58, 25, 17] });
  assert.deepEqual(evolutionCost(3, true), { single: 120, dual: [84, 36], triple: [70, 30, 20] });
  assert.deepEqual(evolutionCost(2, false).dual, [20, 10]); // 2단계는 그대로
  try {
    setGrowthRules({ stage3Energy: 200, heartPartner: 5, evolveHearts2: 10, ivMax: 99 as number });
    assert.equal(growth().stage3Energy, 200);
    assert.equal(growth().ivMax, 31); // 범위를 벗어난 값은 버림
    assert.deepEqual(evolutionCost(3, false).dual, [140, 60]);
    assert.equal(heartGoalOf(906), 10);
    const bank = makeBank();
    const state = started(bank);
    const r = answerDaily(state, bank, ctx(bank));
    assert.equal(r.hearts[0].amount, 5);
  } finally {
    setGrowthRules(null);
  }
  assert.equal(growth().stage3Energy, 100);
});

test('시뮬레이션 도우미: 모험 팀 💗를 진화 직전으로', () => {
  const bank = makeBank();
  const state = started(bank);
  state.owned.push({ uid: 'f1', species: 25, obtainedAt: 't' });
  applyAction(state, { type: 'team', friends: ['f1'] }, ctx(bank));
  assert.equal(simHearts(state, 'near'), 2);
  assert.deepEqual([state.hearts![906], state.hearts![172]], [29, 79]); // 피카츄 계열 첫 모습은 피츄(172), 피카츄→라이츄 = 2→3단계
});

test('기존 기록: 새 항목이 없는 예전 기록도 그대로 읽힌다 (팀·💗·바꾸기 횟수 없음)', () => {
  const bank = makeBank();
  const state = started(bank);
  delete state.team; delete state.hearts; delete state.expExchange;
  const view = childView(state, bank, '2026-10-03');
  assert.deepEqual(view.team, []);
  assert.deepEqual(view.hearts, {});
  assert.equal(view.expExchange.left, 5);
});

// ---------- 나들이 체험보고서 (2026-10-04) ----------
import { OUTING_DEFAULT, firstSentence, stepProblem } from './outing.ts';
function outingStart() {
  const bank = makeBank();
  const state = started(bank);
  const o = createOuting(state, { from: 'mom', place: '동물원', date: '2026-10-05', letter: '재밌었지?', sights: ['호랑이', '기린'], photoIds: [], candidates: [243, 244, 245] }, 't');
  return { bank, state, o };
}
const oc = (bank: ActiveBank, today: string) => ({ ...ctx(bank), today, now: today + 'T01:00:00Z', outingRules: OUTING_DEFAULT });

test('나들이: 도전할래! → 7일 기한, 단계마다 저장(조건 확인), 제출 → 부모님 확인 대기', () => {
  const { bank, state, o } = outingStart();
  assert.equal(o.status, 'open');
  assert.throws(() => applyAction(state, { type: 'outingSave', id: o.id, step: 1, data: {} }, oc(bank, '2026-10-05')), /지금은 고칠 수 없어/);
  applyAction(state, { type: 'outingAccept', id: o.id }, oc(bank, '2026-10-05'));
  assert.equal(o.deadline, '2026-10-11'); // 1일째 10/5 → 7일째 10/11 밤 12시
  assert.equal(outingView(state, '2026-10-05')[0].daysLeft, 7);
  assert.throws(() => applyAction(state, { type: 'outingSave', id: o.id, step: 2, data: {} }, oc(bank, '2026-10-05')), /앞 단계부터/);
  assert.throws(() => applyAction(state, { type: 'outingSave', id: o.id, step: 1, data: { when: '어제', who: '엄마와', where: '동물원' } }, oc(bank, '2026-10-05')), /날씨/);
  const r1 = { when: '어제', who: '엄마와', where: '동물원', weather: '☀️ 맑음' };
  assert.equal(firstSentence(r1), '어제 엄마와 동물원에 갔다.');
  assert.equal(firstSentence({ ...r1, when: '10월 5일 일요일' }), '10월 5일 일요일에 엄마와 동물원에 갔다.');
  applyAction(state, { type: 'outingSave', id: o.id, step: 1, data: { ...r1, first: '어제 엄마와 동물원에 갔다.' } }, oc(bank, '2026-10-05'));
  assert.equal(o.stage, 1);
  assert.throws(() => applyAction(state, { type: 'outingSave', id: o.id, step: 2, data: { did: ['a', 'b', 'c'], order: '짧다' } }, oc(bank, '2026-10-05')), /10글자 넘게/);
  assert.match(stepProblem(3, { sight: '호랑이', look: '크다', sound: '어흥', doing: '걷기', detail: '호랑이가 컸고 무서웠다' }, OUTING_DEFAULT)!, /두 문장/);
  simOutingFill(state, o.id, 7, '2026-10-05T01:00:00Z');
  const r = applyAction(state, { type: 'outingSubmit', id: o.id }, oc(bank, '2026-10-06')) as { message: string };
  assert.match(r.message, /부모님께 보냈어/);
  assert.equal(o.status, 'submitted');
  assert.equal(o.onTime, true);
  assert.throws(() => applyAction(state, { type: 'outingSave', id: o.id, step: 3, data: {} }, oc(bank, '2026-10-06')), /읽는 중/);
  assert.equal(outingReport(state, '2026-10-06').waiting, 1);
});

test('나들이: 고치기 요청은 1번, 고치는 동안·확인 대기는 기한에서 빠짐, 승인하면 마스터볼 3개(고르기 전엔 숨김)', () => {
  const { bank, state, o } = outingStart();
  applyAction(state, { type: 'outingAccept', id: o.id }, oc(bank, '2026-10-05'));
  simOutingFill(state, o.id, 7, '2026-10-05T01:00:00Z');
  applyAction(state, { type: 'outingSubmit', id: o.id }, oc(bank, '2026-10-11'));
  reviewOuting(state, o.id, { by: 'dad', approve: false, text: '기린 이야기도 써 줄래?' }, 't', seeded());
  assert.equal(o.status, 'revise');
  assert.equal(outingView(state, '2026-10-20')[0].revision?.by, 'dad');
  // 기한(10/11)이 지나도 고치는 중이면 늦은 것으로 치지 않음
  assert.equal(syncOutings(state, '2026-10-20', seeded()), false);
  applyAction(state, { type: 'outingSave', id: o.id, step: 4, data: { learned: '기린은 혀가 까만색이라는 것을 알게 되었다.' } }, oc(bank, '2026-10-20'));
  applyAction(state, { type: 'outingSubmit', id: o.id }, oc(bank, '2026-10-20'));
  assert.equal(o.status, 'submitted');
  assert.throws(() => reviewOuting(state, o.id, { by: 'mom', approve: false, text: '한 번 더' }, 't', seeded()), /1번까지/);
  reviewOuting(state, o.id, { by: 'mom', approve: true, text: '정말 잘 썼어!', sticker: 'love' }, 't', seeded(), 0);
  assert.equal(o.status, 'approved');
  assert.throws(() => reviewOuting(state, o.id, { by: 'dad', approve: true, text: '나도' }, 't', seeded()), /이미 다른 보호자/);
  const v = outingView(state, '2026-10-20')[0];
  assert.equal(v.reward?.balls, null); // 고르기 전에는 내용이 안 보임
  assert.equal(v.approval?.by, 'mom');
  const pick = applyAction(state, { type: 'outingPick', id: o.id, pick: 1 }, oc(bank, '2026-10-20')) as { caught: number; balls: { species: number }[] };
  assert.ok([243, 244, 245].includes(pick.caught));
  assert.deepEqual(pick.balls.map(b => b.species).sort(), [243, 244, 245]);
  assert.ok(state.owned.some(p => p.species === pick.caught));
  assert.equal(o.status, 'rewarded');
  assert.equal(outingView(state, '2026-10-20')[0].reward?.balls?.length, 3); // 고른 뒤엔 나머지도 보여 줌
  assert.throws(() => applyAction(state, { type: 'outingPick', id: o.id, pick: 0 }, oc(bank, '2026-10-20')), /열 수 없어/);
});

test('나들이: 기한 넘김 — 3단계 이상이면 랜덤상자 1개, 미만이면 보상 없이 끝. 그 뒤에도 마저 쓰면 완성본(보상 없음)', () => {
  const a = outingStart();
  applyAction(a.state, { type: 'outingAccept', id: a.o.id }, oc(a.bank, '2026-10-05'));
  simOutingFill(a.state, a.o.id, 3, '2026-10-05T01:00:00Z');
  const balls = a.state.balls.length + a.state.potions.length;
  assert.equal(syncOutings(a.state, '2026-10-11', seeded()), false); // 마지막 날은 아직 기한 안
  assert.equal(syncOutings(a.state, '2026-10-12', seeded()), true);
  assert.equal(a.o.status, 'late');
  assert.ok(a.o.late?.box);
  assert.equal(a.state.balls.length + a.state.potions.length, balls + 1);
  simOutingFill(a.state, a.o.id, 7, '2026-10-12T01:00:00Z');
  applyAction(a.state, { type: 'outingSubmit', id: a.o.id }, oc(a.bank, '2026-10-13'));
  assert.equal(a.o.status, 'lateDone');
  assert.equal(a.o.reward, undefined);

  const b = outingStart();
  applyAction(b.state, { type: 'outingAccept', id: b.o.id }, oc(b.bank, '2026-10-05'));
  simOutingFill(b.state, b.o.id, 2, '2026-10-05T01:00:00Z');
  const n = b.state.balls.length + b.state.potions.length;
  syncOutings(b.state, '2026-10-12', seeded());
  assert.equal(b.o.status, 'late');
  assert.equal(b.o.late?.box, null);
  assert.equal(b.state.balls.length + b.state.potions.length, n);
});

test('나들이: 규칙은 도전할래! 때 고정되고, 예전 기록(나들이 없음)도 그대로 읽힌다', () => {
  const { bank, state, o } = outingStart();
  applyAction(state, { type: 'outingAccept', id: o.id }, { ...oc(bank, '2026-10-05'), outingRules: { ...OUTING_DEFAULT, revisionMax: 0, days: 3 } });
  assert.equal(o.deadline, '2026-10-07');
  assert.equal(o.rules?.revisionMax, 0);
  const old = started(bank); delete old.outings;
  assert.deepEqual(childView(old, bank, '2026-10-05').outings, []);
  assert.throws(() => createOuting(state, { from: 'mom', place: '바다', date: '2026-10-05', letter: '', sights: ['게'], photoIds: [], candidates: [243, 243, 245] }, 't'), /서로 다르게/);
});
