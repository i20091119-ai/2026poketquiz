import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTIVITY_LOG_DAYS, DAILY_ATTEMPTS, DAILY_CANDY, EXP_EXCHANGE, WEAK_AREA, EXP_GIFT, DAILY_PER_SUBJECT, SUBJECTS, SUBJECT_TYPES, STARTERS, statReward } from './game-config.ts';
import { activityList, applyAction, areaReport, battleStartsLeft, battleTimeUp, candySummary, childView, claimCandy, isWeakArea, dailyBoxPicks, ensureDaily, GameError, initialState, nextExploreQuestion, recordBattleProgress, startBattle, battleLogList, type ActiveBank, type Context, type GameState, type Question, shiftDate } from './game-engine.ts';
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

test('일일미션만 일주일(정답률 80%, 상자 보상 제외) 풀어도 시작 포켓몬 첫 진화 가능', () => {
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

test('아이템: 가방에 모았다가 포켓몬에게 먹이면 적힌 속성이 모두 오른다', () => {
  const bank = makeBank();
  const state = started(bank); // 나오하(풀) — 다음 진화 나로테(풀 15)
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
  applyAction(state, { type: 'evolve', uid, target: 907 }, ctx(bank)); // 아이템만으로 첫 진화
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
