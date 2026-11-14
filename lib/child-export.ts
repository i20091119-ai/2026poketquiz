import { LOG_KINDS } from './activity-log.ts';
import { battleIvFromFeeds, POTIONS, TYPE_INFO, type TypeKey } from './game-config.ts';
import { RECIPE_INFO } from './village-craft.ts';
import { villageLevel, villageOpen, villageStars, type GameState } from './game-engine.ts';
import { isSpecies, shinyName, species } from './pokedex.ts';

type Row = { seq: number; at: string; date: string; kind: string; data: Record<string, unknown> };

/** UTC 시각 → 한국 시간 'YYYY-MM-DD HH:MM:SS' */
export const kst = (iso: string) => new Date(Date.parse(iso) + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);

/** 모르는 번호(포켓로그의 지역 폼 등)가 있어도 내보내기가 멈추지 않게 */
const nameOf = (id: number, shiny = false) => (isSpecies(id) ? (shiny ? shinyName(id) : species(id).name) : `#${id}`);
const label = (t: string) => TYPE_INFO[t as TypeKey]?.label ?? t;

/**
 * "아이 기록 내보내기" 파일 내용. 아이의 진짜 기록과 활동 기록(activity_log)만 쓰고, 시뮬레이션(시험용) 기록은 들어가지 않습니다.
 * 시각은 모두 한국 시간. 활동 기록은 기록을 시작한 날(since)부터 쌓였고, 그 전 내용은 퀴즈 기록에 남아 있는 것만 들어갑니다.
 */
