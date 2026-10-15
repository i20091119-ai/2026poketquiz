import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addLegendPieces, applyAction, BOOK_BOX_TABLE, childView, createOuting, initialState, legendView, offlineReport, reviewOuting, setOfflineCheer, setOfflineMark, simOffline, syncOffline, type Context, type GameState } from './game-engine.ts';
import { DAILY_BOX_TABLE } from './game-config.ts';
import { halfText, OFFLINE_DEFAULT, offlineRulesOf, shortMessage, stageNeed, weekScore, weekStartOf, type OfflineRules } from './offline.ts';
import { gemShape, gemWedges, GEM_COLORS } from './gem.ts';

function seeded(seed = 1) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}
const rules = offlineRulesOf();
function ctx(today: string, offlineRules: OfflineRules = rules, random = seeded()): Context {
  return { bank: null, today, now: today + 'T09:00:00Z', random, offlineRules };
}
function started(): GameState {
  const state = initialState();
  applyAction(state, { type: 'starter', species: 906 }, ctx('2026-10-01'));
  return state;
}

test('주: 월~일, 합계(● 1, ■ 0.5), 반 개 글자', () => {
  assert.equal(weekStartOf('2026-10-15'), '2026-10-12'); // 목 → 월
  assert.equal(weekStartOf('2026-10-12'), '2026-10-12');
  assert.equal(weekStartOf('2026-10-18'), '2026-10-12'); // 일 → 그 주 월
  assert.equal(weekStartOf('2026-11-01'), '2026-10-26'); // 달이 바뀌는 주
  assert.equal(weekScore({ '2026-10-12': 'full', '2026-10-13': 'some', '2026-10-14': 'none', '2026-10-18': 'some' }, '2026-10-12'), 2);
  assert.equal(halfText(3.5), '3½');
  assert.equal(halfText(0.5), '½');
  assert.equal(halfText(4), '4');
  assert.equal(stageNeed(rules, 1), 3);
  assert.equal(stageNeed(rules, 2), 4);
  assert.equal(stageNeed(rules, 3), 5);
  assert.equal(stageNeed(rules, 4), 6);
});

test('모자란 말: 실패라는 말 없이 무엇이 더 있었으면 됐는지', () => {
  const ws = '2026-10-05';
  // ● ● ● ■ ■ ■ ▲ = 4.5 → ½ 모자람: ■ 대신 ● 한 번
  const a = { '2026-10-05': 'full', '2026-10-06': 'full', '2026-10-07': 'full', '2026-10-08': 'some', '2026-10-09': 'some', '2026-10-10': 'some', '2026-10-11': 'none' } as const;
  assert.equal(shortMessage(a, ws, 5), '이번엔 ½개가 모자랐어. ■ 대신 ●가 한 번만 더 있었으면 됐어. 이번 주 훈련 다시 도전!');
  // ● ■ ■ ▲ ● (빈칸) ■ = 3.5 → 1½: ● 한 번 + ■ 대신 ● 한 번
  const b = { '2026-10-05': 'full', '2026-10-06': 'some', '2026-10-07': 'some', '2026-10-08': 'none', '2026-10-09': 'full', '2026-10-11': 'some' } as const;
  assert.equal(shortMessage(b, ws, 5), '이번엔 1½개가 모자랐어. ●가 한 번 더, ■ 대신 ●가 한 번만 더 있었으면 됐어. 이번 주 훈련 다시 도전!');
  // ■ 일곱 개 = 3.5 → ■ 대신 ● 세 번
  const c = Object.fromEntries(['05', '06', '07', '08', '09', '10', '11'].map(d => [`2026-10-${d}`, 'some' as const]));
  assert.match(shortMessage(c, ws, 5), /■ 대신 ●가 세 번만 더/);
  assert.equal(shortMessage(c, ws, 3), '');
  assert.doesNotMatch(shortMessage(b, ws, 5), /실패/);
});

