// 게임 규칙. 서버에서만 실행되며, 정답·보상·확률은 모두 여기서 결정합니다.
import {
  BALLS, BATTLE_LOG_DAYS, BATTLE_REPORT_MAX_SECONDS, BATTLE_STARTS_PER_DAY, DAILY_ATTEMPTS, DAILY_BOX_RULES, DAILY_BOX_TABLE, DAILY_PER_SUBJECT, DUPLICATE_BONUS, EXP_EXCHANGE, EXP_GIFT, EXPLORE_ITEM_WEIGHTS,
  eulReul, POTIONS, potionTargets, REWARD_PER_ANSWER, STARTERS, statReward, SUBJECT_BERRY, SUBJECTS, SUBJECT_TYPES, TYPE_INFO, TYPE_KEYS,
  type BallKind, type PotionKind, type Subject, type TypeKey,
} from './game-config.ts';
import { CATCH_POOLS, evolutionRequirement, evolutionsOf, species, typeLabel } from './pokedex.ts';

export type Question = {
  id: number;
  subject: Subject;
  type: TypeKey;
  prompt: string;
  choices: string[];
  answer: number;
  explanation: string;
};
export type PublicQuestion = Omit<Question, 'answer' | 'explanation'>;
export type ActiveBank = { id: number; title: string; questions: Question[] };

export type BoxItem =
  | { kind: 'potion'; potion: PotionKind; amount: number }
  | { kind: 'ball'; ball: BallKind };
export type Ball = { id: string; kind: BallKind };
export type Potion = { id: string; kind: PotionKind };
export type OwnedPokemon = { uid: string; species: number; obtainedAt: string };
export type BankProgress = {
  solved: number[];
  wrong: Record<string, number>;
  /** 틀린 문제 → 마지막으로 틀린 날짜. 그날은 다시 나오지 않고, 다른 날 맞히면 빠집니다. */
  review: Record<string, string>;
  subjectRewards: Subject[];
  masterClaimed: boolean;
};

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
};
export type BattleDay = { maxWave: number; seconds: number; starts: number };

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
/** 전날 이전에 틀려서 오늘 다시 나와야 하는 문제 */
const isDue = (prog: BankProgress, id: number, today: string) => !!prog.review[id] && prog.review[id] < today;
/** 오늘 이미 틀린 문제 (오늘은 다시 풀 수 없음) */
const wrongToday = (prog: BankProgress, id: number, today: string) => prog.review[id] === today;
export const publicQuestion = ({ id, subject, type, prompt, choices }: Question): PublicQuestion =>
  ({ id, subject, type, prompt, choices });

function addPokemon(state: GameState, id: number, now: string) {
  const duplicate = state.owned.some(p => p.species === id);
  if (!state.dex.includes(id)) state.dex.push(id);
  if (duplicate) {
    const type = species(id).types[0];
    state.stats[type] += DUPLICATE_BONUS;
    return { duplicate: true, bonus: { type, amount: DUPLICATE_BONUS } };
  }
  const uid = nextId(state, 'p');
  state.owned.push({ uid, species: id, obtainedAt: now });
  return { duplicate: false, uid };
}

function rollPotion(potion: PotionKind): BoxItem {
  return { kind: 'potion', potion, amount: POTIONS[potion].amount };
}
/** 보상을 주고, 볼이면 새 볼 id를 돌려줍니다. */
function grant(state: GameState, item: BoxItem): string | null {
  if (item.kind === 'potion') { (state.potions ??= []).push({ id: nextId(state, 'm'), kind: item.potion }); return null; }
  const id = nextId(state, 'b');
  state.balls.push({ id, kind: item.ball });
  return id;
}

// ---------- 일일미션 ----------
/** 'YYYY-MM-DD' → 1970-01-01부터 며칠째 */
const dayNumber = (date: string) => Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);

