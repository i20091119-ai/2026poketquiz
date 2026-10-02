// 게임 규칙. 서버에서만 실행되며, 정답·보상·확률은 모두 여기서 결정합니다.
import {
  ACTIVITY_LOG_DAYS, BALLS, BATTLE_LOG_DAYS, BATTLE_REPORT_MAX_SECONDS, BATTLE_STARTS_PER_DAY, DAILY_ATTEMPTS, DAILY_CANDY, QUIZ_REPORT_MAX_SECONDS, WEAK_AREA, DAILY_BOX_RULES, DAILY_BOX_TABLE, DAILY_PER_SUBJECT, DUPLICATE_BONUS, EXP_EXCHANGE, EXP_GIFT, EXPLORE_ITEM_WEIGHTS,
  eulReul, eunNeun, iGa, SUBJECT_INFO, POTIONS, potionTargets, REWARD_PER_ANSWER, STARTERS, statReward, SUBJECT_BERRY, SUBJECTS, SUBJECT_TYPES, TYPE_INFO, TYPE_KEYS,
  EVENT_INFO, STREAK_DAYS, type EventId,
  GIFT_BALL, GIFT_CANDY, GIFT_CHOICE_INFO, GIFT_EXP, GIFT_HISTORY, GIFT_LETTER_MAX, GIFT_LIMIT_DEFAULT, GIFT_REASON_MAX, GIFT_SENDERS, GIFT_SIZES, REPLY_STICKERS, REPLY_TEXT_MAX,
  SHINY_CHANCE_DEFAULT, type ShinyBallKind,
  type BallKind, type GiftChoice, type GiftLimits, type GiftSender, type GiftSize, type PotionKind, type ReplySticker, type Subject, type TypeKey,
} from './game-config.ts';
import { CATCH_POOLS, evolutionRequirement, evolutionsOf, isSpecies, rootOf, shinyName, species, typeLabel } from './pokedex.ts';
import { RARE_POKEMON } from './rare-pokemon.ts';
import { hmToMinutes, LIMITED_EVENTS, leftLabel, limitedById, limitedPhase, limitedShinyMultiplier, minutesLeft, PIECE_INFO, type LimitedEventDef } from './limited-events.ts';

export type Question = {
  id: number;
  subject: Subject;
  type: TypeKey;
  prompt: string;
  choices: string[];
  answer: number;
  explanation: string;
  /** 영역 (예: 덧셈, 받침·맞춤법). 비어 있으면 '기타'로 묶입니다. */
  area: string;
};
export type PublicQuestion = Omit<Question, 'answer' | 'explanation'>;
/** 영역 이름 (비어 있으면 '기타') */
export const areaOf = (q: { area?: string }) => q.area?.trim() || '기타';
export type ActiveBank = { id: number; title: string; questions: Question[] };

export type BoxItem =
  | { kind: 'potion'; potion: PotionKind; amount: number }
  | { kind: 'ball'; ball: BallKind }
  /** 포켓로그 배틀 추가권 1장 */
  | { kind: 'ticket' };
export type Ball = { id: string; kind: BallKind };
export type Potion = { id: string; kind: PotionKind };
/** shiny: 이로치(색이 다른 포켓몬). 퀴즈 볼에서만 나오고, 기본 모습과 따로 한 마리로 셈 */
export type OwnedPokemon = { uid: string; species: number; obtainedAt: string; shiny?: boolean };
export type BankProgress = {
  solved: number[];
  wrong: Record<string, number>;
  /** 틀린 문제 → 마지막으로 틀린 날짜. 그날은 다시 나오지 않고, 다른 날 맞히면 빠집니다. */
  review: Record<string, string>;
  subjectRewards: Subject[];
  masterClaimed: boolean;
  /** 영역별 성적: '과목|영역' → 최근 결과(o/x 최대 8개), 맞힌 수, 틀린 수 */
  areas?: Record<string, AreaStat>;
  /** 영역 기능이 생기기 전에 푼 문제는 한 번 지난 기록(맞힌 문제·틀린 횟수)으로 채워 둠 */
  areasSeeded?: boolean;
};
export type AreaStat = { recent: string; correct: number; wrong: number };

export type GameState = {
  version: 1;
  /** 지금까지 모은 경험치 (줄지 않음). 쓸 수 있는 경험치 = exp - expSpent */
  exp: number;
  /** 스탯으로 바꾸는 데 쓴 경험치 */
  expSpent?: number;
  /** 받은 경험치 선물 수 (EXP_GIFT.every마다 하나) */
  expGifts?: number;
  stats: Record<TypeKey, number>;
  partner: string | null;
  owned: OwnedPokemon[];
  dex: number[];
  balls: Ball[];
  /** 가방에 있는 아이템(열매·상처약). 포켓몬에게 먹이면 적힌 속성 스탯이 오릅니다. */
  potions: Potion[];
  seq: number;
  /**
   * 오늘의 미션. 문제마다 DAILY_ATTEMPTS번까지 풀 수 있습니다.
   * correct: 맞힌 문제, wrong: 기회를 다 써서 틀린 문제, tries: 문제별 틀린 횟수,
   * box: 랜덤상자 (고르기 시작하면 3개 내용이 정해짐), claimed: 고를 수 있는 만큼 다 골랐는지
   */
  daily: {
    date: string; bankId: number; questionIds: number[];
    correct: number[]; wrong: number[]; tries: Record<string, number>;
    box: { items: BoxItem[]; picks: number[] } | null;
    claimed: boolean;
  } | null;
  banks: Record<string, BankProgress>;
  /** 포켓로그(/battle) 새 게임 시도: 날짜(한국 시간)와 그날 시작한 횟수 */
  battle?: { date: string; starts: number };
  /** 포켓로그 날짜별 기록: 최고 웨이브, 플레이한 초, 새 게임 횟수 (최근 BATTLE_LOG_DAYS 일만 보관) */
  battleLog?: Record<string, BattleDay>;
  /** 일일미션으로 받은 포켓로그 사탕: 아직 게임이 가져가지 않은 것(pending), 지금까지 보낸 총량, 마지막으로 준 날 */
  candy?: { pending: CandyGift[]; sent: number; lastDate?: string; lastGift?: CandyGift };
  /** 퀴즈 날짜별 기록: 화면을 보며 보낸 초, 푼 문제 수, 첫 시도에 맞힌 수 (최근 ACTIVITY_LOG_DAYS 일) */
  quizLog?: Record<string, QuizDay>;
  /** 포켓로그에서 도달한 최고 레벨: 진화 계열 첫 모습 번호 → 레벨 (판이 바뀌어도 최고 기록은 남음) */
  battleLevels?: Record<string, number>;
  /** 이로치 도감: 퀴즈 볼에서 얻은 이로치(진화한 모습 포함)의 도감 번호. 이 목록에 있는 것만 포켓로그에서 이로치로 출전할 수 있어요 */
  shiny?: number[];
  /** 메가 도감: 해금한 메가 모습의 키(lib/megas.ts 의 key). 지금은 해금 방법이 없어 비어 있어요 (특별 미션이 생기면 채움) */
  megas?: string[];
  /** 보호자가 보낸 선물 (최근 GIFT_HISTORY 개, 오래된 것부터) */
  gifts?: Gift[];
  /** 배틀 추가권: 그날 새 게임 횟수를 다 썼을 때 1장으로 한 번 더. 안 쓰면 남아 있음 */
  battleTickets?: number;
  /** 도전 이벤트 (이벤트 탭) */
  events?: { allClear?: AllClearEvent; streak?: StreakEvent };
  /** 부활권: 게임 오버된 포켓로그 판을 그 웨이브에서 체력 가득 채워 되살림 */
  reviveTickets?: number;
  /** 기간 한정 이벤트 진행 (이벤트 id → 진행). lib/limited-events.ts */
  limited?: Record<string, LimitedProgress>;
};
/**
 * 기간 한정 이벤트(레인보우) 하나의 진행.
 * streak: 과목별 지금 연속으로 맞힌 수, used: 이번 연속에서 맞힌 문제(다시 풀기 문제를 고를 때 뺌),
 * missed: 오늘 틀린 다시 풀기 문제(오늘은 다시 안 나옴), pieces: 모은 조각(모은 순서), changed: 이로치로 바꾼 포켓몬,
 * ended: 기간이 끝나 정산한 결과(조각 수, 받은 사탕)
 */
export type LimitedProgress = {
  seen?: string; acceptedAt?: string;
  streak: Partial<Record<Subject, number>>;
  used: Partial<Record<Subject, number[]>>;
  missed?: { date: string; ids: number[] };
  pieces: Subject[];
  pieceAt: Partial<Record<Subject, string>>;
  completedAt?: string;
  changed?: { uid: string; species: number; at: string };
  remindSeen?: boolean;
  ended?: { date: string; pieces: number; candy: number };
  endSeen?: boolean;
};
/** 도전! 전 과목 올클리어: 수락한 날, 그때 공개 중이던 문제은행, 마스터한 과목(문제은행이 바뀌어도 남음) */
export type AllClearEvent = { acceptedAt: string; bankId: number; mastered: Subject[]; completedAt?: string; celebrated?: boolean };
/** 일일미션 연속: 연속 일수, 마지막으로 다 푼 날, 최고 기록, 완료일, 보상 상자 */
export type StreakEvent = {
  acceptedAt: string; count: number; lastDate?: string; best: number; completedAt?: string;
  box?: { items: BoxItem[]; pick: number | null };
};
/** 보호자 선물 하나. opened 가 없으면 아직 안 연 것, reply 가 없으면 아직 답장 안 한 것 */
export type Gift = {
  id: string;
  /** 보낸 날짜(그 기록 기준 오늘)와 시각 */
  date: string; sentAt: string;
  from: GiftSender; reason: string; size: GiftSize; letter: string;
  opened?: {
    at: string; choice: GiftChoice;
    /** 아이가 받은 것 설명 (예: 사과열매, 몬스터볼, 상자에서 나온 것) */
    got: string;
    /** 받은 것이 볼이면 가방의 볼 번호 (바로 열 수 있게) */
    ballId?: string;
  };
  reply?: { sticker: ReplySticker; text: string; at: string; /** 보호자가 확인했는지 */ seen?: boolean };
};
export type QuizDay = { seconds: number; answered: number; correct: number };
export type BattleDay = { maxWave: number; seconds: number; starts: number };
/** 포켓로그에 보낼 사탕 한 묶음. species = 퀴즈 도감 번호(게임이 진화 전 첫 모습으로 바꿈) */
export type CandyGift = { id: string; date: string; species: number; amount: number };

export class GameError extends Error {}
function fail(message: string): never { throw new GameError(message); }

export type Random = () => number;
export const secureRandom: Random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

export const todayKorea = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

/** 'YYYY-MM-DD' 날짜에서 days 일 뒤 (시뮬레이션의 "다음 날로 넘기기"에 씀) */
export function shiftDate(date: string, days: number): string {
  const t = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(t)) return date;
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