test('보호자 기록: 오늘까지만, 하루 선물은 다음 날 (● 책 상자, ■ 랜덤상자, ▲ 없음)', () => {
  const state = started();
  assert.throws(() => setOfflineMark(state, '2026-10-16', 'full', '2026-10-15', rules), /앞으로 올 날짜/);
  setOfflineMark(state, '2026-10-13', 'full', '2026-10-15', rules);
  setOfflineMark(state, '2026-10-14', 'some', '2026-10-15', rules);
  setOfflineMark(state, '2026-10-15', 'full', '2026-10-15', rules); // 오늘은 아직
  setOfflineMark(state, '2026-10-12', 'none', '2026-10-15', rules);
  assert.equal(state.offline!.weeks['2026-10-12'].goal, 5);
  syncOffline(state, ctx('2026-10-15'));
  const boxes = state.offline!.boxes;
  assert.deepEqual(boxes.map(b => [b.date, b.kind]), [['2026-10-13', 'book'], ['2026-10-14', 'normal']]);
  // 오늘 기록은 내일 받음
  syncOffline(state, ctx('2026-10-16'));
  assert.equal(state.offline!.boxes.length, 3);
  // 한 번 정한 날은 다시 주지 않음, ▲였던 날을 ●로 고치면 그때 줌
  const warn = setOfflineMark(state, '2026-10-13', 'some', '2026-10-16', rules);
  assert.match(warn.warning ?? '', /이미 하루 선물/);
  setOfflineMark(state, '2026-10-12', 'full', '2026-10-16', rules);
  syncOffline(state, ctx('2026-10-16'));
  assert.equal(state.offline!.boxes.length, 4);
  // 상자 열기: 3개 중 1개
  const view = childView(state, null, '2026-10-16').offline;
  assert.equal(view.boxes.length, 4);
  assert.ok(view.boxes[0].items.every(i => i === null)); // 고르기 전엔 숨김
  const r = applyAction(state, { type: 'offlineBox', id: view.boxes[0].id, pick: 1 }, ctx('2026-10-16')) as { done: boolean };
  assert.equal(r.done, true);
  assert.throws(() => applyAction(state, { type: 'offlineBox', id: view.boxes[0].id, pick: 2 }, ctx('2026-10-16')), /이미 열었어/);
});

test('책 상자는 볼이 한 등급 위부터 (몬스터볼 없음)', () => {
  const balls = (t: typeof DAILY_BOX_TABLE) => t.filter(r => r.item.kind === 'ball').map(r => (r.item as { ball: string }).ball);
  assert.ok(balls(DAILY_BOX_TABLE).includes('poke'));
  assert.ok(!balls(BOOK_BOX_TABLE).includes('poke'));
  assert.equal(BOOK_BOX_TABLE.reduce((s, r) => s + r.weight, 0), DAILY_BOX_TABLE.reduce((s, r) => s + r.weight, 0));
});

test('주간 정산: 5 이상이면 조각 1개, 끝난 뒤 처음 열 때, 고쳐도 회수하지 않음, 나중에 넘기면 그때 줌', () => {
  const state = started();
  const marks = ['full', 'full', 'some', 'full', 'some', 'full', 'none'] as const; // 5
  ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'].forEach((d, i) => setOfflineMark(state, d, marks[i], '2026-10-11', rules));
  syncOffline(state, ctx('2026-10-11')); // 일요일: 아직 정산 안 함
  assert.equal(state.offline!.weeks['2026-10-05'].settled, undefined);
  syncOffline(state, ctx('2026-10-13')); // 월요일에 안 열고 화요일에 처음
  assert.equal(state.offline!.weeks['2026-10-05'].settled!.piece, true);
  assert.equal(state.legend!.pieces, 1);
  const w = setOfflineMark(state, '2026-10-05', 'none', '2026-10-13', rules);
  assert.match(w.warning ?? '', /이미 전설 조각/);
  syncOffline(state, ctx('2026-10-14'));
  assert.equal(state.legend!.pieces, 1); // 회수하지 않음

  // 모자란 주를 나중에 고쳐 기준을 넘기면 그때 조각
  const s2 = started();
  ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].forEach(d => setOfflineMark(s2, d, 'full', '2026-10-11', rules));
  syncOffline(s2, ctx('2026-10-12'));
  assert.equal(s2.offline!.weeks['2026-10-05'].settled!.piece, false);
  const v = childView(s2, null, '2026-10-12').offline.lastWeek!;
  assert.equal(v.score, 4);
  assert.match(v.short, /1개가 모자랐어/);
  setOfflineMark(s2, '2026-10-09', 'full', '2026-10-12', rules);
  syncOffline(s2, ctx('2026-10-12'));
  assert.equal(s2.legend!.pieces, 1);
});