export function buildChildExport(input: { state: GameState; rows: Row[]; since: string | null; appVersion: string; exportedAt: string }) {
  const { state, since } = input;
  // "아이 게임 처음부터 다시 하기"를 누른 적이 있으면 그 앞 기록은 따로 둠 (포켓몬 번호표가 다시 p1부터라 섞이지 않게)
  const lastReset = input.rows.filter(r => r.kind === 'reset').reduce((n, r) => Math.max(n, r.seq), 0);
  const rows = input.rows.filter(r => r.seq > lastReset);
  const beforeReset = input.rows.filter(r => r.seq < lastReset && r.kind !== 'reset');
  const of = (kind: string) => rows.filter(r => r.kind === kind);
  const plain = (r: Row) => ({ time: kst(r.at), date: r.date, ...r.data });

  // ---- 하루 활동: 퀴즈 기록에 남은 것(35일·14일) + 활동 기록의 하루 요약(더 오래) ----
  type Day = { date: string; quizSeconds: number; solveSeconds?: number; villageSeconds?: number; answered: number; correctFirstTry: number; battleSeconds: number; maxWave: number; newGames: number };
  const days = new Map<string, Day>();
  for (const [date, d] of Object.entries(state.quizLog ?? {})) days.set(date, { date, quizSeconds: d.seconds, solveSeconds: d.solveSeconds ?? 0, villageSeconds: d.villageSeconds ?? 0, answered: d.answered, correctFirstTry: d.correct, battleSeconds: 0, maxWave: 0, newGames: 0 });
  for (const [date, d] of Object.entries(state.battleLog ?? {})) days.set(date, { date, quizSeconds: 0, answered: 0, correctFirstTry: 0, ...days.get(date), battleSeconds: d.seconds, maxWave: d.maxWave, newGames: d.starts });
  for (const r of of('day')) days.set(String(r.data.date), r.data as Day);
  const dailyActivity = [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({
      ...d,
      // quizMinutes = 앱 사용 시간(퀴즈 앱 화면이 보이는 동안), solveMinutes = 문제 푸는 시간(문제 창이 열려 있는 동안, 2026-11-12부터)
      quizMinutes: Math.round(d.quizSeconds / 6) / 10, 앱사용분: Math.round(d.quizSeconds / 6) / 10,
      solveMinutes: Math.round((d.solveSeconds ?? 0) / 6) / 10, 문제푸는분: Math.round((d.solveSeconds ?? 0) / 6) / 10,
      마을분: Math.round((d.villageSeconds ?? 0) / 6) / 10,
      battleMinutes: Math.round(d.battleSeconds / 6) / 10,
    }));

  // ---- 포켓로그: 새 판 시작과 판 결과를 짝지음 ----
  const starts = of('battleStart');
  // 같은 판이 두 번 올라온 경우(다른 기기가 다시 올림)는 한 번만
  const runRows = [...new Map(of('battleRun').map(r => [String(r.data.runId), r])).values()].sort((a, b) => Date.parse(String(a.data.endedAt)) - Date.parse(String(b.data.endedAt)));
  const revives = of('revive');
  const usedStart = new Set<number>();
  const runs = runRows.map((r, i) => {
    const end = Date.parse(String(r.data.endedAt));
    const prevEnd = i > 0 ? Date.parse(String(runRows[i - 1].data.endedAt)) : -Infinity;
    // 이 판이 끝나기 전에 가장 최근에 시작된 새 판 (아직 다른 판에 짝지어지지 않은 것)
    // 중단한 판은 게임이 기억한 시작 시각을 먼저 씀
    const own = typeof r.data.startedAt === 'string' ? Date.parse(r.data.startedAt) : NaN;
    const start = Number.isNaN(own)
      ? [...starts].reverse().find(s => !usedStart.has(s.seq) && Date.parse(s.at) <= end)
      : [...starts].reverse().find(s => !usedStart.has(s.seq) && Math.abs(Date.parse(s.at) - own) < 6 * 3600_000);
    if (start) usedStart.add(start.seq);
    return {
      startDate: start ? start.date : !Number.isNaN(own) ? kst(String(r.data.startedAt)).slice(0, 10) : null,
      startTime: start ? kst(start.at) : !Number.isNaN(own) ? kst(String(r.data.startedAt)) : null,
      endDate: kst(String(r.data.endedAt)).slice(0, 10), endTime: kst(String(r.data.endedAt)),
      wave: r.data.wave, result: r.data.result, // '게임 오버' | '클리어' | '중단'(새 게임이 덮어쓴 끝나지 않은 판)
      party: (r.data.party as { species: number; level: number; shiny: boolean }[] ?? []).map(p => ({ ...p, name: nameOf(p.species, p.shiny) })),
      // 게임 오버 화면에서 쓴 부활권은 그 판이 진짜 끝나기 전에 기록되므로 "앞 판이 끝난 뒤 ~ 이 판이 끝날 때까지"로 셈
      reviveUsed: revives.filter(v => (v.data.runId ? v.data.runId === r.data.runId : Date.parse(v.at) > prevEnd && Date.parse(v.at) <= end)).length,
      playSeconds: r.data.playTime ?? null,
    };
  });

  // ---- 성장 ----
  const how = new Map(of('pokemon').map(r => [`${r.data.uid}|${r.data.obtainedAt}`, r.data.how]));
  const pokemon = state.owned.map(p => ({
    uid: p.uid, species: p.species, name: nameOf(p.species, p.shiny), shiny: !!p.shiny,
    obtainedAt: kst(p.obtainedAt), how: how.get(`${p.uid}|${p.obtainedAt}`) ?? '(기록 시작 전에 얻음)',
  }));
  const candyRows = of('candy');

  const tracking = Object.entries(LOG_KINDS).map(([kind, item]) => ({ item, since: of(kind)[0]?.date ?? (since ? `${since} 이후 아직 없음` : '(아직 기록 없음)'), count: of(kind).length }));

  return {
    안내: '아이 기록 내보내기. 시각은 모두 한국 시간이고, 시험용(시뮬레이션) 기록은 들어 있지 않아요.',
    만든시각: kst(input.exportedAt), 앱버전: input.appVersion,
    기록시작: {
      활동기록시작일: since,
      항목별: tracking,
      퀴즈기록에남은범위: {
        하루앱사용시간: Object.keys(state.quizLog ?? {}).sort()[0] ?? null,
        포켓로그하루기록: Object.keys(state.battleLog ?? {}).sort()[0] ?? null,
        보유포켓몬: state.owned.map(p => p.obtainedAt).sort()[0]?.slice(0, 10) ?? null,
      },
    },
    문제풀이: of('answer').map(plain),
    하루활동설명: '앱사용분 = 퀴즈 앱 화면이 보이는 동안(도감·가방 등 포함), 문제푸는분 = 문제 창이 열려 있는 동안(2026-11-12부터 기록), 마을분 = 포켓몬 마을 안에 있던 동안(2026-11-13부터)',
    하루활동: dailyActivity,
    포켓로그: {
      판결과설명: "result: '게임 오버' / '클리어' / '중단'(끝나지 않은 판을 새 게임이 덮어씀, 2026-11-12부터). 판이 아직 진행 중이면 여기 없어요",
      판결과수: { 게임오버: runs.filter(r => r.result === '게임 오버').length, 클리어: runs.filter(r => r.result === '클리어').length, 중단: runs.filter(r => r.result === '중단').length },
      판: runs,
      새판시작: starts.map(plain),
      부활권사용: revives.map(plain),
      계열별최고레벨: Object.fromEntries(Object.entries(state.battleLevels ?? {}).map(([id, lv]) => [nameOf(Number(id)), lv])),
    },
    성장: {
      보유포켓몬: pokemon,
      진화기록: of('evolve').map(plain),
      에너지변화: of('stat').map(plain),
      지금에너지: Object.fromEntries(Object.entries(state.stats).map(([t, v]) => [label(t), v])),
      경험치: { 모은전체: state.exp, 에너지로바꾼: state.expSpent ?? 0 },
      사탕: { 보낸총량: state.candy?.sent ?? 0, 기록: candyRows.map(plain) },
      도감: { 기본: state.dex.length, 이로치: (state.shiny ?? []).length, 메가: (state.megas ?? []).length },
      모험팀: {
        파트너: state.owned.find(p => p.uid === state.partner) ? nameOf(state.owned.find(p => p.uid === state.partner)!.species) : null,
        친구: (state.team ?? []).map(uid => state.owned.find(p => p.uid === uid)).filter(p => !!p).map(p => nameOf(p!.species)),
        바꾼기록: of('team').map(plain),
      },
      친해짐: Object.fromEntries(Object.entries(state.hearts ?? {}).map(([id, n]) => [nameOf(Number(id)), n])),
      배틀힘: {
        계열별개체값: Object.fromEntries(Object.entries(state.battlePower ?? {}).map(([id, n]) => [nameOf(Number(id)), battleIvFromFeeds(n)])),
        오른기록: of('star').map(plain),
      },
      경험치바꾸기오늘: state.expExchange ?? null,
    },
    보상: {
      볼연결과: of('ball').map(plain),
      상자와보상고른내용: of('reward').map(plain),
      아이템먹임: of('potion').map(plain),
      보낸선물: of('giftSent').map(plain),
      선물열기: of('giftOpen').map(plain),
      선물답장: of('giftReply').map(plain),
      선물현재상태: (state.gifts ?? []).map(g => ({
        id: g.id, 보낸날: g.date, 보낸사람: g.from, 이유: g.reason, 크기: g.size, 편지: g.letter,
        연것: g.opened ? { 시각: kst(g.opened.at), 고른것: g.opened.got } : null,
        답장: g.reply ? { 시각: kst(g.reply.at), 스티커: g.reply.sticker, 글: g.reply.text } : null,
      })),
      이벤트: { 지금: state.events ?? null, 부활권: state.reviveTickets ?? 0, 진행기록: of('event').map(plain) },
      기간한정이벤트: { 지금: state.limited ?? null, 진행기록: of('limited').map(plain) },
      나들이체험보고서: { 지금: state.outings ?? [], 진행기록: of('outing').map(plain) },
      포켓몬마을: { 마을지금: state.village ?? null, 만난손님: state.met ?? [], 마을레벨: villageLevel(state), 마을별: villageStars(state), 연땅: villageOpen(state) },
      // 열매·제작대 (2026-11-14): 열매가 들어온 곳별 개수(이날부터 셈)·제작 기록(날짜·레시피·쓴 열매·나온 포켓몬)
      열매들어온곳: Object.fromEntries(Object.entries(state.berrySources ?? {}).map(([k, n]) => [({ box: '상자', gift: '보호자선물', tree: '마을열매나무', guest: '손님', returned: '제작볼대신돌려받음', catch: '낚시벌레잡기' } as Record<string, string>)[k] ?? k, n])),
      제작기록: (state.village?.craftLog ?? []).map(l => ({ 날짜: l.date, 레시피: RECIPE_INFO[l.recipe].name, 쓴열매: POTIONS[l.berry].label,
        결과: !l.result ? (l.recipe === 'sapling' ? '묘목' : '아직 안 엶') : 'returned' in l.result ? `열매 ${l.result.returned}개 돌려받음` : `${l.result.shiny ? '✨이로치 ' : ''}${species(l.result.species).name}` })),
      트레이너훈련과전설조각: { 훈련지금: state.offline ?? null, 전설지금: state.legend ?? null, 부모님기록: of('offline').map(plain), 전설진행기록: of('legend').map(plain) },
    },
    ...(beforeReset.length ? { 처음부터다시하기_이전기록: { 설명: '아이 게임을 처음부터 다시 하기 전에 쌓인 활동 기록(원본 그대로)', 기록: beforeReset.map(plain) } } : {}),
  };
}