export function initialState(): GameState {
  return {
    version: 1, exp: 0,
    stats: Object.fromEntries(TYPE_KEYS.map(t => [t, 0])) as Record<TypeKey, number>,
    partner: null, owned: [], dex: [], balls: [], potions: [], seq: 0, daily: null, banks: {},
  };
}

// ---------- 작은 도우미 ----------
const pick = <T,>(list: readonly T[], random: Random): T => list[Math.floor(random() * list.length)];
function weighted<T>(table: readonly { weight: number }[], random: Random): T {
  const total = table.reduce((sum, row) => sum + row.weight, 0);
  let roll = random() * total;
  for (const row of table) { roll -= row.weight; if (roll < 0) return row as T; }
  return table[table.length - 1] as T;
}
function shuffle<T>(list: T[], random: Random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
const nextId = (state: GameState, prefix: string) => `${prefix}${++state.seq}`;

function progress(state: GameState, bankId: number): BankProgress {
  const prog = state.banks[bankId] ??= { solved: [], wrong: {}, review: {}, subjectRewards: [], masterClaimed: false };
  prog.review ??= {}; // 복습 기능 이전에 저장된 기록
  return prog;
}
// ---------- 영역(약점) ----------
export const areaKey = (q: { subject: Subject; area?: string }) => `${q.subject}|${areaOf(q)}`;
/** 문제를 풀 때마다 그 영역의 최근 결과를 남깁니다. */
function noteArea(prog: BankProgress, q: Question, ok: boolean) {
  const stat = (prog.areas ??= {})[areaKey(q)] ??= { recent: '', correct: 0, wrong: 0 };
  stat.recent = (stat.recent + (ok ? 'o' : 'x')).slice(-8);
  if (ok) stat.correct += 1; else stat.wrong += 1;
}
/** 최근 WEAK_AREA.recent 번 중 WEAK_AREA.wrong 번 이상 틀렸으면 약점 영역 */
export function isWeakArea(stat?: AreaStat): boolean {
  if (!stat) return false;
  const recent = stat.recent.slice(-WEAK_AREA.recent);
  return (recent.match(/x/g)?.length ?? 0) >= WEAK_AREA.wrong;
}
const isWeakQuestion = (prog: BankProgress, q: Question) => isWeakArea(prog.areas?.[areaKey(q)]);

/** 전날 이전에 틀려서 오늘 다시 나와야 하는 문제 */
const isDue = (prog: BankProgress, id: number, today: string) => !!prog.review[id] && prog.review[id] < today;
/** 오늘 이미 틀린 문제 (오늘은 다시 풀 수 없음) */
const wrongToday = (prog: BankProgress, id: number, today: string) => prog.review[id] === today;
export const publicQuestion = ({ id, subject, type, prompt, choices, area }: Question): PublicQuestion =>
  ({ id, subject, type, prompt, choices, area });

/**
 * 새 포켓몬을 내 목록에 넣습니다. 이로치는 기본 모습과 따로 한 마리로 세어서, 이미 기본 모습이 있어도 이로치는 새로 얻습니다.
 * 같은 모습(기본끼리·이로치끼리)이 또 나오면 우정 보너스 스탯.
 */
function addPokemon(state: GameState, id: number, now: string, shiny = false) {
  const duplicate = state.owned.some(p => p.species === id && !!p.shiny === shiny);
  if (shiny) {
    state.shiny ??= [];
    if (!state.shiny.includes(id)) state.shiny.push(id);
  } else if (!state.dex.includes(id)) state.dex.push(id);
  if (duplicate) {
    const type = species(id).types[0];
    state.stats[type] += DUPLICATE_BONUS;
    return { duplicate: true, bonus: { type, amount: DUPLICATE_BONUS } };
  }
  const uid = nextId(state, 'p');
  state.owned.push(shiny ? { uid, species: id, obtainedAt: now, shiny: true } : { uid, species: id, obtainedAt: now });
  return { duplicate: false, uid };
}

/** 이로치 볼: 아이가 가진 포켓몬의 1단계(계열 첫 모습) 중 하나. 아직 이로치가 없는 계열을 먼저 */
function pickShinyBallSpecies(state: GameState, random: Random): number {
  const lines = [...new Set(state.owned.map(p => rootOf(p.species)))];
  const have = new Set((state.shiny ?? []).map(rootOf));
  const fresh = lines.filter(id => !have.has(id));
  return pick(fresh.length ? fresh : lines, random);
}

function rollPotion(potion: PotionKind): BoxItem {
  return { kind: 'potion', potion, amount: POTIONS[potion].amount };
}
/** 보상을 주고, 볼이면 새 볼 id를 돌려줍니다. */
function grant(state: GameState, item: BoxItem): string | null {
  if (item.kind === 'potion') { (state.potions ??= []).push({ id: nextId(state, 'm'), kind: item.potion }); return null; }
  if (item.kind === 'ticket') { state.battleTickets = (state.battleTickets ?? 0) + 1; return null; }
  const id = nextId(state, 'b');
  state.balls.push({ id, kind: item.ball });
  return id;
}

// ---------- 일일미션 ----------
/** 'YYYY-MM-DD' → 1970-01-01부터 며칠째 */
const dayNumber = (date: string) => Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);

/**
 * 영역별 성적은 문제를 풀 때마다 쌓이므로, 영역 기능이 생기기 전에 푼 문제는 영역표에 빠져 있었습니다.
 * 한 번만, 지난 기록으로 채웁니다: 맞힌 문제 수 = 영역에서 맞힌 적 있는 문제 수, 틀린 수 = 그 문제들의 틀린 횟수 합.
 * (언제 틀렸는지는 몰라서 "최근 결과"는 비워 두고, 그래서 약점으로 잡히지는 않아요.) 이미 쌓인 영역은 건드리지 않습니다. 바꿨으면 true.
 */
export function seedAreaStats(state: GameState, bank: ActiveBank | null): boolean {
  if (!bank) return false;
  const prog = progress(state, bank.id);
  if (prog.areasSeeded) return false;
  prog.areasSeeded = true;
  const solved = new Set(prog.solved);
  const seeded = new Map<string, AreaStat>();
  for (const q of bank.questions) {
    const wrong = prog.wrong[q.id] ?? 0;
    if (!solved.has(q.id) && !wrong) continue;
    const key = areaKey(q);
    if (prog.areas?.[key]) continue; // 이미 쌓이고 있는 영역
    const stat = seeded.get(key) ?? { recent: '', correct: 0, wrong: 0 };
    if (solved.has(q.id)) stat.correct += 1;
    stat.wrong += wrong;
    seeded.set(key, stat);
  }
  if (seeded.size) prog.areas = { ...(prog.areas ?? {}), ...Object.fromEntries(seeded) };
  return true;
}

/** 오늘의 미션이 없거나 문제은행이 바뀌었으면 과목별로 새로 뽑습니다. 바뀌었으면 true. */
export function ensureDaily(state: GameState, bank: ActiveBank | null, today: string, random: Random): boolean {
  const seeded = seedAreaStats(state, bank);
  return ensureDailyCore(state, bank, today, random) || seeded;
}
function ensureDailyCore(state: GameState, bank: ActiveBank | null, today: string, random: Random): boolean {
  if (!bank) return false;
  const d = state.daily;
  if (d) { d.wrong ??= []; d.tries ??= {}; d.box ??= null; } // 이전 형식으로 저장된 기록
  if (d && d.date === today && (d.claimed || d.box)) return false;
  if (d && d.date === today && d.bankId === bank.id) {
    // 부모가 문제를 지웠으면 오늘의 미션에서도 빼서 완료할 수 있게 합니다.
    const exists = new Set(bank.questions.map(q => q.id));
    const kept = d.questionIds.filter(id => exists.has(id));
    if (kept.length === d.questionIds.length) return false;
    d.questionIds = kept;
    return true;
  }
  const prog = progress(state, bank.id);
  const solved = new Set(prog.solved);
  const ids: number[] = [];
  for (const subject of SUBJECTS) {
    const pool = bank.questions.filter(q => q.subject === subject);
    // 전에 틀린 문제 → 안 푼 문제 → 이미 맞힌 문제 순서
    // 오늘 탐험에서 틀린 문제는 오늘 다시 풀지 않도록 빼 둡니다.
    const due = pool.filter(q => isDue(prog, q.id, today));
    const rest = pool.filter(q => !isDue(prog, q.id, today) && !wrongToday(prog, q.id, today));
    // 약점 영역(최근에 자주 틀린 영역)의 다른 문제를 먼저 놓아 "변형 문제"가 더 자주 나오게 합니다.
    const weak = (q: Question) => isWeakQuestion(prog, q);
    const unsolved = rest.filter(q => !solved.has(q.id)), done = rest.filter(q => solved.has(q.id));
    const ordered = [
      ...shuffle(due, random),
      ...shuffle(unsolved.filter(weak), random), ...shuffle(unsolved.filter(q => !weak(q)), random),
      ...shuffle(done.filter(weak), random), ...shuffle(done.filter(q => !weak(q)), random),
    ];
    // 전에 틀린 문제는 먼저 넣고, 남은 자리는 속성이 고르게 돌아가도록 날짜마다 속성 순서를 바꿔 채웁니다.
    // (예: 과목마다 속성 3개, 하루 3문제씩이면 매일 속성마다 1문제)
    const picked = ordered.filter(q => isDue(prog, q.id, today)).slice(0, DAILY_PER_SUBJECT);
    const types = SUBJECT_TYPES[subject];
    const offset = (dayNumber(today) * DAILY_PER_SUBJECT) % types.length;
    const rotation = types.map((_, i) => types[(offset + i) % types.length]);
    while (picked.length < DAILY_PER_SUBJECT) {
      // 오늘 아직 적게 나온 속성부터 (같으면 날짜별 순서대로) 채웁니다.
      const count = (t: TypeKey) => picked.filter(q => q.type === t).length;
      const byNeed = [...rotation].sort((a, b) => count(a) - count(b));
      // 약점 영역 문제는 과목당 WEAK_AREA.maxPerSubjectDaily 개까지만 (한 영역이 미션을 독차지하지 않게)
      const weakFull = picked.filter(q => !isDue(prog, q.id, today) && weak(q)).length >= WEAK_AREA.maxPerSubjectDaily;
      const candidates = weakFull && ordered.some(q => !picked.includes(q) && !weak(q)) ? ordered.filter(q => !weak(q) || isDue(prog, q.id, today)) : ordered;
      const next = byNeed.map(t => candidates.find(q => !picked.includes(q) && q.type === t)).find(Boolean)
        ?? candidates.find(q => !picked.includes(q)) ?? ordered.find(q => !picked.includes(q));
      if (!next) break;
      picked.push(next);
    }
    ids.push(...picked.map(q => q.id));
  }
  state.daily = { date: today, bankId: bank.id, questionIds: ids, correct: [], wrong: [], tries: {}, box: null, claimed: false };
  return true;
}

