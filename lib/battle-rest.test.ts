import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultRules, normalizeRules, nowKorea, restStatus, weekdayOf } from './battle-rest.ts';

const clock = (date: string, hm: string) => { const [h, m] = hm.split(':').map(Number); return { date, weekday: weekdayOf(date), minutes: h * 60 + m }; };

test('처음 값: 평일 낮은 일과 시간, 밤은 잠자는 시간(자정 넘김), 주말 낮은 열림', () => {
  const rules = defaultRules();
  assert.equal(weekdayOf('2026-09-28'), 1); // 월
  assert.equal(restStatus(rules, clock('2026-09-28', '09:00'), false).name, '일과 시간');
  assert.equal(restStatus(rules, clock('2026-09-28', '18:00'), false).blocked, false);
  assert.equal(restStatus(rules, clock('2026-09-28', '23:00'), false).name, '잠자는 시간');
  assert.equal(restStatus(rules, clock('2026-09-29', '06:59'), false).name, '잠자는 시간'); // 전날 시작한 규칙
  assert.equal(restStatus(rules, clock('2026-09-29', '07:30'), false).name, '일과 시간'); // 화요일 아침은 바로 일과 시간
  assert.equal(restStatus(rules, clock('2026-10-03', '07:30'), false).blocked, false); // 토요일 아침은 열림
  assert.equal(restStatus(rules, clock('2026-09-27', '10:00'), false).blocked, false); // 일요일 낮
  assert.equal(restStatus(rules, clock('2026-09-28', '18:00'), false).until, null);
  assert.equal(restStatus(rules, clock('2026-09-28', '23:00'), false).until, '07:30');
});

test('오늘만 열어 주기면 막지 않고, 10분 전이면 곧 시작을 알린다', () => {
  const rules = defaultRules();
  assert.equal(restStatus(rules, clock('2026-09-28', '09:00'), true).blocked, false);
  const s = restStatus(rules, clock('2026-09-28', '22:21'), false);
  assert.equal(s.blocked, false);
  assert.deepEqual(s.soon, { name: '잠자는 시간', inMinutes: 9, at: '22:30' });
  assert.equal(restStatus(rules, clock('2026-09-28', '22:19'), false).soon, null);
});

test('규칙 정리: 요일 없음·시각 오류는 거부, 이름은 채움', () => {
  assert.throws(() => normalizeRules([{ name: 'x', days: [], start: '09:00', end: '10:00' }]), /요일/);
  assert.throws(() => normalizeRules([{ name: 'x', days: [1], start: '9:00', end: '25:00' }]), /시각/);
  const [r] = normalizeRules([{ days: [3, 1, 1], start: '7:05', end: '8:00' }]);
  assert.deepEqual(r.days, [1, 3]);
  assert.equal(r.start, '07:05');
  assert.equal(r.name, '쉬는 시간 1');
  assert.deepEqual(normalizeRules([]), []);
});

test('한국 시간 지금: 자정 넘김과 요일이 맞다', () => {
  const c = nowKorea(new Date('2026-09-28T15:30:00Z')); // 한국 00:30 화요일
  assert.equal(c.date, '2026-09-29');
  assert.equal(c.weekday, 2);
  assert.equal(c.minutes, 30);
});