test('주 기준은 그 주에 처음 적을 때 고정 (중간에 바꾸면 다음 주부터)', () => {
  const state = started();
  setOfflineMark(state, '2026-10-05', 'full', '2026-10-07', rules);
  const harder = offlineRulesOf({ weekGoal: 6 });
  setOfflineMark(state, '2026-10-06', 'full', '2026-10-07', harder);
  assert.equal(state.offline!.weeks['2026-10-05'].goal, 5);
  setOfflineMark(state, '2026-10-12', 'full', '2026-10-12', harder);
  assert.equal(state.offline!.weeks['2026-10-12'].goal, 6);
});

test('달이 바뀌는 주도 한 주 (10/26~11/1)', () => {
  const state = started();
  ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'].forEach(d => setOfflineMark(state, d, 'some', '2026-11-01', rules));
  setOfflineMark(state, '2026-10-26', 'full', '2026-11-01', rules);
  setOfflineMark(state, '2026-11-01', 'full', '2026-11-01', rules);
  syncOffline(state, ctx('2026-11-02'));
  assert.equal(state.offline!.weeks['2026-10-26'].settled!.score, 4.5);
});

test('전설: 조각 3개 → 마스터볼 3개(남은 후보, 가진 포켓몬 제외) → 고르기 → 나머지도 공개', () => {
  const state = started();
  const c = ctx('2026-10-20');
  state.owned.push({ uid: 'x1', species: 243, obtainedAt: c.now }); // 이미 가진 라이코는 빠짐
  addLegendPieces(state, 2, 'week', c);
  assert.equal(state.legend!.pending, undefined);
  assert.equal(legendView(state).pieces, 2);
  addLegendPieces(state, 2, 'outing', c); // 3개로 완성, 1개는 다음 보석으로
  assert.equal(state.legend!.pieces, 1);
  const pending = state.legend!.pending!;
  assert.equal(pending.balls.length, 3);
  assert.ok(pending.balls.every(b => [145, 144, 244, 245].includes(b.species)));
  assert.equal(legendView(state).pending!.count, 3); // 아이 화면에는 수만
  const r = applyAction(state, { type: 'legendPick', pick: 0 }, c) as { balls: { species: number }[]; caught: number };
  assert.equal(r.balls.length, 3);
  assert.ok(state.owned.some(p => p.species === r.caught));
  assert.equal(state.legend!.got.length, 1);
  assert.equal(state.legend!.pending, undefined);
});

test('전설: 남은 후보가 3마리보다 적으면 그만큼만, 다 만나면 다음 단계(조각 4개), 후보가 없으면 기다림', () => {
  const state = started();
  const c = ctx('2026-10-20');
  for (const id of [145, 144, 243]) state.owned.push({ uid: 'x' + id, species: id, obtainedAt: c.now });
  addLegendPieces(state, 3, 'week', c);
  assert.equal(state.legend!.pending!.balls.length, 2);
  applyAction(state, { type: 'legendPick', pick: 0 }, c);
  addLegendPieces(state, 3, 'week', c);
  assert.equal(state.legend!.pending!.balls.length, 1);
  const r = applyAction(state, { type: 'legendPick', pick: 0 }, c) as { stageUp: { stage: number; need: number } | null };
  assert.deepEqual(r.stageUp, { stage: 2, need: 4 });
  // 2단계 후보를 아직 안 정함 → 조각만 모으고 기다림
  addLegendPieces(state, 5, 'week', c);
  assert.equal(state.legend!.pending, undefined);
  assert.equal(legendView(state).waiting, true);
  // 부모님이 후보를 정하면 다음 정산 때 마스터볼
  const withStage2 = offlineRulesOf({ candidates: { 2: [377, 378, 379, 380, 381] } });
  syncOffline(state, { ...c, offlineRules: withStage2 });
  addLegendPieces(state, 1, 'event', { ...c, offlineRules: withStage2 });
  assert.equal(state.legend!.pending!.balls.length, 3);
  assert.equal(state.legend!.pieces, 2);
});

test('단계 조각 수는 단계가 열릴 때 고정', () => {
  const state = started();
  const c = ctx('2026-10-20');
  addLegendPieces(state, 1, 'week', c);
  addLegendPieces(state, 1, 'week', { ...c, offlineRules: offlineRulesOf({ stageNeeds: [5, 6] }) });
  assert.equal(state.legend!.need, 3);
  assert.equal(state.legend!.pieces, 2);
});