/** 오늘의 미션 문제를 모두 풀었는지 (맞혔든 틀렸든) */
const dailyFinished = (state: GameState) =>
  !!state.daily && state.daily.questionIds.length > 0 &&
  state.daily.questionIds.every(id => state.daily!.correct.includes(id) || state.daily!.wrong.includes(id));
/** 오늘 맞힌 개수로 랜덤상자를 몇 개 고를 수 있는지 (다 풀기 전에는 0) */
export function dailyBoxPicks(state: GameState): number {
  const d = state.daily;
  if (!d || !dailyFinished(state)) return 0;
  const correct = d.questionIds.filter(id => d.correct.includes(id)).length;
  const rule = DAILY_BOX_RULES.find(r => r.minCorrect === 'all' ? correct === d.questionIds.length : correct >= r.minCorrect);
  return rule?.picks ?? 0;
}
/** 아직 안 고른 상자 내용은 숨깁니다 (다 고른 뒤에 공개). */
const maskedBox = (d: NonNullable<GameState['daily']>) => d.box && {
  picks: d.box.picks,
  items: d.box.items.map((item, i) => (d.claimed || d.box!.picks.includes(i) ? item : null)),
};

// ---------- 탐험 ----------
const subjectQuestions = (bank: ActiveBank, subject: Subject) => bank.questions.filter(q => q.subject === subject);
function subjectMastered(state: GameState, bank: ActiveBank, subject: Subject) {
  const qs = subjectQuestions(bank, subject);
  const solved = new Set(progress(state, bank.id).solved);
  return qs.length > 0 && qs.every(q => solved.has(q.id));
}
/** 문제가 하나라도 있는 과목을 모두 풀었는지 */
function allMastered(state: GameState, bank: ActiveBank) {
  const withQuestions = SUBJECTS.filter(s => subjectQuestions(bank, s).length > 0);
  return withQuestions.length > 0 && withQuestions.every(s => subjectMastered(state, bank, s));
}

/** 오늘의 미션에 들어 있는 문제 (탐험에서는 빼서 하루에 두 번 풀지 않게 합니다) */
const inTodayDaily = (state: GameState, id: number, today: string) =>
  state.daily?.date === today && state.daily.questionIds.includes(id);

/** 탐험에서 나올 문제: 아직 못 맞힌 문제. 오늘 틀린 문제와 오늘의 미션 문제는 빼 둡니다. */
function newExplorePool(state: GameState, bank: ActiveBank, subject: Subject, today: string) {
  const prog = progress(state, bank.id);
  const solved = new Set(prog.solved);
  return subjectQuestions(bank, subject).filter(q =>
    !solved.has(q.id) && !wrongToday(prog, q.id, today) && !inTodayDaily(state, q.id, today));
}
/**
 * 탐험 문제. 아직 못 맞힌 문제가 없는데 레인보우 이벤트로 그 과목 조각을 모으는 중이면,
 * 이미 맞힌 문제를 "레인보우 도전"으로 다시 냅니다 (틀려도 마스터 기록은 그대로, 레인보우 연속 수만 0).
 */
function explorePool(state: GameState, bank: ActiveBank, subject: Subject, today: string) {
  const fresh = newExplorePool(state, bank, subject, today);
  return fresh.length || !rainbowOpenFor(state, today, subject) ? fresh : rainbowReplayPool(state, bank, subject, today);
}
function rainbowReplayPool(state: GameState, bank: ActiveBank, subject: Subject, today: string) {
  const lp = rainbowOf(state, today)!.lp;
  const prog = progress(state, bank.id);
  const solved = new Set(prog.solved);
  const missed = new Set(lp.missed?.date === today ? lp.missed.ids : []);
  const base = subjectQuestions(bank, subject).filter(q =>
    solved.has(q.id) && !missed.has(q.id) && !wrongToday(prog, q.id, today) && !inTodayDaily(state, q.id, today));
  const used = new Set(lp.used[subject] ?? []);
  const notYet = base.filter(q => !used.has(q.id));
  return notYet.length ? notYet : base;
}
/** 이 문제가 레인보우 "다시 풀기" 문제인지 (이미 맞힌 문제인데 그 과목 조각을 모으는 중). 다시 풀기는 진도(마스터 기록)를 바꾸지 않습니다 */
const isRainbowReplay = (state: GameState, prog: BankProgress, q: Question, today: string) =>
  prog.solved.includes(q.id) && rainbowOpenFor(state, today, q.subject);

// ---------- 기간 한정 이벤트 (레인보우) ----------
/** 오늘 열려 있고 아이가 "도전할래!"를 누른 레인보우 이벤트 */
function rainbowOf(state: GameState, today: string): { def: LimitedEventDef; lp: LimitedProgress } | null {
  for (const def of LIMITED_EVENTS) {
    if (def.kind !== 'rainbow' || limitedPhase(def, today) !== 'active') continue;
    const lp = state.limited?.[def.id];
    if (lp?.acceptedAt) return { def, lp };
  }
  return null;
}
/** 이 과목 조각을 아직 모으는 중인지 */
function rainbowOpenFor(state: GameState, today: string, subject: Subject) {
  const r = rainbowOf(state, today);
  return !!r && r.def.goal.subjects.includes(subject) && !r.lp.pieces.includes(subject);
}
function limitedProgress(state: GameState, id: string): LimitedProgress {
  const all = state.limited ??= {};
  return all[id] ??= { streak: {}, used: {}, pieces: [], pieceAt: {} };
}
export type RainbowResult = {
  kind: 'progress' | 'reset' | 'piece' | 'complete';
  subject: Subject; count: number; goal: number; pieces: number; total: number;
  /** 아이에게 보여 줄 말 (진행 중이면 빈 글) */
  message: string;
};
/** 탐험에서 한 문제를 풀 때마다: 맞히면 그 과목 연속 +1(목표에 닿으면 조각), 틀리면 0부터 */
function rainbowAnswer(state: GameState, today: string, q: Question, correct: boolean, replay: boolean): RainbowResult | null {
  const r = rainbowOf(state, today);
  if (!r) return null;
  const { def, lp } = r;
  const s = q.subject;
  if (!def.goal.subjects.includes(s) || lp.pieces.includes(s)) return null;
  const goal = def.goal.streak, total = def.goal.subjects.length;
  const before = lp.streak[s] ?? 0;
  if (!correct) {
    lp.streak[s] = 0;
    lp.used[s] = [];
    if (replay) {
      if (lp.missed?.date !== today) lp.missed = { date: today, ids: [] };
      lp.missed.ids.push(q.id);
    }
    return { kind: before > 0 ? 'reset' : 'progress', subject: s, count: 0, goal, pieces: lp.pieces.length, total,
      message: before > 0 ? `앗! ${eunNeun(s)} 처음부터 다시 해 보자. 할 수 있어!` : '' };
  }
  const count = before + 1;
  if (count < goal) {
    lp.streak[s] = count;
    lp.used[s] = [...(lp.used[s] ?? []), q.id];
    return { kind: 'progress', subject: s, count, goal, pieces: lp.pieces.length, total, message: '' };
  }
  lp.streak[s] = goal;
  lp.used[s] = [];
  lp.pieces.push(s);
  lp.pieceAt[s] = today;
  const left = total - lp.pieces.length;
  if (left === 0) lp.completedAt = today;
  const heart = PIECE_INFO[s].heart;
  return {
    kind: left === 0 ? 'complete' : 'piece', subject: s, count: goal, goal, pieces: lp.pieces.length, total,
    message: left === 0 ? '🌈 무지개 완성! 이로치로 바꿀 포켓몬을 골라 봐!'
      : left === 1 ? `${heart} ${s} 조각 얻었다! 와! 이제 딱 1개 남았어!`
      : `${heart} ${s} 조각 얻었다! 이제 ${left}개 남았어!`,
  };
}
/** 기간이 끝난 이벤트를 정산합니다 (조각이 minPieces 개 이상이면 파트너에게 사탕). 바뀌었으면 true */
export function syncLimited(state: GameState, today: string): boolean {
  let changed = false;
  for (const def of LIMITED_EVENTS) {
    const lp = state.limited?.[def.id];
    if (!lp?.acceptedAt || lp.ended || limitedPhase(def, today) !== 'ended') continue;
    const n = lp.pieces.length;
    const partner = state.owned.find(p => p.uid === state.partner);
    const candy = n >= def.reward.partial.minPieces && partner ? def.reward.partial.candy : 0;
    if (candy && partner) {
      const c = state.candy ??= { pending: [], sent: 0 };
      c.pending.push({ id: nextId(state, 'c'), date: today, species: partner.species, amount: candy });
      c.sent += candy;
    }
    lp.ended = { date: today, pieces: n, candy };
    changed = true;
  }
  return changed;
}
/** 아이 화면용: 열려 있는 이벤트와 (참여했던) 끝난 이벤트. 시작 전 이벤트는 아예 안 보임(깜짝) */
export function limitedView(state: GameState, today: string, minutes: number) {
  return LIMITED_EVENTS.flatMap(def => {
    const phase = limitedPhase(def, today);
    const lp = state.limited?.[def.id];
    if (phase === 'before' || (phase === 'ended' && !lp?.acceptedAt)) return [];
    const pieces = lp?.pieces ?? [];
    const completed = !!lp?.completedAt;
    const left = minutesLeft(def, today, minutes);
    const changedP = lp?.changed;
    return [{
      id: def.id, kind: def.kind, title: def.title, phase, start: def.start, end: def.end,
      accepted: !!lp?.acceptedAt, seen: !!lp?.seen || !!lp?.acceptedAt,
      goal: def.goal.streak, total: def.goal.subjects.length, pieceCount: pieces.length,
      subjects: def.goal.subjects.map(s => ({
        subject: s, color: SUBJECT_INFO[s].color, colorName: PIECE_INFO[s].color, heart: PIECE_INFO[s].heart,
        piece: pieces.includes(s), streak: pieces.includes(s) ? def.goal.streak : lp?.streak[s] ?? 0,
      })),
      completed, changed: changedP ? { uid: changedP.uid, species: changedP.species, name: shinyName(changedP.species) } : null,
      canChange: completed && !changedP,
      leftMinutes: phase === 'active' ? left : 0, leftLabel: phase === 'active' ? leftLabel(left) : '',
      /** 마지막 날 저녁 안내 ("오늘 밤 12시면 끝나!") */
      remind: phase === 'active' && !!lp?.acceptedAt && today === def.end && minutes >= hmToMinutes(def.reminderAt) && !completed,
      remindSeen: !!lp?.remindSeen,
      ended: lp?.ended ?? null, endSeen: !!lp?.endSeen,
      shinyMultiplier: def.shinyMultiplier, partial: def.reward.partial,
    }];
  });
}
export type LimitedView = ReturnType<typeof limitedView>[number];
/**
 * 보호자 "팝업 다시 보이게": 이 이벤트의 "팝업 봄"(그리고 진행이 없을 때만 "도전 시작")을 지워
 * 다음에 아이 화면을 열 때 소개 팝업 3장이 처음부터 다시 뜨게 합니다.
 * 조각·연속 수·완성·변신·정산 중 하나라도 있으면 아이가 한 것을 지우지 않도록 되돌리지 않습니다.
 */
