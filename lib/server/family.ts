// 가족 대시보드(따로 만든 프로그램)와 이어지는 창구 (2026-11-20 부모님 요청). 사용법: docs/family-api.md
// - 가족 접속 코드로만 열림 (보호자 공간에서 만들고, 서명값만 저장). 아이 기록은 읽기만 하고,
//   바꾸는 것은 "제때 등교" 사건 하나(state.school 에 새로 쌓기)뿐.
// - ?player=sim 이면 시험용 기록(보호자 시뮬레이션)과 그 "오늘"을 씀.
import { env } from 'cloudflare:workers';
import { nowKorea, type Clock } from '../battle-rest.ts';
import { offlineView, schoolReport, villageView, widenVillageMap, type GameState } from '../game-engine.ts';
import { MARK_SYMBOL, weekDates, weekScore, weekStartOf, type OfflineRules } from '../offline.ts';
import { species, shinyName } from '../pokedex.ts';
import type { SchoolRules } from '../school.ts';
import { HABITAT_INFO, MAP_H, MAP_W, MAP_X0, PLOTS, cellPos } from '../village.ts';
import { GROUND_LEGEND, GROUND_ROWS, MAP_OBJECTS, PLAYER } from '../village-map.ts';
import { TREE_SPOTS } from '../village-craft.ts';
import { sameText, sign } from './parent-auth.ts';
import { simClock } from './player.ts';
import { getFamilyCodeHash, getVillagePresence, REAL_PLAYER, SIM_PLAYER, type PlayerId } from './store.ts';

export const FAMILY_CODE_HEADER = 'x-family-code';
export const hashFamilyCode = (code: string) => sign('family-code:' + code.trim(), env.PARENT_PASSWORD ?? '');
/** 새 접속 코드 (읽기 쉬운 글자 24자) */
export function newFamilyCode(): string {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map(b => abc[b % abc.length]).join('').replace(/(.{6})(?!$)/g, '$1-');
}
/** 요청의 접속 코드가 맞는지 (Authorization: Bearer <코드> 또는 X-Family-Code: <코드>) */
export async function familyAuthorized(request: Request): Promise<boolean> {
  const stored = await getFamilyCodeHash();
  if (!stored) return false;
  const auth = request.headers.get('authorization') ?? '';
  const code = (auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : request.headers.get(FAMILY_CODE_HEADER) ?? '').trim();
  if (!code) return false;
  return sameText(await hashFamilyCode(code), stored);
}

/** 다른 주소의 대시보드 화면에서도 부를 수 있게 (쿠키를 쓰지 않으므로 모든 주소 허용) */
export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, x-family-code',
  'access-control-max-age': '86400',
};
export const familyJson = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS } });

/** 어느 기록·오늘을 쓸지: 기본은 아이의 진짜 기록, ?player=sim 이면 시험용 */
export async function familyPlayer(request: Request): Promise<{ id: PlayerId; today: string; clock: Clock }> {
  const sim = new URL(request.url).searchParams.get('player') === 'sim';
  if (!sim) { const real = nowKorea(); return { id: REAL_PLAYER, today: real.date, clock: real }; }
  const c = await simClock();
  return { id: SIM_PLAYER, today: c.today, clock: c.clock };
}

const hm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
/** 마을 접속 중으로 볼 시간 (아이 화면은 마을 안에서 30초마다 위치를 보냄) */
const PRESENCE_FRESH_MS = 90_000;

