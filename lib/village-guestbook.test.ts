import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SUBJECTS, SUBJECT_TYPES } from './game-config.ts';
import { applyAction, childView, ensureDaily, guestbookOf, initialState, pickCraftedSpecies, syncVillage, type ActiveBank, type Context, type GameState, type Question } from './game-engine.ts';
import { CATCH_POOLS, rootOf, species } from './pokedex.ts';
import { setCraftRules } from './village-craft.ts';
import { favoriteBerry, possibleGuests } from './village-guestbook.ts';
import { setVillageRules } from './village.ts';

const TODAY = '2026-11-14';
function seeded(seed = 1) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function makeBank(per = 3): ActiveBank {
  let id = 1;
  const questions: Question[] = SUBJECTS.flatMap(subject => Array.from({ length: per }, (_, i) => ({
    id: id++, subject, type: SUBJECT_TYPES[subject][i % 3], prompt: `${subject} ${i}`, choices: ['a', 'b', 'c', 'd', 'e'], answer: 0, explanation: '해설', area: '영역',
  })));
  return { id: 7, title: '테스트', questions };
}
const ctx = (bank: ActiveBank, today = TODAY, random = seeded()): Context => ({ bank, today, now: today + 'T01:00:00Z', random });
function started(bank: ActiveBank) { const s = initialState(); applyAction(s, { type: 'starter', species: 906 }, ctx(bank)); return s; }
/** 오늘 미션을 다 풂. wrongFirst = 처음 문제를 한 번 틀리고 맞힘 */
function finishDaily(state: GameState, bank: ActiveBank, today = TODAY, wrongFirst = false) {
  ensureDaily(state, bank, today, seeded());
  const results: unknown[] = [];
  state.daily!.questionIds.forEach((id, i) => {
    if (wrongFirst && i === 0) applyAction(state, { type: 'answer', mode: 'daily', questionId: id, choice: 1 }, ctx(bank, today));
    results.push(applyAction(state, { type: 'answer', mode: 'daily', questionId: id, choice: 0 }, ctx(bank, today)));
  });
  return results as { village?: { mission?: { sparkle?: number } } }[];
}
function reset() { setCraftRules(null); setVillageRules(null); }

test('방명록: 예전 도감 "만남"은 지우지 않고 방명록으로 옮김 (처음 온 날은 모름)', () => {
  reset();
  const bank = makeBank();
  const state = started(bank);
  state.met = [1, 7, 10];
  // 마을 기록이 없어도 보기에서는 방명록으로 보임
  assert.deepEqual(Object.keys(guestbookOf(state)).sort(), ['1', '10', '7']);
  finishDaily(state, bank);
  applyAction(state, { type: 'villageEnter' }, ctx(bank));
  const book = state.village!.guestbook!;
  assert.deepEqual(book['7'], { first: null, visits: 1, from: ['old'] });
  assert.deepEqual(state.met, [1, 7, 10]); // 지우지 않음
  const view = childView(state, bank, TODAY).village.guestbook;
  assert.equal(view.entries.length, 3);
  assert.equal(view.total, possibleGuests().length);
  assert.ok(possibleGuests().every(id => species(id).tier < 3), '전설·환상은 손님이 아님');
});

test('방명록: 손님이 온 날마다 발자국 도장(하루 한 번), 말을 걸면 좋아하는 열매 → 물건을 알게 됨, 들은 말 남음', () => {
  reset();
  const bank = makeBank();
  const state = started(bank);
  finishDaily(state, bank);
  applyAction(state, { type: 'villageEnter' }, ctx(bank));
  setCraftRules({ guestChance: 0 });
  const g = (date: string) => { state.village!.guests = { date, list: [{ plot: 0, species: 1, habitat: 'green' }] }; };
  g(TODAY);
  applyAction(state, { type: 'villageEnter' }, ctx(bank));
  applyAction(state, { type: 'villageEnter' }, ctx(bank));
  let e = state.village!.guestbook!['1'];
  assert.deepEqual([e.first, e.visits], [TODAY, 1]);
  const r1 = applyAction(state, { type: 'villageTalk', plot: 0 }, ctx(bank)) as { message: string };
  assert.match(r1.message, /제일 좋아/);
  assert.equal(childView(state, bank, TODAY).village.guestbook.entries.find(x => x.species === 1)!.berry, favoriteBerry(1));
  // 다음 날 또 오면 도장 2개, 말을 걸면 좋아하는 물건
  const next = '2026-11-15';
  finishDaily(state, bank, next);
  g(next);
  applyAction(state, { type: 'villageEnter' }, ctx(bank, next));
  const r2 = applyAction(state, { type: 'villageTalk', plot: 0 }, ctx(bank, next)) as { message: string };
  assert.match(r2.message, /있으면 좋겠어/);
  e = state.village!.guestbook!['1'];
  assert.equal(e.visits, 2);
  assert.equal(e.lines!.length, 2);
  assert.deepEqual(e.knows, { berry: true, item: true });
  reset();
});