export function resetLimitedIntro(state: GameState, id: string): { changed: boolean; message: string } {
  const def = limitedById(id);
  if (!def) return { changed: false, message: '이벤트를 찾지 못했어요.' };
  const lp = state.limited?.[id];
  if (!lp || (!lp.seen && !lp.acceptedAt)) return { changed: false, message: `아직 아무도 "${def.title}" 팝업을 보지 않았어요. 다음에 아이 화면을 열면 처음부터 떠요.` };
  const progress = lp.pieces.length > 0 || Object.values(lp.streak).some(n => (n ?? 0) > 0) || !!lp.completedAt || !!lp.changed || !!lp.ended;
  if (progress) {
    const streaks = def.goal.subjects.filter(s => (lp.streak[s] ?? 0) > 0).map(s => `${s} ${lp.streak[s]}`).join(', ');
    return { changed: false, message: `이미 진행한 기록이 있어서 되돌리지 않았어요 (조각 ${lp.pieces.length}개${streaks ? ` · 연속 ${streaks}` : ''}${lp.changed ? ' · 이로치 변신 완료' : ''}). 아이가 한 것을 지우지 않으려고 그대로 두었어요.` };
  }
  delete state.limited![id];
  return { changed: true, message: `"${def.title}" 팝업 기록을 지웠어요${lp.acceptedAt ? ' (도전 시작 전 상태로 되돌림)' : ''}. 아이 폰에서 앱을 다음에 열면 팝업 3장이 처음부터 떠요. 열려 있는 화면이면 1분 안에 다시 떠요.` };
}
/** 보호자 화면용 요약: 예약된(시작 전) 이벤트도 모두 보여 줌 (아이 화면에는 시작 전엔 안 보임) */
export function limitedReport(state: GameState, today: string) {
  return LIMITED_EVENTS.map(def => {
    const lp = state.limited?.[def.id];
    return {
      id: def.id, title: def.title, start: def.start, end: def.end, phase: limitedPhase(def, today),
      seen: lp?.seen ?? null, acceptedAt: lp?.acceptedAt ?? null, goal: def.goal.streak,
      pieces: lp?.pieces ?? [], streak: Object.fromEntries(def.goal.subjects.map(s => [s, (lp?.pieces ?? []).includes(s) ? def.goal.streak : lp?.streak[s] ?? 0])) as Record<Subject, number>,
      completedAt: lp?.completedAt ?? null, changed: lp?.changed ? { species: lp.changed.species, name: shinyName(lp.changed.species), at: lp.changed.at } : null,
      ended: lp?.ended ?? null, shinyMultiplier: def.shinyMultiplier, partial: def.reward.partial,
    };
  });
}
/** 시뮬레이션 도우미(시험용 기록에만): reset = 이 이벤트 기록 지우기, streak9 = 못 모은 과목 연속 9로, pieces5 = 조각 5개로 */
export function simLimited(state: GameState, id: string, op: 'reset' | 'streak9' | 'pieces5', today: string): boolean {
  const def = limitedById(id);
  if (!def) return false;
  if (op === 'reset') { if (state.limited) delete state.limited[id]; return true; }
  const lp = limitedProgress(state, id);
  lp.acceptedAt ??= today; lp.seen ??= today;
  if (op === 'streak9') {
    for (const s of def.goal.subjects) if (!lp.pieces.includes(s)) lp.streak[s] = def.goal.streak - 1;
  } else {
    for (const s of def.goal.subjects) {
      if (lp.pieces.length >= def.goal.subjects.length - 1) break;
      if (!lp.pieces.includes(s)) { lp.pieces.push(s); lp.pieceAt[s] = today; lp.streak[s] = def.goal.streak; }
    }
  }
  return true;
}

export function nextExploreQuestion(state: GameState, bank: ActiveBank | null, subject: Subject, today: string, random: Random, skip?: number) {
  if (!bank) return null;
  const left = explorePool(state, bank, subject, today);
  const choices = left.length > 1 ? left.filter(q => q.id !== skip) : left;
  return choices.length ? publicQuestion(pick(choices, random)) : null;
}

// ---------- 행동 ----------
export type Action =
  | { type: 'quizTime'; seconds: number }
  | { type: 'starter'; species: number }
  | { type: 'partner'; uid: string }
  | { type: 'answer'; mode: 'daily' | 'explore'; questionId: number; choice: number }
  | { type: 'dailyBox'; pick: number }
  | { type: 'exploreReward'; subject: Subject; pick: number }
  | { type: 'masterReward'; pick: number }
  | { type: 'openBall'; ballId: string }
  | { type: 'usePotion'; potionId: string; uid: string }
  | { type: 'evolve'; uid: string; target: number }
  | { type: 'exchangeExp'; statType: TypeKey }
  | { type: 'expGift'; pick: number }
  | { type: 'openGift'; id: string; choice: GiftChoice; subject?: Subject }
  | { type: 'replyGift'; id: string; sticker: ReplySticker; text?: string }
  | { type: 'acceptEvent'; event: EventId }
  | { type: 'eventSeen'; event: EventId }
  | { type: 'eventBox'; pick: number }
  | { type: 'limitedSeen'; id: string }
  | { type: 'limitedAccept'; id: string }
  | { type: 'limitedShinyChange'; id: string; uid: string }
  | { type: 'limitedNotice'; id: string; notice: 'remind' | 'end' };

/** shinyChance: 볼을 열 때 이로치가 나올 확률(%)을 덮어씀 (보호자 개발자 메뉴·시뮬레이션). 없으면 기본값 */
export type Context = { bank: ActiveBank | null; today: string; now: string; random: Random; shinyChance?: Partial<Record<ShinyBallKind, number>> };

function needPick(value: unknown) {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 2) fail('3개 중 하나를 골라 주세요.');
  return value as number;
}
function needBank(bank: ActiveBank | null) {
  if (!bank) fail('아직 이번 주 문제은행이 없어요. 보호자에게 알려 주세요.');
  return bank;
}

