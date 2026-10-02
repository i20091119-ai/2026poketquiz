import { BALLS, TYPE_INFO, type TypeKey } from './game-config.ts';
import { boxItemLabel, type Action, type BoxItem, type Context, type GameState } from './game-engine.ts';
import { evolutionRequirement, shinyName, species } from './pokedex.ts';

/**
 * 활동 기록: 아이가 한 행동을 시간 순서대로 남깁니다 ("아이 기록 내보내기"의 재료).
 * 기록은 퀴즈 기록(game_state)과 따로 `activity_log` 표에 쌓여서, 퀴즈 기록이 오래된 것을 지워도 남습니다.
 * 이 파일은 "행동 전 모습"과 "행동 후 모습"을 비교해 무슨 일이 있었는지 정리하는 순수 계산만 합니다.
 */
export type LogEntry = {
  kind: string;
  data: Record<string, unknown>;
  /** 있으면 같은 (기록, 종류, ukey) 한 줄만 두고 덮어씀 (예: 하루 활동 요약) */
  ukey?: string;
};

/** 내보내기 항목마다 "언제부터 쌓이는지"를 설명할 때 쓰는 종류 이름 */
export const LOG_KINDS = {
  answer: '문제 풀이(고른 답·시도)',
  stat: '속성 스탯·경험치 변화',
  pokemon: '포켓몬 얻음(얻은 방법)',
  evolve: '진화 기록',
  ball: '볼 연 결과',
  reward: '상자·보상 고른 내용',
  potion: '아이템(열매·상처약) 먹임',
  candy: '포켓로그 사탕',
  giftSent: '보낸 선물',
  giftOpen: '선물 열기',
  giftReply: '선물 답장',
  event: '도전 이벤트 진행',
  battleStart: '포켓로그 새 판 시작',
  battleRun: '포켓로그 판 결과',
  reset: '아이 게임 처음부터 다시 하기',
  revive: '부활권 사용',
  day: '하루 활동 요약',
  limited: '기간 한정 이벤트(레인보우) 진행',
} as const;

export type Before = {
  stats: Record<string, number>;
  exp: number;
  owned: Map<string, number>;
  tries: number;
  candySent: number;
  events: string;
  limited: string;
  ballKind?: string;
};

/** 행동을 적용하기 직전에 부릅니다 */
export function beforeAction(state: GameState, action: Action, today: string): Before {
  return {
    stats: { ...state.stats },
    exp: state.exp,
    owned: new Map(state.owned.map(p => [p.uid, p.species])),
    // 자정을 넘겨 어제 미션의 시도 횟수가 이어지지 않게 날짜를 확인
    tries: action.type === 'answer' && state.daily?.date === today ? state.daily.tries?.[action.questionId] ?? 0 : 0,
    candySent: state.candy?.sent ?? 0,
    events: JSON.stringify(state.events ?? null),
    limited: JSON.stringify(state.limited ?? null),
    ballKind: action.type === 'openBall' ? state.balls.find(b => b.id === action.ballId)?.kind : undefined,
  };
}

const statLabel = (t: string) => TYPE_INFO[t as TypeKey]?.label ?? t;

/** 도전 이벤트 진도가 바뀌었는지 (아이 화면을 열 때도 부름) */
export function eventsChange(before: Before, state: GameState): LogEntry[] {
  const now = JSON.stringify(state.events ?? null);
  const out: LogEntry[] = now === before.events ? [] : [{ kind: 'event', data: { events: state.events ?? null } }];
  // 기간 한정 이벤트: 조각·연속 수·이로치 변신·정산이 바뀌면 그때의 모습을 남김
  if (JSON.stringify(state.limited ?? null) !== before.limited) out.push({ kind: 'limited', data: { limited: state.limited ?? null } });
  return out;
}

