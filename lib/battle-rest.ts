// 포켓로그 쉬는 시간 규칙 (보호자 공간에서 정함). 서버의 한국 시간으로만 판단합니다 — 기기 시계는 믿지 않습니다.
import { BATTLE_REST_DEFAULT, BATTLE_REST_WARN_MINUTES } from './game-config.ts';

export type RestRule = {
  id: string;
  name: string;
  /** 0 일요일 … 6 토요일 */
  days: number[];
  /** 'HH:MM' */
  start: string;
  /** 'HH:MM'. 시작보다 빠르면 다음 날 그 시각까지 (예: 22:30~07:30) */
  end: string;
};
/** 지금 시각: 날짜(YYYY-MM-DD), 요일(0~6), 자정부터 지난 분 */
export type Clock = { date: string; weekday: number; minutes: number };

export const REST_NAME_MAX = 20;

/** 'HH:MM' → 분 (잘못된 값은 null) */
export function parseHm(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
export const formatHm = (minutes: number) => `${String(Math.floor(((minutes % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** 보호자가 보낸 규칙 목록을 정리합니다. 잘못된 것은 오류로 알립니다. */
export function normalizeRules(input: unknown): RestRule[] {
  if (!Array.isArray(input)) throw new Error('쉬는 시간 목록을 읽지 못했어요.');
  if (input.length > 10) throw new Error('쉬는 시간은 10개까지 둘 수 있어요.');
  return input.map((raw, i) => {
    const r = (raw ?? {}) as Partial<RestRule>;
    const name = String(r.name ?? '').trim().slice(0, REST_NAME_MAX) || `쉬는 시간 ${i + 1}`;
    const days = [...new Set((Array.isArray(r.days) ? r.days : []).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    if (!days.length) throw new Error(`'${name}'의 요일을 하나 이상 골라 주세요.`);
    const start = parseHm(String(r.start ?? '')), end = parseHm(String(r.end ?? ''));
    if (start === null || end === null) throw new Error(`'${name}'의 시작·끝 시각을 확인해 주세요.`);
    if (start === end) throw new Error(`'${name}'의 시작과 끝 시각이 같아요.`);
    const id = String(r.id ?? '').trim().slice(0, 20) || `r${i + 1}`;
    return { id, name, days, start: formatHm(start), end: formatHm(end) };
  });
}

export const defaultRules = (): RestRule[] => BATTLE_REST_DEFAULT.map(r => ({ ...r, days: [...r.days] }));

export type RestStatus = {
  /** 지금 쉬는 시간이라 배틀을 막아야 하는지 */
  blocked: boolean;
  /** 막고 있는 규칙 이름 (예: 잠자는 시간) */
  name: string | null;
  /** 막고 있으면 끝나는 시각 'HH:MM' */
  until: string | null;
  /** 곧(BATTLE_REST_WARN_MINUTES 분 안에) 시작하는 쉬는 시간 — 게임 화면 미리 알림용 */
  soon: { name: string; inMinutes: number; at: string } | null;
  /** 아이에게 보여 줄 말 */
  message: string | null;
};

/** 이 규칙이 (weekday, minutes)에 켜져 있는지. 자정을 넘기는 규칙은 전날 시작분과 오늘 시작분을 모두 봅니다. */
function ruleActive(rule: RestRule, weekday: number, minutes: number): { active: boolean; until: number } {
  const start = parseHm(rule.start)!, end = parseHm(rule.end)!;
  if (start < end) return { active: rule.days.includes(weekday) && minutes >= start && minutes < end, until: end };
  // 자정 넘김: 오늘 시작해서 내일 끝나거나, 어제 시작해서 오늘 끝남
  if (rule.days.includes(weekday) && minutes >= start) return { active: true, until: end };
  const yesterday = (weekday + 6) % 7;
  if (rule.days.includes(yesterday) && minutes < end) return { active: true, until: end };
  return { active: false, until: end };
}

export const restMessage = (name: string) => `지금은 ${name}이야. 일일미션이나 탐험을 하며 포켓몬을 강화하자!`;

/** 지금 배틀을 막아야 하는지와 곧 시작하는 쉬는 시간. openToday 면 오늘은 막지 않습니다. */
export function restStatus(rules: RestRule[], clock: Clock, openToday: boolean, warnMinutes = BATTLE_REST_WARN_MINUTES): RestStatus {
  const none: RestStatus = { blocked: false, name: null, until: null, soon: null, message: null };
  if (openToday || rules.length === 0) return none;
  for (const rule of rules) {
    const { active, until } = ruleActive(rule, clock.weekday, clock.minutes);
    if (active) return { blocked: true, name: rule.name, until: formatHm(until), soon: null, message: restMessage(rule.name) };
  }
  let soon: RestStatus['soon'] = null;
  for (const rule of rules) {
    if (!rule.days.includes(clock.weekday)) continue;
    const start = parseHm(rule.start)!;
    const inMinutes = start - clock.minutes;
    if (inMinutes > 0 && inMinutes <= warnMinutes && (!soon || inMinutes < soon.inMinutes)) soon = { name: rule.name, inMinutes, at: rule.start };
  }
  return { ...none, soon };
}

/** 한국 시간 지금 (날짜·요일·분) */
export function nowKorea(now = new Date()): Clock {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' })
    .formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = Number(get('hour')) % 24;
  const minutes = hour * 60 + Number(get('minute'));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { date, weekday: weekday < 0 ? weekdayOf(date) : weekday, minutes };
}
/** 'YYYY-MM-DD'의 요일 (0 일 … 6 토) */
export const weekdayOf = (date: string) => new Date(date + 'T00:00:00Z').getUTCDay();