/** 오늘의 미션이 없거나 문제은행이 바뀌었으면 과목별로 새로 뽑습니다. 바뀌었으면 true. */
export function ensureDaily(state: GameState, bank: ActiveBank | null, today: string, random: Random): boolean {
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
    const ordered = [
      ...shuffle(due, random),
      ...shuffle(rest.filter(q => !solved.has(q.id)), random),
      ...shuffle(rest.filter(q => solved.has(q.id)), random),
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
      const next = byNeed.map(t => ordered.find(q => !picked.includes(q) && q.type === t)).find(Boolean)
        ?? ordered.find(q => !picked.includes(q));
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
function explorePool(state: GameState, bank: ActiveBank, subject: Subject, today: string) {
  const prog = progress(state, bank.id);
  const solved = new Set(prog.solved);
  return subjectQuestions(bank, subject).filter(q =>
    !solved.has(q.id) && !wrongToday(prog, q.id, today) && !inTodayDaily(state, q.id, today));
}

export function nextExploreQuestion(state: GameState, bank: ActiveBank | null, subject: Subject, today: string, random: Random, skip?: number) {
  if (!bank) return null;
  const left = explorePool(state, bank, subject, today);
  const choices = left.length > 1 ? left.filter(q => q.id !== skip) : left;
  return choices.length ? publicQuestion(pick(choices, random)) : null;
}

// ---------- 행동 ----------
export type Action =
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
  | { type: 'expGift'; pick: number };

export type Context = { bank: ActiveBank | null; today: string; now: string; random: Random };

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
      if (action.mode === 'daily') {
        ensureDaily(state, bank, ctx.today, random);
        const d = state.daily!;
        if (!d.questionIds.includes(q.id)) fail('오늘의 미션 문제가 아니에요. 새로고침해 주세요.');
        if (d.correct.includes(q.id) || d.wrong.includes(q.id)) fail('이 문제는 오늘 이미 풀었어요.');
        if (d.box) fail('오늘의 미션은 끝났어요.');
      } else if (action.mode === 'explore') {
        if (prog.solved.includes(q.id)) fail('이미 맞힌 문제예요.');
        if (wrongToday(prog, q.id, ctx.today)) fail('이 문제는 다른 날 다시 도전해 보자!');
        if (inTodayDaily(state, q.id, ctx.today)) fail('이 문제는 오늘의 미션에서 풀어 줘.');
      } else fail('지원하지 않는 요청이에요.');

      // 틀리면: '안 푼 문제'로 돌려놓고, 다른 날 일일미션·탐험에 다시 나오게 합니다.
      // 일일미션은 기회가 남아 있으면 다시 풀 수 있고, 탐험은 기회가 한 번입니다.
      if (action.choice !== q.answer) {
        prog.wrong[q.id] = (prog.wrong[q.id] ?? 0) + 1;
        prog.review[q.id] = ctx.today;
        prog.solved = prog.solved.filter(id => id !== q.id);
        if (action.mode === 'daily') {
          const d = state.daily!;
          d.tries[q.id] = (d.tries[q.id] ?? 0) + 1;
          const left = DAILY_ATTEMPTS - d.tries[q.id];
          if (left > 0) return { correct: false, final: false, triesLeft: left, message: `괜찮아! 다시 생각해 보자. 기회가 ${left}번 남았어.` };
          d.wrong.push(q.id);
        }
        return {
          correct: false, final: true, answer: q.answer, explanation: q.explanation,
          message: `아쉬워! 정답은 ${q.answer + 1}번이야. 이 문제는 다른 날 다시 나올 거야.`,
        };
      }

      // 전날 이전에 틀린 문제를 맞히면 다시 풀기 완료. 오늘 틀렸다가 다시 맞힌 문제는 다른 날 한 번 더 나옵니다.
      const reviewed = isDue(prog, q.id, ctx.today);
      if (reviewed) delete prog.review[q.id];
      const newlySolved = !prog.solved.includes(q.id);
      if (newlySolved) prog.solved.push(q.id);
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
      };
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
      const odds = BALLS[ball.kind].odds;
      const tier = weighted<{ tier: number; weight: number }>(odds.map((weight, tier) => ({ tier, weight })), random).tier;
      const id = pick(CATCH_POOLS[tier], random);
      const result = addPokemon(state, id, ctx.now);
      const name = species(id).name;
      return {
        caught: id, tier, ...result,
        message: result.duplicate ? `${name}를 또 만났어! 우정 보너스를 받았어.` : `${name}를 잡았어!`,
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
      if (!state.dex.includes(action.target)) state.dex.push(action.target);
      return { evolved: action.target, message: `축하해! ${before}가 ${species(action.target).name}로 진화했어!` };
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

    default:
      fail('지원하지 않는 요청이에요.');
  }
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
/** 새 게임을 시작합니다(횟수 1 차감). 남은 횟수가 없으면 false. 이어하기는 이 함수를 거치지 않습니다. */
export function startBattle(state: GameState, today: string): boolean {
  if (battleStartsLeft(state, today) < 1) return false;
  const starts = state.battle?.date === today ? state.battle.starts : 0;
  state.battle = { date: today, starts: starts + 1 };
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

/** 보호자 화면용: 최근 날짜부터 */
export const battleLogList = (state: GameState) =>
  Object.entries(state.battleLog ?? {}).sort(([a], [b]) => (a < b ? 1 : -1)).map(([date, day]) => ({ date, ...day }));

// ---------- 아이 화면에 보낼 정보 ----------
export function childView(state: GameState, bank: ActiveBank | null, today: string) {
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
    /** 포켓로그(/battle): 오늘 남은 새 게임 횟수 */
    battle: { left: battleStartsLeft(state, today), perDay: BATTLE_STARTS_PER_DAY },
  };
}
export type ChildView = ReturnType<typeof childView>;