test('제작 볼: 방명록 손님(첫 모습) 중 도감에 없는 것 먼저, 등급이 맞을 때만, 이로치 확률은 볼 표대로', () => {
  reset();
  const bank = makeBank();
  const state = started(bank);
  // 방명록에 보통 등급 진화형 하나 (예: 이상해풀 2 → 첫 모습 이상해씨 1)
  const evolved = [...CATCH_POOLS[0]].map(id => id).find(id => rootOf(id + 1) === id && species(id + 1).tier < 3) ?? 1;
  state.village = { mats: {}, items: {}, cells: [], habitats: [], guestbook: { [String(evolved + 1)]: { first: TODAY, visits: 1 } } } as never;
  for (let s = 1; s < 20; s++) {
    const f = pickCraftedSpecies(state, 'poke', seeded(s), 0)!;
    assert.equal(f.id, rootOf(evolved + 1));
    assert.equal(f.fromBook, true);
  }
  // 이미 도감에 있으면 방명록 손님이어도 안 나옴 → 일반 미보유에서
  state.dex.push(rootOf(evolved + 1));
  const f2 = pickCraftedSpecies(state, 'poke', seeded(3), 0)!;
  assert.notEqual(f2.id, rootOf(evolved + 1));
  assert.ok(!state.dex.includes(f2.id));
  // 슈퍼볼(조금 드묾)에는 보통 등급 방명록 손님이 안 나옴
  state.dex.pop();
  const g = pickCraftedSpecies(state, 'great', seeded(3), 0)!;
  assert.ok(CATCH_POOLS[1].includes(g.id));
  // 이로치: 100%면 몬스터볼도 이로치, 0%면 없음
  assert.equal(pickCraftedSpecies(state, 'poke', seeded(4), 100)!.shiny, true);
  assert.equal(pickCraftedSpecies(state, 'ultra', seeded(4), 0)!.shiny, false);
  reset();
});

test('반짝돌: 미션을 오답 0으로 끝내면 1개, 한 번이라도 틀리면 없음, 복습 첫 정답과 합쳐 하루 2개까지', () => {
  reset();
  const bank = makeBank();
  const state = started(bank);
  const res = finishDaily(state, bank);
  assert.equal(res.at(-1)!.village!.mission!.sparkle, 1);
  assert.equal(state.village!.study!.sparkle, 1);
  // 다음 날: 하나 틀리면 없음
  const next = '2026-11-15';
  const res2 = finishDaily(state, bank, next, true);
  assert.equal(res2.at(-1)!.village!.mission!.sparkle ?? 0, 0);
  // 하루 한도: 같은 날 이미 2개 받았으면 더 없음
  const day3 = '2026-11-16';
  state.village!.sparkleDay = { date: day3, n: 2 };
  const res3 = finishDaily(state, bank, day3);
  assert.equal(res3.at(-1)!.village!.mission!.sparkle, 0);
  // 보호자가 한도를 바꿀 수 있음
  setCraftRules({ sparkleDaily: 6 }); // (그날 복습 첫 정답 반짝돌도 함께 들어올 수 있어 넉넉하게)
  const day4 = '2026-11-17';
  state.village!.sparkleDay = { date: day4, n: 2 };
  const res4 = finishDaily(state, bank, day4);
  assert.equal(res4.at(-1)!.village!.mission!.sparkle, 1);
  reset();
});

test('반짝돌 하루 2개: 복습 첫 정답 여러 개 + 오답 0 미션이어도 2개 (복습 모드 날도 같음)', () => {
  reset();
  const bank = makeBank(3);
  const state = started(bank);
  // 탐험에서 문제 3개를 이틀 전에 틀려 둠 → 오늘 복습
  const ids = bank.questions.slice(0, 3).map(q => q.id);
  for (const id of ids) for (let t = 0; t < 2; t++) applyAction(state, { type: 'answer', mode: 'explore', questionId: id, choice: 1 }, ctx(bank, '2026-11-12'));
  let got = 0;
  for (const id of ids) got += ((applyAction(state, { type: 'answer', mode: 'explore', questionId: id, choice: 0 }, ctx(bank)) as { sparkle?: number }).sparkle ?? 0);
  assert.equal(got, 2);
  assert.equal(state.village!.study!.sparkle, 2);
  // 같은 날 미션을 오답 0으로 끝내도 한도라 0
  const res = finishDaily(state, bank);
  assert.equal(res.at(-1)!.village?.mission?.sparkle ?? 0, 0);
  assert.equal(state.village!.study!.sparkle, 2);
  reset();
});

