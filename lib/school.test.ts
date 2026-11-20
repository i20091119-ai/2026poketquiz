import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SUBJECTS, SUBJECT_TYPES } from './game-config.ts';
import { applyAction, childView, ensureDaily, GameError, initialState, recordArrival, schoolReport, type ActiveBank, type Context, type GameState, type Question } from './game-engine.ts';
import { offlineRulesOf } from './offline.ts';
import { deadlineFor, letterTitle, normalizeTime, schoolRulesOf } from './school.ts';
import { setVillageRules } from './village.ts';

const TODAY = '2026-11-20'; // 금
function seeded(seed = 1) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function makeBank(): ActiveBank {
  let id = 1;
  const questions: Question[] = SUBJECTS.flatMap(subject => Array.from({ length: 3 }, (_, i) => ({
    id: id++, subject, type: SUBJECT_TYPES[subject][i % 3], prompt: `${subject} ${i}`, choices: ['a', 'b', 'c', 'd', 'e'], answer: 0, explanation: '해설', area: '영역',
  })));
  return { id: 7, title: '테스트', questions };
}
const ctx = (bank: ActiveBank | null, today = TODAY): Context => ({ bank, today, now: today + 'T01:00:00Z', random: seeded(), offlineRules: offlineRulesOf() });
function started(bank: ActiveBank) {
  const state = initialState();
  applyAction(state, { type: 'starter', species: 906 }, ctx(bank));
  return state;
}
function finishDaily(state: GameState, bank: ActiveBank, today = TODAY) {
  ensureDaily(state, bank, today, seeded());
  for (const id of state.daily!.questionIds) applyAction(state, { type: 'answer', mode: 'daily', questionId: id, choice: 0 }, ctx(bank, today));
}
const rules = schoolRulesOf();
const NOW = TODAY + 'T03:00:00Z';

test('기준 시각: 처음 2주 08:45, 그 뒤 08:40, 같은 분까지 성공', () => {
  assert.equal(deadlineFor(rules, '2026-11-20', '2026-11-20'), '08:45');
  assert.equal(deadlineFor(rules, '2026-12-03', '2026-11-20'), '08:45'); // 13일째
  assert.equal(deadlineFor(rules, '2026-12-04', '2026-11-20'), '08:40'); // 14일째부터
  assert.equal(deadlineFor(schoolRulesOf({ startDate: '2026-11-01' }), '2026-11-20', '2026-11-20'), '08:40');
  assert.equal(normalizeTime('8:44:59'), '08:44');
  assert.equal(normalizeTime('25:00'), null);
  assert.equal(letterTitle('2026-11-20', TODAY), '오늘 학교에 제때 도착!');
  assert.equal(letterTitle('2026-11-17', TODAY), '지난 화요일 제때 도착!');
});

test('등교: 성공이면 편지 하나, 실패는 기록만, 같은 날 두 번은 한 번만, 보호자 손 체크로 성공', () => {
  const state = initialState();
  const a = recordArrival(state, { date: TODAY, time: '08:45:30', source: 'gate' }, TODAY, rules, NOW);
  assert.deepEqual([a.status, a.ok, a.time, a.deadline, a.letter], ['recorded', true, '08:45', '08:45', true]);
  const b = recordArrival(state, { date: TODAY, time: '08:10', source: 'gate' }, TODAY, rules, NOW);
  assert.equal(b.status, 'duplicate');
  assert.equal(state.school!.letters.length, 1);
  const c = recordArrival(state, { date: '2026-11-19', time: '08:46', source: 'gate' }, TODAY, rules, NOW);
  assert.deepEqual([c.ok, c.letter], [false, false]);
  assert.equal(state.school!.letters.length, 1);
  const d = recordArrival(state, { date: '2026-11-19', source: 'parent', by: 'mom' }, TODAY, rules, NOW);
  assert.deepEqual([d.status, d.ok, d.letter], ['upgraded', true, true]);
  assert.equal(state.school!.letters.length, 2);
  assert.throws(() => recordArrival(state, { date: '2026-11-21', time: '08:00', source: 'gate' }, TODAY, rules, NOW), GameError);
  assert.throws(() => recordArrival(state, { date: TODAY, time: 'nope', source: 'gate' }, '2026-11-21', rules, NOW), GameError);
  assert.equal(schoolReport(state, TODAY, rules).today?.ok, true);
});

test('편지: 미션 끝내고 마을에서 기본 재료 6종 중 1개 (반짝돌·철 없음), 한 번만', () => {
  setVillageRules(null);
  const bank = makeBank();
  const state = started(bank);
  recordArrival(state, { date: '2026-11-17', time: '08:30', source: 'gate' }, TODAY, rules, NOW);
  recordArrival(state, { date: TODAY, time: '08:30', source: 'gate' }, TODAY, rules, NOW);
  const letters = childView(state, bank, TODAY).schoolLetters;
  assert.deepEqual(letters.map(l => l.title), ['지난 화요일 제때 도착!', '오늘 학교에 제때 도착!']);
  // 미션 전에는 못 받음
  assert.throws(() => applyAction(state, { type: 'schoolLetterPick', id: letters[0].id, kind: 'leaf' }, ctx(bank)), GameError);
  finishDaily(state, bank);
  applyAction(state, { type: 'villageEnter' }, ctx(bank));
  const mail = applyAction(state, { type: 'villageMail', stay: true }, ctx(bank)) as { letters?: unknown[] };
  assert.equal(mail.letters?.length, 2);
  const before = state.village!.mats.stone ?? 0;
  applyAction(state, { type: 'schoolLetterPick', id: letters[0].id, kind: 'stone', stay: true }, ctx(bank));
  assert.equal(state.village!.mats.stone, before + 1);
  assert.throws(() => applyAction(state, { type: 'schoolLetterPick', id: letters[0].id, kind: 'leaf', stay: true }, ctx(bank)), GameError);
  assert.throws(() => applyAction(state, { type: 'schoolLetterPick', id: letters[1].id, kind: 'iron' as never, stay: true }, ctx(bank)), GameError);
  assert.equal(childView(state, bank, TODAY).schoolLetters.length, 1);
});