export function applyAction(state: GameState, action: Action, ctx: Context) {
  const { random } = ctx;
  const needStarter = () => { if (!state.partner) fail('먼저 첫 파트너를 골라 주세요.'); };

  switch (action.type) {
    case 'starter': {
      if (state.partner || state.owned.length) fail('첫 파트너는 이미 골랐어요.');
      if (!STARTERS.includes(action.species)) fail('파트너를 다시 골라 주세요.');
      const added = addPokemon(state, action.species, ctx.now);
      state.partner = added.uid!;
      return { message: `${species(action.species).name}와 친구가 되었어요!` };
    }

    case 'partner': {
      const p = state.owned.find(p => p.uid === action.uid);
      if (!p) fail('아직 만나지 못한 포켓몬이에요.');
      state.partner = p.uid;
      return { message: `이제 ${species(p.species).name}와 함께 모험해요!` };
    }

    case 'answer': {
      needStarter();
      const bank = needBank(ctx.bank);
      const q = bank.questions.find(q => q.id === action.questionId);
      if (!q) fail('문제를 다시 불러와 주세요.');
      if (!Number.isInteger(action.choice) || action.choice < 0 || action.choice >= q.choices.length) fail('답을 하나 골라 주세요.');
      const prog = progress(state, bank.id);
      // 레인보우 "다시 풀기" 문제: 이미 맞힌 문제를 이벤트 조각용으로 다시 푸는 것. 진도(맞힌 문제·틀린 횟수·영역)는 바꾸지 않음
      const replay = action.mode === 'explore' && isRainbowReplay(state, prog, q, ctx.today);
      if (action.mode === 'daily') {
        ensureDaily(state, bank, ctx.today, random);
        const d = state.daily!;
        if (!d.questionIds.includes(q.id)) fail('오늘의 미션 문제가 아니에요. 새로고침해 주세요.');
        if (d.correct.includes(q.id) || d.wrong.includes(q.id)) fail('이 문제는 오늘 이미 풀었어요.');
        if (d.box) fail('오늘의 미션은 끝났어요.');
      } else if (action.mode === 'explore') {
        if (prog.solved.includes(q.id) && !replay) fail('이미 맞힌 문제예요.');
        if (wrongToday(prog, q.id, ctx.today)) fail('이 문제는 다른 날 다시 도전해 보자!');
        if (replay && (() => { const lp = rainbowOf(state, ctx.today)!.lp; return lp.missed?.date === ctx.today && lp.missed.ids.includes(q.id); })()) fail('이 문제는 다른 날 다시 도전해 보자!');
        if (inTodayDaily(state, q.id, ctx.today)) fail('이 문제는 오늘의 미션에서 풀어 줘.');
      } else fail('지원하지 않는 요청이에요.');

      // 틀리면: '안 푼 문제'로 돌려놓고, 다른 날 일일미션·탐험에 다시 나오게 합니다.
      // 일일미션은 기회가 남아 있으면 다시 풀 수 있고, 탐험은 기회가 한 번입니다.
      if (action.choice !== q.answer) {
        if (replay) {
          quizDay(state, ctx.today).answered += 1;
          return {
            correct: false, final: true, answer: q.answer, explanation: q.explanation,
            message: `아쉬워! 정답은 ${q.answer + 1}번이야.`,
            rainbow: rainbowAnswer(state, ctx.today, q, false, true),
          };
        }
        prog.wrong[q.id] = (prog.wrong[q.id] ?? 0) + 1;
        prog.review[q.id] = ctx.today;
        prog.solved = prog.solved.filter(id => id !== q.id);
        if (action.mode === 'daily') {
          const d = state.daily!;
          d.tries[q.id] = (d.tries[q.id] ?? 0) + 1;
          if (d.tries[q.id] === 1) { noteArea(prog, q, false); quizDay(state, ctx.today).answered += 1; } // 첫 시도에 틀리면 그 영역의 오답으로 기록
          const left = DAILY_ATTEMPTS - d.tries[q.id];
          if (left > 0) return { correct: false, final: false, triesLeft: left, message: `괜찮아! 다시 생각해 보자. 기회가 ${left}번 남았어.` };
          d.wrong.push(q.id);
        } else { noteArea(prog, q, false); quizDay(state, ctx.today).answered += 1; }
        return {
          correct: false, final: true, answer: q.answer, explanation: q.explanation,
          message: `아쉬워! 정답은 ${q.answer + 1}번이야. 이 문제는 다른 날 다시 나올 거야.`,
          candy: action.mode === 'daily' ? settleDailyCandy(state, ctx.today) : null,
          rainbow: action.mode === 'explore' ? rainbowAnswer(state, ctx.today, q, false, false) : null,
        };
      }
      if (replay) {
        const day = quizDay(state, ctx.today); day.answered += 1; day.correct += 1;
        return { correct: true, explanation: q.explanation, reviewed: false, message: '정답이야!', rainbow: rainbowAnswer(state, ctx.today, q, true, true) };
      }

      // 전날 이전에 틀린 문제를 맞히면 다시 풀기 완료. 오늘 틀렸다가 다시 맞힌 문제는 다른 날 한 번 더 나옵니다.
      const reviewed = isDue(prog, q.id, ctx.today);
      if (reviewed) delete prog.review[q.id];
      const newlySolved = !prog.solved.includes(q.id);
      if (newlySolved) prog.solved.push(q.id);
      // 첫 시도에 맞혔을 때만 그 영역의 정답으로 기록 (다시 풀어서 맞힌 것은 이미 오답으로 기록됨)
      if (action.mode !== 'daily' || !state.daily!.tries[q.id]) { noteArea(prog, q, true); const day = quizDay(state, ctx.today); day.answered += 1; day.correct += 1; }
      // 일일미션은 이미 맞힌 적 있는 문제가 나와도 보상을 줍니다 (하루 한 번만 풀 수 있으므로).
      const rewarded = action.mode === 'daily' || newlySolved;
      if (action.mode === 'daily') state.daily!.correct.push(q.id);
      const statGain = statReward(q.subject, action.mode);
      if (rewarded) {
        state.stats[q.type] += statGain;
        state.exp += REWARD_PER_ANSWER.exp;
      }
      return {
        correct: true, explanation: q.explanation, reviewed,
        gained: rewarded ? { type: q.type, amount: statGain, exp: REWARD_PER_ANSWER.exp } : undefined,
        message: reviewed ? '지난번에 틀린 문제, 이번엔 맞혔어!' : '정답이야!',
        /** 이 답으로 오늘의 미션이 끝나 사탕을 보냈으면 그 내용 */
        candy: action.mode === 'daily' ? settleDailyCandy(state, ctx.today) : null,
        /** 레인보우 이벤트 진행 (탐험에서만) */
        rainbow: action.mode === 'explore' ? rainbowAnswer(state, ctx.today, q, true, false) : null,
      };
    }

    case 'quizTime': {
      // 아이 화면이 1분마다 보내는 "그동안 화면을 본 초" (보호자 화면의 하루 퀴즈 시간)
      const seconds = Number(action.seconds);
      if (Number.isFinite(seconds) && seconds > 0) quizDay(state, ctx.today).seconds += Math.min(Math.round(seconds), QUIZ_REPORT_MAX_SECONDS);
      return { ok: true };
    }

    case 'dailyBox': {
      needStarter();
      const choice = needPick(action.pick);
      ensureDaily(state, ctx.bank, ctx.today, random);
      const d = state.daily!;
      const allowed = dailyBoxPicks(state);
      if (!allowed) fail(dailyFinished(state) ? '아쉽게도 오늘은 상자를 받을 만큼 맞히지 못했어요.' : '오늘의 미션을 먼저 끝내 주세요.');
      d.box ??= {
        items: [0, 1, 2].map(() => {
          const row = weighted<(typeof DAILY_BOX_TABLE)[number]>(DAILY_BOX_TABLE, random);
          return row.item.kind === 'potion' ? rollPotion(row.item.potion) : ({ kind: 'ball', ball: row.item.ball } as BoxItem);
        }),
        picks: [],
      };
      if (d.box.picks.length >= allowed) fail('오늘의 상자는 이미 열었어요. 내일 또 만나요!');
      if (d.box.picks.includes(choice)) fail('이미 연 상자예요. 다른 상자를 골라 줘.');
      const ballId = grant(state, d.box.items[choice]);
      d.box.picks.push(choice);
      d.claimed = d.box.picks.length >= allowed;
      const left = allowed - d.box.picks.length;
      return {
        ...maskedBox(d)!, done: d.claimed, ballIds: ballId ? [ballId] : [],
        message: left ? `상자를 열었어! 하나 더 고를 수 있어.` : '상자를 열었어!',
      };
    }

    case 'exploreReward': {
      needStarter();
      const bank = needBank(ctx.bank);
      const choice = needPick(action.pick);
      if (!SUBJECTS.includes(action.subject)) fail('과목을 다시 골라 주세요.');
      const prog = progress(state, bank.id);
      if (!subjectMastered(state, bank, action.subject)) fail(`${action.subject} 문제를 모두 맞혀야 해요.`);
      if (prog.subjectRewards.includes(action.subject)) fail('이 과목의 선물은 이미 받았어요.');
      const own = SUBJECT_BERRY[action.subject];
      const others = (Object.keys(POTIONS) as PotionKind[]).filter(k => k !== own && k !== 'potion');
      const table = [
        { kind: own, weight: EXPLORE_ITEM_WEIGHTS.subjectBerry },
        ...others.map(kind => ({ kind, weight: EXPLORE_ITEM_WEIGHTS.otherBerry / others.length })),
        { kind: 'potion' as PotionKind, weight: EXPLORE_ITEM_WEIGHTS.potion },
      ];
      const items = [0, 1, 2].map(() => rollPotion(weighted<(typeof table)[number]>(table, random).kind));
      grant(state, items[choice]);
      prog.subjectRewards.push(action.subject);
      return { items, picks: [choice], done: true, ballIds: [], message: `${action.subject} 탐험 완료!` };
    }

    case 'masterReward': {
      needStarter();
      const bank = needBank(ctx.bank);
      const choice = needPick(action.pick);
      const prog = progress(state, bank.id);
      if (!allMastered(state, bank)) fail('모든 과목의 탐험을 마쳐야 해요.');
      if (prog.masterClaimed) fail('마스터 보상은 이미 받았어요.');
      const items: BoxItem[] = [0, 1, 2].map(() => ({ kind: 'ball', ball: 'luxury' }));
      const ballId = grant(state, items[choice]);
      prog.masterClaimed = true;
      return { items, picks: [choice], done: true, ballIds: [ballId!], message: '탐험 마스터! 특별한 볼을 얻었어!' };
    }

    case 'openBall': {
      const index = state.balls.findIndex(b => b.id === action.ballId);
      if (index < 0) fail('볼을 찾을 수 없어요.');
      const [ball] = state.balls.splice(index, 1);
      let tier: number, id: number, shiny = false;
      if (ball.kind === 'shiny') {
        // 이로치 볼: 가진 포켓몬(1단계 기준) 중 하나의 이로치가 확정
        id = pickShinyBallSpecies(state, random);
        tier = Math.min(species(id).tier, 3);
        shiny = true;
      } else {
        if (ball.kind === 'rare') {
          id = pickRarePokemon(state, random);
          tier = 2;
        } else {
          const odds = BALLS[ball.kind].odds;
          tier = weighted<{ tier: number; weight: number }>(odds.map((weight, tier) => ({ tier, weight })), random).tier;
          id = pick(CATCH_POOLS[tier], random);
        }
        // 기간 한정 이벤트 중에는 이로치 확률 × 배수 (최대 100%)
        const chance = Math.min(100, (ctx.shinyChance?.[ball.kind] ?? SHINY_CHANCE_DEFAULT[ball.kind]) * limitedShinyMultiplier(ctx.today));
        shiny = random() * 100 < chance;
      }
      const result = addPokemon(state, id, ctx.now, shiny);
      const name = species(id).name;
      return {
        caught: id, tier, shiny, ...result,
        message: shiny
          ? (result.duplicate ? `✨ 이로치 ${shinyName(id)}를 또 만났어! 우정 보너스를 받았어.` : `✨ 이로치다! ${shinyName(id)}를 잡았어!`)
          : (result.duplicate ? `${name}를 또 만났어! 우정 보너스를 받았어.` : `${name}를 잡았어!`),
      };
    }

    case 'usePotion': {
      const index = (state.potions ?? []).findIndex(p => p.id === action.potionId);
      if (index < 0) fail('아이템을 찾을 수 없어요.');
      const p = state.owned.find(p => p.uid === action.uid);
      if (!p) fail('포켓몬을 골라 주세요.');
      const [item] = state.potions.splice(index, 1);
      const { amount, label } = POTIONS[item.kind];
      const types = potionTargets(item.kind);
      for (const t of types) state.stats[t] += amount;
      return {
        types, amount,
        message: `${species(p.species).name}에게 ${eulReul(label)} 먹였어! ${types.length === TYPE_KEYS.length ? '모든 속성' : types.map(t => TYPE_INFO[t].label).join('·')} +${amount}`,
      };
    }

    case 'evolve': {
      const p = state.owned.find(p => p.uid === action.uid);
      if (!p) fail('포켓몬을 찾을 수 없어요.');
      if (!evolutionsOf(p.species).includes(action.target)) fail('이 모습으로는 진화할 수 없어요.');
      const req = evolutionRequirement(action.target);
      const missing = req.filter(r => state.stats[r.type] < r.amount);
      if (missing.length) fail('스탯이 부족해요: ' + missing.map(r => `${typeLabel(r.type)} ${r.amount - state.stats[r.type]}`).join(', '));
      for (const r of req) state.stats[r.type] -= r.amount;
      const before = species(p.species).name;
      p.species = action.target;
      // 이로치는 진화해도 이로치: 진화한 모습도 이로치 도감에 (기본 도감에는 넣지 않음)
      if (p.shiny) { state.shiny ??= []; if (!state.shiny.includes(action.target)) state.shiny.push(action.target); }
      else if (!state.dex.includes(action.target)) state.dex.push(action.target);
      return { evolved: action.target, shiny: !!p.shiny, message: p.shiny ? `축하해! 이로치 ${shinyName(action.target)}로 진화했어!` : `축하해! ${before}가 ${species(action.target).name}로 진화했어!` };
    }

    case 'exchangeExp': {
      needStarter();
      if (!TYPE_KEYS.includes(action.statType)) fail('속성을 골라 주세요.');
      const { cost, amount } = EXP_EXCHANGE;
      const left = expAvailable(state);
      if (left < cost) fail(`경험치가 ${cost - left} 더 필요해요.`);
      state.expSpent = (state.expSpent ?? 0) + cost;
      state.stats[action.statType] += amount;
      return { type: action.statType, amount, message: `경험치 ${cost}로 ${typeLabel(action.statType)} 스탯 +${amount}!` };
    }

    case 'expGift': {
      needStarter();
      const choice = needPick(action.pick);
      if (expGiftsReady(state) < 1) fail(`경험치를 ${expGiftProgress(state).left} 더 모으면 선물을 받을 수 있어요.`);
      const items: BoxItem[] = [0, 1, 2].map(() => ({ kind: 'ball', ball: EXP_GIFT.ball }));
      const ballId = grant(state, items[choice]);
      state.expGifts = (state.expGifts ?? 0) + 1;
      return { items, picks: [choice], done: true, ballIds: [ballId!], message: `경험치 선물! ${BALLS[EXP_GIFT.ball].label}을 얻었어!` };
    }

    case 'openGift': {
      needStarter();
      const gift = (state.gifts ?? []).find(g => g.id === action.id);
      if (!gift) fail('선물을 찾을 수 없어요.');
      if (gift.opened) fail('이미 연 선물이에요.');
      const options = GIFT_SIZES[gift.size].options as readonly GiftChoice[];
      if (!options.includes(action.choice)) fail('선물 중 하나를 골라 줘.');
      const opened: NonNullable<Gift['opened']> = { at: ctx.now, choice: action.choice, got: GIFT_CHOICE_INFO[action.choice].label };
      let item: BoxItem | null = null;
      switch (action.choice) {
        case 'exp': state.exp += GIFT_EXP; break;
        case 'berry': {
          if (!action.subject || !SUBJECTS.includes(action.subject)) fail('어떤 열매를 받을지 계열을 골라 줘.');
          item = rollPotion(SUBJECT_BERRY[action.subject]);
          grant(state, item);
          opened.got = POTIONS[SUBJECT_BERRY[action.subject]].label;
          break;
        }
        case 'box': {
          const row = weighted<(typeof DAILY_BOX_TABLE)[number]>(DAILY_BOX_TABLE, random);
          item = row.item.kind === 'potion' ? rollPotion(row.item.potion) : ({ kind: 'ball', ball: row.item.ball } as BoxItem);
          const ballId = grant(state, item);
          opened.got = `랜덤상자 → ${boxItemLabel(item)}`;
          if (ballId) opened.ballId = ballId;
          break;
        }
        case 'candy': {
          const partner = state.owned.find(p => p.uid === state.partner)!;
          const candy = state.candy ??= { pending: [], sent: 0 };
          candy.pending.push({ id: nextId(state, 'c'), date: ctx.today, species: partner.species, amount: GIFT_CANDY });
          candy.sent += GIFT_CANDY;
          opened.got = `${species(partner.species).name}에게 포켓로그 사탕 ${GIFT_CANDY}개`;
          break;
        }
        case 'ball': {
          item = { kind: 'ball', ball: GIFT_BALL };
          opened.ballId = grant(state, item)!;
          opened.got = BALLS[GIFT_BALL].label;
          break;
        }
        case 'ticket': state.battleTickets = (state.battleTickets ?? 0) + 1; break;
        case 'shinyBall': {
          item = { kind: 'ball', ball: 'shiny' };
          opened.ballId = grant(state, item)!;
          opened.got = BALLS.shiny.label;
          break;
        }
      }
      gift.opened = opened;
      return { gift: publicGift(gift), item, ballIds: opened.ballId ? [opened.ballId] : [], message: `${GIFT_SENDERS[gift.from]}의 선물: ${opened.got}!` };
    }

    case 'replyGift': {
      const gift = (state.gifts ?? []).find(g => g.id === action.id);
      if (!gift) fail('선물을 찾을 수 없어요.');
      if (!gift.opened) fail('선물을 먼저 열어 줘.');
      if (gift.reply) fail('답장은 한 번만 보낼 수 있어. 이미 보냈어!');
      if (!REPLY_STICKERS.some(s => s.key === action.sticker)) fail('스티커를 하나 골라 줘.');
      const text = String(action.text ?? '').trim().slice(0, REPLY_TEXT_MAX);
      gift.reply = { sticker: action.sticker, text, at: ctx.now, seen: false };
      return { gift: publicGift(gift), message: `${GIFT_SENDERS[gift.from]}에게 답장을 보냈어!` };
    }

    case 'acceptEvent': {
      needStarter();
      const ev = state.events ??= {};
      if (action.event === 'allClear') {
        if (ev.allClear) fail('이미 도전 중이거나 끝낸 이벤트예요.');
        const bank = needBank(ctx.bank);
        ev.allClear = { acceptedAt: ctx.today, bankId: bank.id, mastered: [] };
      } else if (action.event === 'streak') {
        if (ev.streak) fail('이미 도전 중이거나 끝낸 이벤트예요.');
        ev.streak = { acceptedAt: ctx.today, count: 0, best: 0 };
      } else fail('이벤트를 다시 골라 주세요.');
      syncEvents(state, ctx.bank, ctx.today);
      return { message: `${EVENT_INFO[action.event].title} 도전 시작!` };
    }

    case 'eventSeen': {
      const e = action.event === 'allClear' ? state.events?.allClear : undefined;
      if (e?.completedAt) e.celebrated = true;
      return { ok: true };
    }

    case 'eventBox': {
      const choice = needPick(action.pick);
      const st = state.events?.streak;
      if (!st?.completedAt) fail(`일일미션 ${STREAK_DAYS}일 연속을 먼저 해내야 해요.`);
      st.box ??= { items: streakBoxItems(random), pick: null };
      if (st.box.pick !== null) fail('랜덤박스는 이미 열었어요.');
      const ballId = grant(state, st.box.items[choice]);
      st.box.pick = choice;
      const item = st.box.items[choice];
      return {
        items: st.box.items, picks: [choice], done: true, ballIds: ballId ? [ballId] : [],
        message: item.kind === 'ticket' ? '배틀 추가권을 얻었어!' : item.kind === 'ball' && item.ball === 'shiny' ? '이로치 볼을 얻었어!' : '희귀 포켓몬 볼을 얻었어!',
      };
    }

    // ---- 기간 한정 이벤트 (레인보우) ----
    case 'limitedSeen': {
      // 팝업에서 "나중에": 다시 팝업은 안 띄우고, 이벤트 탭에서 시작할 수 있음
      const def = limitedById(String(action.id));
      if (!def || limitedPhase(def, ctx.today) !== 'active') fail('지금은 열려 있는 이벤트가 아니에요.');
      limitedProgress(state, def.id).seen ??= ctx.today;
      return { ok: true };
    }
    case 'limitedAccept': {
      needStarter();
      const def = limitedById(String(action.id));
      if (!def || limitedPhase(def, ctx.today) !== 'active') fail('지금은 열려 있는 이벤트가 아니에요.');
      const lp = limitedProgress(state, def.id);
      if (lp.acceptedAt) fail('이미 도전 중이야!');
      lp.acceptedAt = ctx.today;
      lp.seen ??= ctx.today;
      return { message: `🌈 ${def.title} 시작! 탐험에서 ${def.goal.streak}문제 쭉 맞혀 봐!` };
    }
    case 'limitedShinyChange': {
      const def = limitedById(String(action.id));
      const lp = def ? state.limited?.[def.id] : undefined;
      if (!def || !lp?.completedAt) fail('무지개 조각을 모두 모아야 해요.');
      if (lp.changed) fail('이미 이로치로 바꿨어요.');
      const p = state.owned.find(p => p.uid === action.uid);
      if (!p) fail('포켓몬을 골라 줘.');
      if (p.shiny) fail('이미 이로치야. 다른 포켓몬을 골라 줘.');
      p.shiny = true;
      state.shiny ??= [];
      if (!state.shiny.includes(p.species)) state.shiny.push(p.species);
      lp.changed = { uid: p.uid, species: p.species, at: ctx.now };
      return { uid: p.uid, species: p.species, message: `✨ ${iGa(species(p.species).name)} 반짝반짝 변신했어! 이로치 도감에 들어갔어!` };
    }
    case 'limitedNotice': {
      const lp = state.limited?.[String(action.id)];
      if (lp && action.notice === 'remind') lp.remindSeen = true;
      if (lp && action.notice === 'end') lp.endSeen = true;
      return { ok: true };
    }

    default:
      fail('지원하지 않는 요청이에요.');
  }
}