test('미션 철: 한 주(월~일)에 미션을 5일 끝내면 다음 월요일 우편함에 철 1개 (4일이면 없음, 한 번만)', () => {
  reset();
  const bank = makeBank();
  const state = started(bank);
  // 2026-11-16(월)~22(일) 중 5일
  for (const d of ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']) finishDaily(state, bank, d);
  assert.deepEqual(state.village!.missionDays!.slice(-5), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
  syncVillage(state, '2026-11-22', seeded()); // 아직 그 주 일요일
  assert.equal((state.village!.mail ?? []).length, 0);
  syncVillage(state, '2026-11-23', seeded()); // 다음 월요일
  const mail = state.village!.mail!;
  assert.equal(mail.length, 1);
  assert.deepEqual([mail[0].amount, mail[0].from, mail[0].week], [1, 'mission', '2026-11-16']);
  syncVillage(state, '2026-11-24', seeded());
  assert.equal(state.village!.mail!.length, 1);
  // 4일만 한 주는 없음
  for (const d of ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']) finishDaily(state, bank, d);
  syncVillage(state, '2026-11-30', seeded());
  assert.equal(state.village!.mail!.length, 1);
  // 우편함 열기: 미션 덕분 문구
  finishDaily(state, bank, '2026-11-30');
  const r = applyAction(state, { type: 'villageMail', stay: true }, ctx(bank, '2026-11-30')) as { iron: number; message: string };
  assert.equal(r.iron, 1);
  assert.match(r.message, /미션을 열심히 끝낸/);
  reset();
});

// ---------- 합치기 전 확인 (2026-11-14 부모님) ----------
test('확인 1: 방명록이 비어도 서식지 손님은 도감에 없는 포켓몬 중에서도 오고, 전설·환상은 안 옴', () => {
  const state = initialState();
  state.dex.push(1, 7, 10, 43, 60, 69, 129, 191);
  state.village = { mats: {}, items: {}, cells: [], habitats: [{ kind: 'green', since: '2026-11-13' }, { kind: 'shore', since: '2026-11-13' }, { kind: 'garden', since: '2026-11-13' }], guestbook: {} } as unknown as GameState['village'];
  let notOwned = 0, total = 0;
  for (let d = 0; d < 14; d++) {
    syncVillage(state, `2026-11-${String(14 + d).padStart(2, '0')}`, seeded(1000 + d * 7919));
    for (const g of state.village!.guests!.list) { total++; if (!state.dex.includes(g.species)) notOwned++; assert.ok(species(g.species).tier < 3, '전설·환상'); }
  }
  assert.equal(total, 42);
  assert.ok(notOwned > 30, `도감에 없는 손님 ${notOwned}/${total}`);
});

test('확인 2: 한 번이라도 틀린 날에도 복습 첫 정답 반짝돌은 나오고, 없어지는 건 오답 0 반짝돌뿐', () => {
  reset();
  const bank = makeBank(30);
  const state = started(bank);
  const q = bank.questions[0];
  for (let t = 0; t < 2; t++) applyAction(state, { type: 'answer', mode: 'explore', questionId: q.id, choice: 1 }, ctx(bank, '2026-11-12'));
  ensureDaily(state, bank, TODAY, seeded());
  const other = state.daily!.questionIds.find(x => x !== q.id)!;
  applyAction(state, { type: 'answer', mode: 'daily', questionId: other, choice: 1 }, ctx(bank)); // 미션에서 한 번 틀림
  const inDaily = state.daily!.questionIds.includes(q.id);
  const r = applyAction(state, { type: 'answer', mode: inDaily ? 'daily' : 'explore', questionId: q.id, choice: 0 }, ctx(bank)) as { sparkle?: number };
  assert.equal(r.sparkle, 1);
  let last: { village?: { mission?: { sparkle?: number } } } = {};
  for (const x of state.daily!.questionIds) if (!state.daily!.correct.includes(x) && !state.daily!.wrong.includes(x)) last = applyAction(state, { type: 'answer', mode: 'daily', questionId: x, choice: 0 }, ctx(bank)) as never;
  assert.equal(last.village?.mission?.sparkle ?? 0, 0);
  assert.equal(state.village!.study!.sparkle, 1);
});

test('확인 3: 진화형 손님(버터플)은 첫 모습(캐터피)으로 주되, 캐터피를 이미 가졌으면 후보에서 빠짐', () => {
  const state = initialState();
  state.village = { mats: {}, items: {}, cells: [], habitats: [], guestbook: { '12': { first: TODAY, visits: 1 } } } as never;
  assert.equal(rootOf(12), 10);
  const f = pickCraftedSpecies(state, 'poke', seeded(1), 0)!;
  assert.deepEqual([f.id, f.fromBook], [10, true]);
  state.dex.push(10);
  for (let k = 1; k < 200; k++) {
    const g = pickCraftedSpecies(state, 'poke', seeded(k), 0)!;
    assert.notEqual(g.id, 10);
    assert.ok(!state.dex.includes(g.id));
    assert.ok(!g.fromBook);
  }
});
