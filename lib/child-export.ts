import { LOG_KINDS } from './activity-log.ts';
import { TYPE_INFO, type TypeKey } from './game-config.ts';
import type { GameState } from './game-engine.ts';
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
  type Day = { date: string; quizSeconds: number; answered: number; correctFirstTry: number; battleSeconds: number; maxWave: number; newGames: number };
  const days = new Map<string, Day>();
  for (const [date, d] of Object.entries(state.quizLog ?? {})) days.set(date, { date, quizSeconds: d.seconds, answered: d.answered, correctFirstTry: d.correct, battleSeconds: 0, maxWave: 0, newGames: 0 });
  for (const [date, d] of Object.entries(state.battleLog ?? {})) days.set(date, { date, quizSeconds: 0, answered: 0, correctFirstTry: 0, ...days.get(date), battleSeconds: d.seconds, maxWave: d.maxWave, newGames: d.starts });
  for (const r of of('day')) days.set(String(r.data.date), r.data as Day);
  const dailyActivity = [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({ ...d, quizMinutes: Math.round(d.quizSeconds / 6) / 10, battleMinutes: Math.round(d.battleSeconds / 6) / 10 }));

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
    const start = [...starts].reverse().find(s => !usedStart.has(s.seq) && Date.parse(s.at) <= end);
    if (start) usedStart.add(start.seq);
    return {
      startDate: start ? start.date : null, startTime: start ? kst(start.at) : null,
      endDate: kst(String(r.data.endedAt)).slice(0, 10), endTime: kst(String(r.data.endedAt)),
      wave: r.data.wave, result: r.data.result,
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
        하루퀴즈시간: Object.keys(state.quizLog ?? {}).sort()[0] ?? null,
        포켓로그하루기록: Object.keys(state.battleLog ?? {}).sort()[0] ?? null,
        보유포켓몬: state.owned.map(p => p.obtainedAt).sort()[0]?.slice(0, 10) ?? null,
      },
    },
    문제풀이: of('answer').map(plain),
    하루활동: dailyActivity,
    포켓로그: {
      판: runs,
      새판시작: starts.map(plain),
      부활권사용: revives.map(plain),
      계열별최고레벨: Object.fromEntries(Object.entries(state.battleLevels ?? {}).map(([id, lv]) => [nameOf(Number(id)), lv])),
    },
    성장: {
      보유포켓몬: pokemon,
      진화기록: of('evolve').map(plain),
      스탯변화: of('stat').map(plain),
      지금스탯: Object.fromEntries(Object.entries(state.stats).map(([t, v]) => [label(t), v])),
      경험치: { 모은전체: state.exp, 스탯으로바꾼: state.expSpent ?? 0 },
      사탕: { 보낸총량: state.candy?.sent ?? 0, 기록: candyRows.map(plain) },
      도감: { 기본: state.dex.length, 이로치: (state.shiny ?? []).length, 메가: (state.megas ?? []).length },
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
    },
    ...(beforeReset.length ? { 처음부터다시하기_이전기록: { 설명: '아이 게임을 처음부터 다시 하기 전에 쌓인 활동 기록(원본 그대로)', 기록: beforeReset.map(plain) } } : {}),
  };
}
