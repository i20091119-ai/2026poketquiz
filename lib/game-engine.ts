// 게임 규칙. 서버에서만 실행되며, 정답·보상·확률은 모두 여기서 결정합니다.
import {
  BALLS, DAILY_BOX_TABLE, DAILY_PER_SUBJECT, DUPLICATE_BONUS, EXPLORE_POTION_TABLE, HINT_AFTER_WRONG,
  POTIONS, REWARD_PER_ANSWER, STARTERS, SUBJECTS, SUBJECT_TYPES, TYPE_KEYS,
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
  | { kind: 'potion'; potion: PotionKind; type: TypeKey; amount: number }
  | { kind: 'ball'; ball: BallKind };
export type Ball = { id: string; kind: BallKind };
export type OwnedPokemon = { uid: string; species: number; obtainedAt: string };
export type BankProgress = {
  solved: number[];
  wrong: Record<string, number>;
  /** 틀린 문제 → 마지막으로 틀린 날짜. 다른 날 맞히면 빠집니다. */
  review: Record<string, string>;
  subjectRewards: Subject[];
  masterClaimed: boolean;
};

export type GameState = {
  version: 1;
  exp: number;
  stats: Record<TypeKey, number>;
  partner: string | null;
  owned: OwnedPokemon[];
  dex: number[];
  balls: Ball[];
  seq: number;
  daily: { date: string; bankId: number; questionIds: number[]; correct: number[]; claimed: boolean } | null;
  banks: Record<string, BankProgress>;
};

export class GameError extends Error {}
function fail(message: string): never { throw new GameError(message); }

export type Random = () => number;
export const secureRandom: Random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

export const todayKorea = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

export function initialState(): GameState {
  return {
    version: 1, exp: 0,
    stats: Object.fromEntries(TYPE_KEYS.map(t => [t, 0])) as Record<TypeKey, number>,
    partner: null, owned: [], dex: [], balls: [], seq: 0, daily: null, banks: {},
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
/** 전날 이전에 틀려서 오늘 다시 풀어야 하는 문제 */
const isDue = (prog: BankProgress, id: number, today: string) => !!prog.review[id] && prog.review[id] < today;
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

function rollPotion(potion: PotionKind, types: readonly TypeKey[], random: Random): BoxItem {
  return { kind: 'potion', potion, type: pick(types, random), amount: POTIONS[potion].amount };
}
function grant(state: GameState, item: BoxItem) {
  if (item.kind === 'potion') state.stats[item.type] += item.amount;
  else state.balls.push({ id: nextId(state, 'b'), kind: item.ball });
}

// ---------- 일일미션 ----------
/** 오늘의 미션이 없거나 문제은행이 바뀌었으면 과목별로 새로 뽑습니다. 바뀌었으면 true. */
export function ensureDaily(state: GameState, bank: ActiveBank | null, today: string, random: Random): boolean {
  if (!bank) return false;
  const d = state.daily;
  if (d && d.date === today && d.claimed) return false;
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
    // 복습할 문제(전에 틀린 문제) → 안 푼 문제 → 이미 맞힌 문제 순서
    const due = pool.filter(q => isDue(prog, q.id, today));
    const rest = pool.filter(q => !isDue(prog, q.id, today));
    const ordered = [
      ...shuffle(due, random),
      ...shuffle(rest.filter(q => !solved.has(q.id)), random),
      ...shuffle(rest.filter(q => solved.has(q.id)), random),
    ];
    ids.push(...ordered.slice(0, DAILY_PER_SUBJECT).map(q => q.id));
  }
  state.daily = { date: today, bankId: bank.id, questionIds: ids, correct: [], claimed: false };
  return true;
}

const dailyComplete = (state: GameState) =>
  !!state.daily && state.daily.questionIds.length > 0 && state.daily.questionIds.every(id => state.daily!.correct.includes(id));

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

/** 탐험에서 나올 문제: 아직 못 맞힌 문제 + 전에 틀려서 복습할 문제 */
function explorePool(state: GameState, bank: ActiveBank, subject: Subject, today: string) {
  const prog = progress(state, bank.id);
  const solved = new Set(prog.solved);
  return subjectQuestions(bank, subject).filter(q => !solved.has(q.id) || isDue(prog, q.id, today));
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
  | { type: 'evolve'; uid: string; target: number };

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
        if (!state.daily!.questionIds.includes(q.id)) fail('오늘의 미션 문제가 아니에요. 새로고침해 주세요.');
      } else if (action.mode === 'explore') {
        if (prog.solved.includes(q.id) && !isDue(prog, q.id, ctx.today)) return { correct: true, already: true, explanation: q.explanation, message: '이미 맞힌 문제예요.' };
      } else fail('지원하지 않는 요청이에요.');

      if (action.choice !== q.answer) {
        const count = (prog.wrong[q.id] ?? 0) + 1;
        prog.wrong[q.id] = count;
        prog.review[q.id] = ctx.today; // 다른 날 다시 나오게 합니다
        return { correct: false, message: '괜찮아! 다시 생각해 보자.', hint: count >= HINT_AFTER_WRONG ? q.explanation : undefined };
      }
      const newlySolved = !prog.solved.includes(q.id);
      if (newlySolved) prog.solved.push(q.id);
      // 전날 이전에 틀린 문제를 오늘 맞히면 복습 완료. 같은 날 다시 맞힌 건 내일 또 나옵니다.
      const reviewed = isDue(prog, q.id, ctx.today);
      if (reviewed) delete prog.review[q.id];
      let rewarded = newlySolved || reviewed;
      if (action.mode === 'daily') {
        rewarded = !state.daily!.correct.includes(q.id);
        if (rewarded) state.daily!.correct.push(q.id);
      }
      if (rewarded) {
        state.stats[q.type] += REWARD_PER_ANSWER.stat;
        state.exp += REWARD_PER_ANSWER.exp;
      }
      return {
        correct: true, explanation: q.explanation, gained: rewarded ? { type: q.type, amount: REWARD_PER_ANSWER.stat, exp: REWARD_PER_ANSWER.exp } : undefined,
        reviewed,
        message: reviewed ? '복습 성공! 이번엔 맞혔어!' : rewarded ? '정답이야!' : '정답이야! (이미 보상을 받은 문제)',
      };
    }

    case 'dailyBox': {
      needStarter();
      const choice = needPick(action.pick);
      ensureDaily(state, ctx.bank, ctx.today, random);
      if (!dailyComplete(state)) fail('오늘의 미션을 모두 맞혀야 상자를 열 수 있어요.');
      if (state.daily!.claimed) fail('오늘의 상자는 이미 열었어요. 내일 또 만나요!');
      const items = [0, 1, 2].map(() => {
        const row = weighted<(typeof DAILY_BOX_TABLE)[number]>(DAILY_BOX_TABLE, random);
        return row.item.kind === 'potion' ? rollPotion(row.item.potion, TYPE_KEYS, random) : ({ kind: 'ball', ball: row.item.ball } as BoxItem);
      });
      grant(state, items[choice]);
      state.daily!.claimed = true;
      return { items, pick: choice, message: '상자를 열었어!' };
    }

    case 'exploreReward': {
      needStarter();
      const bank = needBank(ctx.bank);
      const choice = needPick(action.pick);
      if (!SUBJECTS.includes(action.subject)) fail('과목을 다시 골라 주세요.');
      const prog = progress(state, bank.id);
      if (!subjectMastered(state, bank, action.subject)) fail(`${action.subject} 문제를 모두 맞혀야 해요.`);
      if (prog.subjectRewards.includes(action.subject)) fail('이 과목의 물약은 이미 받았어요.');
      const items = [0, 1, 2].map(() => rollPotion(weighted<(typeof EXPLORE_POTION_TABLE)[number]>(EXPLORE_POTION_TABLE, random).potion, SUBJECT_TYPES[action.subject], random));
      grant(state, items[choice]);
      prog.subjectRewards.push(action.subject);
      return { items, pick: choice, message: `${action.subject} 탐험 완료!` };
    }

    case 'masterReward': {
      needStarter();
      const bank = needBank(ctx.bank);
      const choice = needPick(action.pick);
      const prog = progress(state, bank.id);
      if (!allMastered(state, bank)) fail('모든 과목의 탐험을 마쳐야 해요.');
      if (prog.masterClaimed) fail('마스터 보상은 이미 받았어요.');
      const items: BoxItem[] = [0, 1, 2].map(() => ({ kind: 'ball', ball: 'luxury' }));
      grant(state, items[choice]);
      prog.masterClaimed = true;
      return { items, pick: choice, message: '탐험 마스터! 특별한 볼을 얻었어!' };
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

    default:
      fail('지원하지 않는 요청이에요.');
  }
}