/** 시뮬레이션 도우미(시험용 기록에만): 볼 종류마다 1개씩 가방에 넣습니다 (이로치 볼 포함) */
export function simGiveBalls(state: GameState): number {
  const kinds = Object.keys(BALLS) as BallKind[];
  for (const kind of kinds) state.balls.push({ id: nextId(state, 'b'), kind });
  return kinds.length;
}
/** 시뮬레이션 도우미(시험용 기록에만): 가진 포켓몬마다 이로치도 한 마리씩 (이미 있으면 건너뜀). 새로 넣은 수를 돌려줍니다. */
export function simGiveShinies(state: GameState, now: string): number {
  let added = 0;
  for (const p of [...state.owned]) {
    if (state.owned.some(o => o.shiny && o.species === p.species)) continue;
    addPokemon(state, p.species, now, true);
    added++;
  }
  return added;
}

/** 상자 내용물 이름 (예: 사과열매, 몬스터볼, 배틀 추가권) */
export const boxItemLabel = (item: BoxItem) =>
  item.kind === 'potion' ? POTIONS[item.potion].label : item.kind === 'ball' ? BALLS[item.ball].label : '배틀 추가권';

// ---------- 도전 이벤트 ----------
/** 희귀 포켓몬 볼: 후보(lib/rare-pokemon.ts) 중 아이가 아직 없는 계열을 먼저 */
function pickRarePokemon(state: GameState, random: Random): number {
  const pool = RARE_POKEMON.map(([id]) => id).filter(isSpecies);
  const ownedLines = new Set(state.owned.map(p => rootOf(p.species)));
  const fresh = pool.filter(id => !ownedLines.has(rootOf(id)));
  return pick(fresh.length ? fresh : pool, random);
}
/** 연속 이벤트 랜덤박스 3칸: 희귀 포켓몬 볼 또는 배틀 추가권, 세 칸이 모두 같지는 않게 */
function streakBoxItems(random: Random): BoxItem[] {
  // 희귀 포켓몬 볼 45% · 배틀 추가권 40% · 이로치 볼 15%
  const one = (): BoxItem => {
    const r = random();
    return r < 0.45 ? { kind: 'ball', ball: 'rare' } : r < 0.85 ? { kind: 'ticket' } : { kind: 'ball', ball: 'shiny' };
  };
  const same = (a: BoxItem, b: BoxItem) => a.kind === b.kind && (a.kind !== 'ball' || (b.kind === 'ball' && a.ball === b.ball));
  const items = [one(), one(), one()];
  if (items.every(i => same(i, items[0]))) items[Math.floor(random() * 3)] = same(items[0], { kind: 'ticket' }) ? { kind: 'ball', ball: 'rare' } : { kind: 'ticket' };
  return items;
}
/** 연속 기록이 오늘 기준으로 살아 있는지 (어제나 오늘 다 풀었으면 이어짐) */
const streakAlive = (st: StreakEvent, today: string) => !!st.lastDate && st.lastDate >= shiftDate(today, -1);
/**
 * 이벤트 진도를 오늘 상태에 맞춥니다 (아이 화면을 열 때·행동할 때마다). 바뀌었으면 true.
 * - 올클리어: 공개 중인 문제은행에서 마스터한 과목을 쌓음(수락 전에 마스터한 것도, 문제은행이 바뀌어도 남음). 6과목 다 되면 부활권 +1
 * - 연속: 오늘 일일미션을 다 풀었으면 어제에 이어 +1(끊겼으면 1부터). 하루라도 빠지면 0. STREAK_DAYS 가 되면 완료
 */