/** 행동 뒤에 부릅니다. 이 행동으로 남길 기록 목록을 돌려줍니다. */
export function afterAction(before: Before, state: GameState, action: Action, result: unknown, ctx: Context): LogEntry[] {
  const out: LogEntry[] = [];
  const r = (result ?? {}) as Record<string, unknown>;

  if (action.type === 'answer') {
    const q = ctx.bank?.questions.find(q => q.id === action.questionId);
    if (q) {
      const correct = r.correct === true;
      out.push({
        kind: 'answer',
        data: {
          mode: action.mode === 'daily' ? '일일미션' : '탐험',
          bankId: ctx.bank?.id ?? null, questionId: q.id,
          subject: q.subject, area: q.area || '기타', type: statLabel(q.type),
          prompt: q.prompt, choices: q.choices,
          chosen: action.choice + 1, chosenText: q.choices[action.choice] ?? null,
          answer: q.answer + 1, correct,
          // 일일미션은 문제마다 기회가 3번이라 몇 번째 시도인지 남기고, 탐험은 늘 1번째
          attempt: action.mode === 'daily' ? before.tries + 1 : 1,
          final: r.final === false ? false : true,
          reviewed: r.reviewed === true,
        },
      });
    }
  }

  // 속성 스탯·경험치 변화
  const deltas: Record<string, number> = {};
  for (const [t, v] of Object.entries(state.stats)) {
    const d = v - (before.stats[t] ?? 0);
    if (d) deltas[statLabel(t)] = d;
  }
  const expDelta = state.exp - before.exp;
  if (Object.keys(deltas).length || expDelta) {
    const reason = action.type === 'answer' ? `문제 정답(${action.mode === 'daily' ? '일일미션' : '탐험'})`
      : action.type === 'usePotion' ? '아이템 먹임' : action.type === 'evolve' ? '진화로 스탯 사용'
      : action.type === 'exchangeExp' ? '경험치를 스탯으로 바꿈' : action.type === 'openBall' ? '이미 있는 포켓몬(우정 보너스)'
      : action.type === 'openGift' ? '선물' : action.type;
    out.push({ kind: 'stat', data: { reason, deltas, exp: expDelta || undefined, statsAfter: Object.fromEntries(Object.entries(state.stats).map(([t, v]) => [statLabel(t), v])) } });
  }

  // 새로 얻은 포켓몬
  for (const p of state.owned) {
    if (before.owned.has(p.uid)) continue;
    out.push({
      kind: 'pokemon',
      data: {
        uid: p.uid, obtainedAt: p.obtainedAt, species: p.species, name: p.shiny ? shinyName(p.species) : species(p.species).name, shiny: !!p.shiny,
        how: action.type === 'starter' ? '시작 파트너' : action.type === 'openBall' ? `${BALLS[before.ballKind as keyof typeof BALLS]?.label ?? '볼'} 열기` : action.type,
      },
    });
  }

  if (action.type === 'openBall') {
    const caught = Number(r.caught);
    out.push({
      kind: 'ball',
      data: {
        ballId: action.ballId, ball: before.ballKind ?? null, ballLabel: BALLS[before.ballKind as keyof typeof BALLS]?.label ?? null,
        caught, name: r.shiny === true ? shinyName(caught) : species(caught).name, tier: r.tier, shiny: r.shiny === true, duplicate: r.duplicate === true,
        bonus: r.duplicate === true ? r.bonus : undefined,
      },
    });
  }

  if (action.type === 'evolve') {
    const to = action.target;
    const from = before.owned.get(action.uid);
    const p = state.owned.find(p => p.uid === action.uid);
    out.push({
      kind: 'evolve',
      data: {
        uid: action.uid, shiny: !!p?.shiny, from, fromName: from ? species(from).name : null, to, toName: species(to).name,
        cost: evolutionRequirement(to).map(c => ({ type: statLabel(c.type), amount: c.amount })),
      },
    });
  }

  if (action.type === 'usePotion') {
    const target = state.owned.find(p => p.uid === action.uid);
    out.push({
      kind: 'potion',
      data: {
        potionId: action.potionId, uid: action.uid, species: target ? species(target.species).name : null,
        types: (Array.isArray(r.types) ? r.types as string[] : []).map(statLabel), amount: r.amount,
      },
    });
  }

  // 상자·선물 등 "여러 개 중 하나 고르기"
  const sources: Record<string, string> = {
    dailyBox: '일일미션 랜덤상자', exploreReward: '탐험 과목 선물', masterReward: '탐험 마스터 보상', expGift: '경험치 선물', eventBox: '10일 연속 상자',
  };
  if (action.type in sources) {
    let items: BoxItem[] | null = null, picked: number | null = null;
    if (action.type === 'dailyBox') { items = state.daily?.box?.items ?? null; picked = action.pick; }
    else if (Array.isArray(r.items)) { items = r.items as BoxItem[]; picked = Array.isArray(r.picks) ? (r.picks as number[])[0] ?? null : null; }
    if (items) out.push({ kind: 'reward', data: { source: sources[action.type], options: items.map(boxItemLabel), picked: picked === null ? null : boxItemLabel(items[picked]), ballIds: Array.isArray(r.ballIds) ? r.ballIds : undefined } });
  }

  if (action.type === 'openGift') {
    const g = (state.gifts ?? []).find(g => g.id === action.id);
    out.push({ kind: 'giftOpen', data: { id: action.id, choice: action.choice, got: g?.opened?.got ?? null, ballIds: g?.opened?.ballId ? [g.opened.ballId] : undefined } });
  }
  if (action.type === 'replyGift') {
    const g = (state.gifts ?? []).find(g => g.id === action.id);
    out.push({ kind: 'giftReply', data: { id: action.id, sticker: g?.reply?.sticker ?? action.sticker, text: g?.reply?.text ?? '' } });
  }

  const candyDelta = (state.candy?.sent ?? 0) - before.candySent;
  if (candyDelta > 0) {
    const partner = state.owned.find(p => p.uid === state.partner);
    out.push({ kind: 'candy', data: { amount: candyDelta, source: action.type === 'openGift' ? '선물' : '일일미션 완료', species: partner ? species(partner.species).name : null } });
  }

  return [...out, ...eventsChange(before, state)];
}

/** 하루 활동 요약 한 줄 (퀴즈 화면 시간·푼 문제·포켓로그 시간·최고 웨이브·새 판) */
export function daySummary(state: GameState, date: string): LogEntry {
  const q = state.quizLog?.[date], b = state.battleLog?.[date];
  return {
    kind: 'day', ukey: date,
    data: {
      date, quizSeconds: q?.seconds ?? 0, answered: q?.answered ?? 0, correctFirstTry: q?.correct ?? 0,
      battleSeconds: b?.seconds ?? 0, maxWave: b?.maxWave ?? 0, newGames: b?.starts ?? 0,
    },
  };
}