// ---------- 아이 화면에 보낼 정보 ----------
export function childView(state: GameState, bank: ActiveBank | null, today: string) {
  const prog = bank ? progress(state, bank.id) : null;
  const byId = new Map(bank?.questions.map(q => [q.id, q]) ?? []);
  const daily = state.daily && bank && state.daily.date === today
    ? {
        date: state.daily.date,
        questions: state.daily.questionIds.map(id => byId.get(id)).filter((q): q is Question => !!q).map(publicQuestion),
        correct: state.daily.correct,
        claimed: state.daily.claimed,
        complete: dailyComplete(state),
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
      /** 복습할 문제 수 (전에 틀린 문제) */
      review: qs.filter(q => isDue(prog!, q.id, today)).length,
      /** 오늘 틀려서 내일 복습으로 나올 문제 수 */
      reviewLater: qs.filter(q => prog!.review[q.id] === today).length,
      rewardClaimed: prog!.subjectRewards.includes(subject),
    };
  }) : [];
  return {
    today,
    exp: state.exp,
    stats: state.stats,
    partner: state.partner,
    owned: state.owned,
    dex: state.dex,
    balls: state.balls,
    bank: bank ? { id: bank.id, title: bank.title } : null,
    daily,
    explore,
    allMastered: bank ? allMastered(state, bank) : false,
    masterClaimed: prog?.masterClaimed ?? false,
  };
}
export type ChildView = ReturnType<typeof childView>;