export function syncEvents(state: GameState, bank: ActiveBank | null, today: string): boolean {
  let changed = false;
  const ac = state.events?.allClear;
  if (ac && !ac.completedAt && bank) {
    for (const subject of SUBJECTS) {
      if (!ac.mastered.includes(subject) && subjectMastered(state, bank, subject)) { ac.mastered.push(subject); changed = true; }
    }
    if (SUBJECTS.every(s => ac.mastered.includes(s))) {
      ac.completedAt = today;
      state.reviveTickets = (state.reviveTickets ?? 0) + 1;
      changed = true;
    }
  }
  const st = state.events?.streak;
  if (st && !st.completedAt) {
    if (st.count > 0 && !streakAlive(st, today)) { st.count = 0; changed = true; }
    if (state.daily?.date === today && dailyFinished(state) && st.lastDate !== today && today >= st.acceptedAt) {
      st.count = st.lastDate === shiftDate(today, -1) && st.count > 0 ? st.count + 1 : 1;
      st.lastDate = today;
      st.best = Math.max(st.best, st.count);
      if (st.count >= STREAK_DAYS) st.completedAt = today;
      changed = true;
    }
  }
  return changed;
}
/** 아이 화면용 이벤트 정보 */
export function eventsView(state: GameState, bank: ActiveBank | null, today: string) {
  const ac = state.events?.allClear;
  const st = state.events?.streak;
  const subjectsWithQuestions = bank ? SUBJECTS.filter(s => bank.questions.some(q => q.subject === s)) : [...SUBJECTS];
  const allClear = {
    ...EVENT_INFO.allClear,
    accepted: !!ac, acceptedAt: ac?.acceptedAt ?? null,
    /** 수락 전이면 지금 문제은행에서 이미 마스터한 과목(수락하면 인정됨) */
    mastered: ac ? ac.mastered : bank ? SUBJECTS.filter(s => subjectMastered(state, bank, s)) : [],
    subjects: SUBJECTS, subjectsWithQuestions,
    completedAt: ac?.completedAt ?? null, celebrated: !!ac?.celebrated,
    /** 다시 나오지 않음: 완료하고 축하 창까지 봤으면 숨김 */
    hidden: !!ac?.completedAt && !!ac.celebrated,
  };
  const alive = st ? streakAlive(st, today) : false;
  const count = st ? (alive ? st.count : 0) : 0;
  const doneToday = !!st && st.lastDate === today;
  const streak = {
    ...EVENT_INFO.streak, days: STREAK_DAYS,
    accepted: !!st, acceptedAt: st?.acceptedAt ?? null, count, best: st?.best ?? 0, doneToday,
    /** 오늘 미션을 하면 몇 일째가 되는지 */
    nextCount: doneToday ? count : count + 1,
    completedAt: st?.completedAt ?? null,
    box: st?.box ? { items: st.box.pick === null ? st.box.items.map(() => null) : st.box.items, pick: st.box.pick } : null,
    hidden: !!st?.completedAt && st.box?.pick != null,
  };
  return { allClear, streak, reviveTickets: state.reviveTickets ?? 0 };
}
/** 보호자 화면용 요약 */
export const eventsReport = (state: GameState, bank: ActiveBank | null, today: string) => {
  const v = eventsView(state, bank, today);
  return {
    allClear: { accepted: v.allClear.accepted, acceptedAt: v.allClear.acceptedAt, mastered: state.events?.allClear?.mastered ?? [], completedAt: v.allClear.completedAt },
    streak: { accepted: v.streak.accepted, acceptedAt: v.streak.acceptedAt, count: v.streak.count, best: v.streak.best, completedAt: v.streak.completedAt, boxOpened: v.streak.box?.pick != null },
    reviveTickets: v.reviveTickets,
  };
};
/** 부활권 1장 쓰기. 없으면 false */
export function spendReviveTicket(state: GameState): boolean {
  if ((state.reviveTickets ?? 0) < 1) return false;
  state.reviveTickets = (state.reviveTickets ?? 0) - 1;
  return true;
}
/** 시뮬레이션 전용: 연속 기록을 n일로 맞춤 (어제까지 다 푼 것으로) */
export function simSetStreak(state: GameState, today: string, days: number) {
  const st = state.events?.streak;
  if (!st || st.completedAt) return false;
  st.count = Math.max(0, Math.min(days, STREAK_DAYS - 1));
  st.lastDate = st.count ? shiftDate(today, -1) : undefined;
  st.best = Math.max(st.best, st.count);
  return true;
}

// ---------- 보호자 선물 ----------
/** 'YYYY-MM-DD'가 속한 주의 월요일 (큰 선물의 주 1개 한도용) */
export function weekStart(date: string): string {
  const day = new Date(date + 'T00:00:00Z').getUTCDay(); // 0 일
  return shiftDate(date, -((day + 6) % 7));
}
/** 오늘·이번 주에 이미 보낸 선물 수 (한도 확인용) */
export function giftCounts(state: GameState, today: string): GiftLimits {
  const gifts = state.gifts ?? [];
  const week = weekStart(today);
  return {
    small: gifts.filter(g => g.size === 'small' && g.date === today).length,
    medium: gifts.filter(g => g.size === 'medium' && g.date === today).length,
    large: gifts.filter(g => g.size === 'large' && g.date >= week && g.date <= today).length,
  };
}
export type GiftInput = { from: GiftSender; reason: string; size: GiftSize; letter?: string };
/** 보호자가 선물을 보냅니다. 한도를 넘으면 GameError. */
export function sendGift(state: GameState, input: GiftInput, today: string, now: string, limits: GiftLimits = GIFT_LIMIT_DEFAULT): Gift {
  if (!(input.from in GIFT_SENDERS)) fail('보내는 사람을 골라 주세요.');
  if (!(input.size in GIFT_SIZES)) fail('선물 크기를 골라 주세요.');
  const reason = String(input.reason ?? '').trim().slice(0, GIFT_REASON_MAX);
  if (!reason) fail('선물 이유를 적어 주세요.');
  const counts = giftCounts(state, today);
  const limit = limits[input.size];
  if (counts[input.size] >= limit) {
    fail(input.size === 'large' ? `큰 선물은 일주일에 ${limit}개까지예요. 이번 주에는 이미 ${counts.large}개 보냈어요.` : `${GIFT_SIZES[input.size].label}은 하루에 ${limit}개까지예요. 오늘 이미 ${counts[input.size]}개 보냈어요.`);
  }
  const gift: Gift = { id: nextId(state, 'g'), date: today, sentAt: now, from: input.from, reason, size: input.size, letter: String(input.letter ?? '').trim().slice(0, GIFT_LETTER_MAX) };
  state.gifts = [...(state.gifts ?? []), gift].slice(-GIFT_HISTORY);
  return gift;
}
/** 화면에 보내는 선물 정보 (그대로 보내도 되는 내용만) */
export const publicGift = (g: Gift) => ({
  id: g.id, date: g.date, sentAt: g.sentAt, from: g.from, fromLabel: GIFT_SENDERS[g.from], reason: g.reason, size: g.size, letter: g.letter,
  opened: g.opened ? { at: g.opened.at, choice: g.opened.choice, got: g.opened.got, ballId: g.opened.ballId } : null,
  reply: g.reply ? { sticker: g.reply.sticker, text: g.reply.text, at: g.reply.at, seen: !!g.reply.seen } : null,
});
export type PublicGift = ReturnType<typeof publicGift>;
/** 최근 것부터 */
export const giftList = (state: GameState) => [...(state.gifts ?? [])].reverse().map(publicGift);
/** 보호자가 아직 확인하지 않은 답장 수 */
export const unseenReplies = (state: GameState) => (state.gifts ?? []).filter(g => g.reply && !g.reply.seen).length;
/** 답장을 모두 확인한 것으로 표시. 바뀐 수를 돌려줍니다. */
export function markRepliesSeen(state: GameState): number {
  let n = 0;
  for (const g of state.gifts ?? []) if (g.reply && !g.reply.seen) { g.reply.seen = true; n++; }
  return n;
}

/** 스탯으로 바꿀 수 있는 남은 경험치 */
export const expAvailable = (state: GameState) => state.exp - (state.expSpent ?? 0);

/** 아직 받지 않은 경험치 선물 수 */
export const expGiftsReady = (state: GameState) => Math.floor(state.exp / EXP_GIFT.every) - (state.expGifts ?? 0);
/** 다음 경험치 선물까지: 지금 모은 양, 남은 양 */
export function expGiftProgress(state: GameState) {
  const now = state.exp % EXP_GIFT.every;
  return { now, left: EXP_GIFT.every - now, every: EXP_GIFT.every };
}

// ---------- 포켓로그(/battle) 시도 횟수 ----------
/** 오늘 남은 새 게임 횟수 */
export function battleStartsLeft(state: GameState, today: string): number {
  const used = state.battle?.date === today ? state.battle.starts : 0;
  return Math.max(0, BATTLE_STARTS_PER_DAY - used);
}
/** 남아 있는 배틀 추가권 (보호자 큰 선물) */
export const battleTickets = (state: GameState) => Math.max(0, state.battleTickets ?? 0);
/** 오늘 시작할 수 있는 새 게임 수 = 하루 횟수 + 추가권 */
export const battleStartsAvailable = (state: GameState, today: string) => battleStartsLeft(state, today) + battleTickets(state);
/**
 * 새 게임을 시작합니다(횟수 1 차감). 하루 횟수를 다 썼으면 배틀 추가권 1장을 씁니다. 둘 다 없으면 false.
 * 이어하기는 이 함수를 거치지 않습니다.
 */
export function startBattle(state: GameState, today: string): boolean {
  const usedTicket = battleStartsLeft(state, today) < 1;
  if (usedTicket) {
    if (battleTickets(state) < 1) return false;
    state.battleTickets = battleTickets(state) - 1;
  } else {
    const starts = state.battle?.date === today ? state.battle.starts : 0;
    state.battle = { date: today, starts: starts + 1 };
  }
  battleDay(state, today).starts += 1;
  return true;
}

/** 오늘 기록 칸 (없으면 만들고, 오래된 날은 지움) */
function battleDay(state: GameState, today: string): BattleDay {
  state.battleLog ??= {};
  state.battleLog[today] ??= { maxWave: 0, seconds: 0, starts: 0 };
  for (const date of Object.keys(state.battleLog).sort().slice(0, -BATTLE_LOG_DAYS)) delete state.battleLog[date];
  return state.battleLog[today];
}

/**
 * 게임이 1분마다 보내는 진행 보고: 지금 웨이브와 그동안 플레이한 초.
 * 웨이브는 그날의 최고값만, 초는 한 번에 BATTLE_REPORT_MAX_SECONDS 까지만 인정합니다.
 */
export function recordBattleProgress(state: GameState, today: string, wave: number, seconds: number): BattleDay {
  const day = battleDay(state, today);
  if (Number.isInteger(wave) && wave > day.maxWave && wave <= 10000) day.maxWave = wave;
  if (Number.isFinite(seconds) && seconds > 0) day.seconds += Math.min(Math.round(seconds), BATTLE_REPORT_MAX_SECONDS);
  return day;
}