test('나들이: 새로 여는 보고서는 전설 조각 보상, 예전 보고서는 마스터볼 그대로', () => {
  const state = started();
  const c = ctx('2026-10-20');
  const base = { from: 'mom' as const, place: '동물원', date: '2026-10-19', letter: '', sights: ['사자'], photoIds: [] };
  const o = createOuting(state, { ...base, pieces: 2 }, c.now);
  assert.equal(o.pieces, 2);
  assert.deepEqual(o.candidates, []);
  const old = createOuting(state, { ...base, candidates: [243, 244, 245] }, c.now);
  assert.equal(old.pieces, undefined);
  // 승인 → 아이가 받으면 조각 2개
  o.status = 'submitted';
  reviewOuting(state, o.id, { by: 'mom', approve: true, text: '잘했어' }, c.now, c.random);
  assert.deepEqual(o.reward?.balls, []);
  const r = applyAction(state, { type: 'outingPick', id: o.id, pick: 0 }, c) as { pieces: number };
  assert.equal(r.pieces, 2);
  assert.equal(state.legend!.pieces, 2);
  assert.equal(o.status, 'rewarded');
  old.status = 'submitted';
  reviewOuting(state, old.id, { by: 'dad', approve: true, text: '최고' }, c.now, c.random);
  assert.equal(old.reward!.balls.length, 3);
});

test('응원 한 줄은 지난주 기록에 보임', () => {
  const state = started();
  setOfflineMark(state, '2026-10-05', 'full', '2026-10-07', rules);
  setOfflineCheer(state, '2026-10-05', 'dad', '이번 주도 멋졌어!', '2026-10-07', rules, '2026-10-07T12:00:00Z');
  syncOffline(state, ctx('2026-10-12'));
  const v = childView(state, null, '2026-10-12').offline.lastWeek!;
  assert.deepEqual(v.cheer, { by: 'dad', text: '이번 주도 멋졌어!' });
  assert.equal(childView(state, null, '2026-10-19').offline.lastWeek, null); // 그 다음 주에는 안 보임
  assert.equal(offlineReport(state, '2026-10-12').weeks['2026-10-05'].cheer?.by, 'dad');
});

test('예전 기록(집 공부 없음)도 그대로 열림', () => {
  const state = started();
  assert.equal(syncOffline(state, ctx('2026-10-20')), false);
  const v = childView(state, null, '2026-10-20');
  assert.equal(v.offline.started, false);
  assert.equal(v.legend.stage, 1);
  assert.equal(v.legend.need, 3);
  assert.equal(state.legend, undefined); // 보기만 해서는 기록을 만들지 않음
});

test('시뮬레이션: 지난주 채우기(성공·아쉬움)', () => {
  const state = started();
  const c = ctx('2026-10-14');
  simOffline(state, 'weekGood', c);
  assert.equal(childView(state, null, '2026-10-14').offline.lastWeek!.piece, true);
  simOffline(state, 'weekShort', c);
  const lw = childView(state, null, '2026-10-14').offline.lastWeek!;
  assert.equal(lw.piece, false);
  assert.match(lw.short, /1½개가 모자랐어/);
  assert.equal(state.legend!.pieces, 1); // 앞에서 받은 조각은 그대로
  assert.equal(OFFLINE_DEFAULT.weekGoal, 5);
});

test('보석: 단계별 모양·조각 수, 4단계부터 자동 모양(같은 씨앗 = 같은 모양), 색은 앞 단계와 다름', () => {
  for (const stage of [1, 2, 3, 4, 5, 9]) {
    const need = stageNeed(rules, stage);
    const shape = gemShape(stage, 0);
    const wedges = gemWedges(shape.points, need, shape.center);
    assert.equal(wedges.length, need);
    for (const w of wedges) assert.ok(w.length >= 3);
    assert.notEqual(shape.color.fill, gemShape(stage + 1, 0).color.fill);
  }
  assert.equal(gemShape(1, 0).color.fill, GEM_COLORS.blue.fill);
  assert.deepEqual(gemShape(6, 0).points, gemShape(6, 0).points);
  assert.notDeepEqual(gemShape(6, 0).points, gemShape(6, 1).points);
  // 좌우 대칭
  const pts = gemShape(7, 3).points;
  for (const [x, y] of pts) assert.ok(pts.some(([x2, y2]) => Math.abs(x2 - (100 - x)) < 0.01 && Math.abs(y2 - y) < 0.01));
});