/** 가족 대시보드에 보여 줄 것 (읽기만, 기록은 바꾸지 않음) */
export async function familyStatus(request: Request, state: GameState, player: { id: PlayerId; today: string; clock: Clock }, rules: { offline: OfflineRules; school: SchoolRules }) {
  const origin = new URL(request.url).origin;
  const { today } = player;
  const img = (id: number, shiny = false) => ({
    art: `${origin}/assets/pokemon/${shiny ? 'shiny/' : ''}${id}.png`,
    pixel: `${origin}/assets/pokemon/pixel/${id}.png`,
  });
  // 파트너
  const p = state.owned.find(o => o.uid === state.partner);
  const partner = p ? { species: p.species, name: p.shiny ? shinyName(p.species) : species(p.species).name, shiny: !!p.shiny, image: img(p.species, !!p.shiny) } : null;
  // 오늘 일일미션
  const d = state.daily?.date === today ? state.daily : null;
  const answered = d ? d.questionIds.filter(id => d.correct.includes(id) || d.wrong.includes(id)).length : 0;
  const dailyMission = { date: today, started: !!d, done: !!d && d.questionIds.length > 0 && answered === d.questionIds.length, answered, total: d?.questionIds.length ?? 0, correct: d?.correct.length ?? 0, review: !!d?.review };
  // 이번 주 트레이너 훈련
  const off = offlineView(state, today, rules.offline.weekGoal);
  const ws = weekStartOf(today);
  const DOW = ['월', '화', '수', '목', '금', '토', '일'];
  const training = {
    weekStart: ws,
    days: weekDates(ws).map((date, i) => ({ date, dow: DOW[i], mark: off.marks[date] ?? null, symbol: off.marks[date] ? MARK_SYMBOL[off.marks[date]] : null, future: date > today })),
    score: weekScore(off.marks, ws),
    goal: off.weeks[ws]?.goal ?? rules.offline.weekGoal,
    /** 합계가 조각 기준 이상인지 (조각은 주가 끝난 뒤 첫 접속에 들어감) */
    reached: false,
    unopenedBoxes: off.boxes.length,
  };
  training.reached = training.score >= training.goal;
  // 마을 (예전 지도 v1 기록이면 새 지도 자리로 옮겨 보여 줌: 읽은 복사본만, 저장 안 함)
  widenVillageMap(state);
  const v = villageView(state, today);
  const presence = await getVillagePresence(player.id);
  const fresh = !!presence?.inside && Date.now() - Date.parse(presence.at) < PRESENCE_FRESH_MS;
  const village = {
    open: v.open, entered: v.entered,
    level: { level: v.level.level, points: v.level.stars, next: v.level.next, keys: v.level.keys },
    map: {
      tile: 16, x0: MAP_X0, width: MAP_W, height: MAP_H,
      legend: GROUND_LEGEND, ground: GROUND_ROWS,
      regions: v.level.regions.map(r => ({ id: r.id, name: r.name, emoji: r.emoji, x: r.x, y: r.y, w: r.w, h: r.h, open: r.status === 'open' })),
      fixedObjects: MAP_OBJECTS.map(o => ({ kind: o.kind, x: o.x, y: o.y })),
    },
    placed: {
      plots: v.cells.map((item, cell) => (item ? { cell, ...cellPos(cell), item } : null)).filter(Boolean),
      habitats: v.habitats.map((h, plot) => (h ? { plot, kind: h.kind, name: HABITAT_INFO[h.kind].name, since: h.since, x: PLOTS[plot].x, y: PLOTS[plot].y } : null)).filter(Boolean),
      decor: v.decor.map(d => ({ item: d.item, kind: d.kind, x: d.x, y: d.y })),
      terrain: v.terrain,
      trees: v.craft.trees.map(t => ({ ...TREE_SPOTS[t.spot], spot: t.spot, berry: t.berry, ready: t.ready })),
    },
    /** 오늘 손님: 자기 서식지(밭) 옆이 집. 화면에서 돌아다니는 자리는 아이 기기에만 있어 보내지 않음 */
    guests: v.guests.map(g => ({ species: g.species, name: species(g.species).name, habitat: g.habitat, habitatName: HABITAT_INFO[g.habitat].name, plot: g.plot, x: PLOTS[g.plot].x + 2, y: PLOTS[g.plot].y + 1, image: img(g.species) })),
    seojun: fresh ? { name: PLAYER.name, inside: true, x: presence!.x, y: presence!.y, at: presence!.at } : { name: PLAYER.name, inside: false, lastSeen: presence?.at ?? null },
  };
  const school = schoolReport(state, today, rules.school);
  return {
    app: 'poke-quiz', player: player.id, today, now: hm(player.clock.minutes),
    partner, dailyMission, training, village,
    school: { today: school.today, deadlineToday: school.deadlineToday, recent: school.arrivals.slice(0, 7) },
  };
}