// ---------- 일일미션 → 포켓로그 사탕 (SPEC 11번) ----------
/**
 * 오늘의 미션을 다 풀었고 오늘 아직 안 줬으면 파트너에게 사탕을 줍니다. 새로 줬을 때만 그 묶음을 돌려줍니다.
 * (모두 맞히면 DAILY_CANDY.perfect, 아니면 finished)
 */
export function settleDailyCandy(state: GameState, today: string): CandyGift | null {
  const d = state.daily;
  if (!d || d.date !== today || !dailyFinished(state)) return null;
  const candy = state.candy ??= { pending: [], sent: 0 };
  if (candy.lastDate === today) return null;
  const partner = state.owned.find(p => p.uid === state.partner);
  if (!partner) return null;
  const perfect = d.questionIds.every(id => d.correct.includes(id));
  const gift: CandyGift = { id: nextId(state, 'c'), date: today, species: partner.species, amount: perfect ? DAILY_CANDY.perfect : DAILY_CANDY.finished };
  candy.pending.push(gift);
  candy.sent += gift.amount;
  candy.lastDate = today;
  candy.lastGift = gift;
  return gift;
}
/** 게임이 가져간 사탕 묶음을 목록에서 뺍니다. 실제로 뺀 개수를 돌려줍니다. */
export function claimCandy(state: GameState, ids: string[]): number {
  const candy = state.candy;
  if (!candy) return 0;
  const before = candy.pending.length;
  const set = new Set(ids);
  candy.pending = candy.pending.filter(g => !set.has(g.id));
  return before - candy.pending.length;
}
/** 아이·보호자 화면용 요약 */
export const candySummary = (state: GameState, today: string) => ({
  /** 오늘 보낸 사탕 (없으면 null) */
  today: state.candy?.lastDate === today ? state.candy.lastGift ?? null : null,
  /** 게임이 아직 가져가지 않은 사탕 수 */
  pending: (state.candy?.pending ?? []).reduce((sum, g) => sum + g.amount, 0),
  /** 지금까지 보낸 사탕 총량 */
  sent: state.candy?.sent ?? 0,
  rule: DAILY_CANDY,
});

// ---------- 퀴즈 시간 기록 · 활동 요약 ----------
/** 오늘 퀴즈 기록 칸 (없으면 만들고, 오래된 날은 지움) */
function quizDay(state: GameState, today: string): QuizDay {
  state.quizLog ??= {};
  state.quizLog[today] ??= { seconds: 0, answered: 0, correct: 0 };
  for (const date of Object.keys(state.quizLog).sort().slice(0, -ACTIVITY_LOG_DAYS)) delete state.quizLog[date];
  return state.quizLog[today];
}
export type ActivityDay = { date: string; quizSeconds: number; answered: number; correct: number; battleSeconds: number; battleWave: number; battleStarts: number };
/** 보호자 화면 그래프용: 오늘까지 days 일치 (없는 날은 0) */
export function activityList(state: GameState, today: string, days: number): ActivityDay[] {
  const out: ActivityDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = shiftDate(today, -i);
    const q = state.quizLog?.[date], b = state.battleLog?.[date];
    out.push({ date, quizSeconds: q?.seconds ?? 0, answered: q?.answered ?? 0, correct: q?.correct ?? 0, battleSeconds: b?.seconds ?? 0, battleWave: b?.maxWave ?? 0, battleStarts: b?.starts ?? 0 });
  }
  return out;
}
/** 오늘 포켓로그를 플레이한 초 */
export const battleSecondsToday = (state: GameState, today: string) => state.battleLog?.[today]?.seconds ?? 0;
/** 하루 제한(분, 0이면 없음)을 다 썼는지 */
export const battleTimeUp = (state: GameState, today: string, limitMinutes: number) =>
  limitMinutes > 0 && battleSecondsToday(state, today) >= limitMinutes * 60;

// ---------- 보호자 화면: 영역별 성적 ----------
export type AreaReport = {
  area: string; total: number; solved: number; correct: number; wrong: number;
  /** 최근 결과 (o/x, 오래된 것부터) */
  recent: string; weak: boolean;
  /** 2번 이상 틀린 문제 */
  repeated: { id: number; prompt: string; wrong: number; solved: boolean }[];
};
export function areaReport(state: GameState, bank: ActiveBank): { subject: Subject; areas: AreaReport[] }[] {
  seedAreaStats(state, bank); // 읽기만 하는 요청에서는 저장되지 않고, 아이 화면을 열 때 저장됨
  const prog = progress(state, bank.id);
  const solved = new Set(prog.solved);
  return SUBJECTS.map(subject => {
    const byArea = new Map<string, Question[]>();
    for (const q of bank.questions.filter(q => q.subject === subject)) {
      const list = byArea.get(areaOf(q)) ?? [];
      list.push(q); byArea.set(areaOf(q), list);
    }
    const areas = [...byArea.entries()].map(([area, qs]) => {
      const stat = prog.areas?.[`${subject}|${area}`];
      return {
        area, total: qs.length, solved: qs.filter(q => solved.has(q.id)).length,
        correct: stat?.correct ?? 0, wrong: stat?.wrong ?? 0, recent: stat?.recent ?? '', weak: isWeakArea(stat),
        repeated: qs.filter(q => (prog.wrong[q.id] ?? 0) >= 2).sort((a, b) => prog.wrong[b.id] - prog.wrong[a.id])
          .map(q => ({ id: q.id, prompt: q.prompt, wrong: prog.wrong[q.id], solved: solved.has(q.id) })),
      };
    });
    // 약점 → 틀린 수 많은 순
    areas.sort((a, b) => Number(b.weak) - Number(a.weak) || b.wrong - a.wrong || a.area.localeCompare(b.area, 'ko'));
    return { subject, areas };
  });
}

/** 게임이 보낸 파티 레벨로 계열별 최고 레벨을 갱신합니다. */
export function recordBattleLevels(state: GameState, party: { starter: number; level: number }[]): void {
  for (const p of party) {
    if (!Number.isInteger(p.starter) || p.starter <= 0 || !Number.isInteger(p.level) || p.level <= 0 || p.level > 200) continue;
    state.battleLevels ??= {};
    if ((state.battleLevels[p.starter] ?? 0) < p.level) state.battleLevels[p.starter] = p.level;
  }
}

/** 포켓로그 이벤트에서 받은 이로치를 도감에 남깁니다 (이미 있으면 그대로). 새로 늘어난 수를 돌려줍니다. */
export function recordShiny(state: GameState, ids: number[]): number {
  let added = 0;
  for (const id of ids) {
    if (!Number.isInteger(id) || !isSpecies(id)) continue;
    state.shiny ??= [];
    if (state.shiny.includes(id)) continue;
    state.shiny.push(id);
    added += 1;
  }
  return added;
}

/** 보호자 화면용: 최근 날짜부터 */
export const battleLogList = (state: GameState) =>
  Object.entries(state.battleLog ?? {}).sort(([a], [b]) => (a < b ? 1 : -1)).map(([date, day]) => ({ date, ...day }));

// ---------- 아이 화면에 보낼 정보 ----------
export function childView(state: GameState, bank: ActiveBank | null, today: string, minutes = 0) {
  const prog = bank ? progress(state, bank.id) : null;
  const byId = new Map(bank?.questions.map(q => [q.id, q]) ?? []);
  const daily = state.daily && bank && state.daily.date === today
    ? {
        date: state.daily.date,
        questions: state.daily.questionIds.map(id => byId.get(id)).filter((q): q is Question => !!q).map(publicQuestion),
        correct: state.daily.correct,
        wrong: state.daily.wrong ?? [],
        tries: state.daily.tries ?? {},
        attempts: DAILY_ATTEMPTS,
        claimed: state.daily.claimed,
        /** 모두 풀었는지 (틀린 문제 포함) */
        finished: dailyFinished(state),
        /** 고를 수 있는 랜덤상자 수 (0, 1, 2) */
        boxPicks: dailyBoxPicks(state),
        box: maskedBox(state.daily),
      }
    : null;
  const solved = new Set(prog?.solved ?? []);
  const explore = bank ? SUBJECTS.map(subject => {
    const qs = subjectQuestions(bank, subject);
    return {
      subject, total: qs.length,
      solved: qs.filter(q => solved.has(q.id)).length,
      /** 오늘 탐험에서 풀 수 있는 문제 수 (복습 포함) */
      available: explorePool(state, bank, subject, today).length,
      /** 전에 틀려서 오늘 다시 나온 문제 수 */
      review: qs.filter(q => isDue(prog!, q.id, today)).length,
      /** 오늘 틀려서 다른 날 다시 나올 문제 수 */
      reviewLater: qs.filter(q => wrongToday(prog!, q.id, today)).length,
      /** 오늘의 미션에 들어 있어 탐험에서 빠진 (아직 못 맞힌) 문제 수 */
      inDaily: qs.filter(q => !solved.has(q.id) && !wrongToday(prog!, q.id, today) && inTodayDaily(state, q.id, today)).length,
      rewardClaimed: prog!.subjectRewards.includes(subject),
      /** 레인보우 이벤트로 이미 맞힌 문제를 다시 푸는 중 (새 문제가 없을 때) */
      rainbowReplay: newExplorePool(state, bank, subject, today).length === 0 && rainbowOpenFor(state, today, subject),
    };
  }) : [];
  return {
    today,
    /** 쓸 수 있는 경험치 */
    exp: expAvailable(state),
    /** 지금까지 모은 경험치 */
    expTotal: state.exp,
    /** 받을 수 있는 경험치 선물 수, 다음 선물까지 진행 */
    expGifts: { ready: Math.max(0, expGiftsReady(state)), ...expGiftProgress(state) },
    stats: state.stats,
    partner: state.partner,
    owned: state.owned,
    dex: state.dex,
    balls: state.balls,
    potions: state.potions ?? [],
    bank: bank ? { id: bank.id, title: bank.title } : null,
    daily,
    explore,
    allMastered: bank ? allMastered(state, bank) : false,
    masterClaimed: prog?.masterClaimed ?? false,
    /** 포켓로그(/battle): 오늘 남은 새 게임 횟수, 배틀 추가권(보호자 큰 선물) */
    battle: { left: battleStartsLeft(state, today), perDay: BATTLE_STARTS_PER_DAY, tickets: battleTickets(state) },
    /** 보호자 선물 (최근 것부터) */
    gifts: giftList(state),
    /** 도전 이벤트와 부활권 */
    events: eventsView(state, bank, today),
    /** 일일미션으로 포켓로그에 보내는 사탕 */
    candy: candySummary(state, today),
    /** 포켓로그 최고 레벨 (진화 계열 첫 모습 번호 기준) */
    battleLevels: state.battleLevels ?? {},
    /** 포켓로그 이벤트에서 받은 이로치 (도감에 색깔별로 따로 표시) */
    shiny: state.shiny ?? [],
    megas: state.megas ?? [],
    /** 기간 한정 이벤트 (시작 전에는 비어 있음) */
    limited: limitedView(state, today, minutes),
  };
}
export type ChildView = ReturnType<typeof childView>;
