import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STREAK_DAYS, SUBJECTS, SUBJECT_TYPES } from './game-config.ts';
import { applyAction, childView, ensureDaily, initialState, shiftDate, syncEvents, type ActiveBank, type Context, type GameState, type Question } from './game-engine.ts';
import { healSession } from './battle-save.ts';
import { isSpecies, species } from './pokedex.ts';
import { RARE_POKEMON } from './rare-pokemon.ts';

function seeded(seed = 1) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function makeBank(id = 7, perSubject = 2): ActiveBank {
  let qid = id * 1000;
  const questions: Question[] = SUBJECTS.flatMap(subject => Array.from({ length: perSubject }, (_, i) => ({
    id: qid++, subject, type: SUBJECT_TYPES[subject][i % 3], prompt: `${subject} ${i}`,
    choices: ['a', 'b', 'c', 'd', 'e'], answer: 0, explanation: '', area: '',
  })));
  return { id, title: '테스트', questions };
}
const at = (bank: ActiveBank | null, today: string, random = seeded()): Context => ({ bank, today, now: today + 'T01:00:00Z', random });
function started(bank: ActiveBank, today: string) {
  const s = initialState();
  applyAction(s, { type: 'starter', species: 906 }, at(bank, today));
  return s;
}
/** 탐험에서 과목 문제를 모두 맞힘 */
function master(state: GameState, bank: ActiveBank, subject: string, today: string) {
  for (const q of bank.questions.filter(q => q.subject === subject)) {
    if (state.daily?.questionIds.includes(q.id)) continue;
    applyAction(state, { type: 'answer', mode: 'explore', questionId: q.id, choice: q.answer }, at(bank, today));
  }
  for (const q of bank.questions.filter(q => q.subject === subject && state.daily?.questionIds.includes(q.id) && !state.daily.correct.includes(q.id))) {
    applyAction(state, { type: 'answer', mode: 'daily', questionId: q.id, choice: q.answer }, at(bank, today));
  }
}
/** 오늘 일일미션을 모두 풂 */
function finishDaily(state: GameState, bank: ActiveBank, today: string) {
  ensureDaily(state, bank, today, seeded());
  for (const id of state.daily!.questionIds) {
    if (state.daily!.correct.includes(id)) continue;
    applyAction(state, { type: 'answer', mode: 'daily', questionId: id, choice: 0 }, at(bank, today));
  }
  syncEvents(state, bank, today);
}

test('올클리어: 수락 전에 마스터한 과목도 인정하고, 마지막 과목을 마치면 부활권 1장', () => {
  const bank = makeBank();
  const day = '2026-09-28';
  const s = started(bank, day);
  ensureDaily(s, bank, day, seeded());
  for (const subj of SUBJECTS.slice(0, 5)) master(s, bank, subj, day);
  // 수락 전에도 이미 마스터한 과목이 보임
  assert.equal(childView(s, bank, day).events.allClear.mastered.length, 5);
  applyAction(s, { type: 'acceptEvent', event: 'allClear' }, at(bank, day));
  assert.deepEqual(s.events!.allClear!.mastered, SUBJECTS.slice(0, 5));
  assert.throws(() => applyAction(s, { type: 'acceptEvent', event: 'allClear' }, at(bank, day)), /이미/);
  // 문제은행이 바뀌어도 진도는 남음
  const other = makeBank(8);
  syncEvents(s, other, day);
  assert.equal(s.events!.allClear!.mastered.length, 5);
  master(s, bank, '상식', day);
  syncEvents(s, bank, day);
  assert.equal(s.events!.allClear!.completedAt, day);
  assert.equal(s.reviveTickets, 1);
  const v = childView(s, bank, day).events;
  assert.equal(v.allClear.hidden, false); // 축하 창 보기 전
  applyAction(s, { type: 'eventSeen', event: 'allClear' }, at(bank, day));
  assert.equal(childView(s, bank, day).events.allClear.hidden, true); // 다시 나오지 않음
  syncEvents(s, bank, day);
  assert.equal(s.reviveTickets, 1); // 두 번 주지 않음
});

test('일일미션 연속: 날마다 +1, 하루 빠지면 0, 10일이면 완료하고 상자는 두 종류가 섞임', () => {
  const bank = makeBank();
  let day = '2026-09-28';
  const s = started(bank, day);
  applyAction(s, { type: 'acceptEvent', event: 'streak' }, at(bank, day));
  finishDaily(s, bank, day);
  assert.equal(s.events!.streak!.count, 1);
  assert.equal(childView(s, bank, day).events.streak.doneToday, true);
  day = shiftDate(day, 1);
  syncEvents(s, bank, day);
  assert.equal(childView(s, bank, day).events.streak.nextCount, 2);
  finishDaily(s, bank, day);
  assert.equal(s.events!.streak!.count, 2);
  // 하루 빠짐 → 0
  day = shiftDate(day, 2);
  syncEvents(s, bank, day);
  assert.equal(s.events!.streak!.count, 0);
  assert.equal(childView(s, bank, day).events.streak.nextCount, 1);
  assert.equal(s.events!.streak!.best, 2);
  for (let i = 0; i < STREAK_DAYS; i++) {
    finishDaily(s, bank, day);
    if (i < STREAK_DAYS - 1) day = shiftDate(day, 1);
  }
  assert.equal(s.events!.streak!.completedAt, day);
  assert.throws(() => applyAction(s, { type: 'eventBox', pick: 5 }, at(bank, day)), /골라/);
  const r = applyAction(s, { type: 'eventBox', pick: 0 }, at(bank, day)) as { items: { kind: string }[] };
  assert.ok(new Set(r.items.map(i => i.kind)).size === 2, '세 칸이 모두 같은 종류가 아님');
  assert.throws(() => applyAction(s, { type: 'eventBox', pick: 1 }, at(bank, day)), /이미/);
  assert.equal(childView(s, bank, day).events.streak.hidden, true);
});

test('희귀 포켓몬 볼은 후보 중 아직 없는 계열을 먼저 준다', () => {
  const bank = makeBank();
  const s = started(bank, '2026-09-28');
  s.balls.push({ id: 'bX', kind: 'rare' });
  const r = applyAction(s, { type: 'openBall', ballId: 'bX' }, at(bank, '2026-09-28')) as { caught: number };
  assert.ok(RARE_POKEMON.some(([id]) => id === r.caught));
});

test('희귀 포켓몬 후보: 모두 있는 번호, 진화 전 첫 모습, 전설·환상 아님', () => {
  for (const [id, memo] of RARE_POKEMON) {
    assert.ok(isSpecies(id), `${id} ${memo}`);
    assert.equal(species(id).from, null, `${id} ${memo}는 1단계가 아님`);
    assert.ok(species(id).tier < 3, `${id} ${memo}는 전설·환상`);
  }
});

test('부활 저장: 파티 전원과 상대의 체력을 가득 채우고 상태 이상을 없앤다', () => {
  const data = { party: [{ hp: 0, stats: [50, 1], status: { effect: 1 } }, { hp: 3, stats: [20] }], enemyParty: [{ hp: 1, stats: [40], status: null }] };
  healSession(data);
  assert.deepEqual(data.party.map(p => [p.hp, p.status ?? null]), [[50, null], [20, null]]);
  assert.equal(data.enemyParty[0].hp, 40);
});
