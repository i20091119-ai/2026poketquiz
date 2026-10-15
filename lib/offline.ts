// 집 공부(오프라인 미션) 기록 + 전설 조각·전설 단계 (2026-10-15 부모님 요청).
// 아이는 집에서 종이 계획표로 공부하고, 부모님이 보호자 공간 달력에 ●(다 했어요)·■(하나라도 했어요)·▲(못 했어요)를 적습니다.
// 다음 날 앱을 열면 하루 선물 상자, 한 주(월~일)가 끝나면 합계로 전설 조각. 조각을 모으면 마스터볼 3개 중 하나에서 전설 포켓몬.
// 상태 변경은 lib/game-engine.ts, 이 파일은 규칙과 계산만.

export type DayMark = 'full' | 'some' | 'none';
export const DAY_MARKS: DayMark[] = ['full', 'some', 'none'];
/** 달력에 보이는 표시 */
export const MARK_SYMBOL: Record<DayMark, string> = { full: '●', some: '■', none: '▲' };
export const MARK_LABEL: Record<DayMark, string> = { full: '다 했어요', some: '하나라도 했어요', none: '못 했어요' };
/** 한 주 합계: ● 1, ■ 0.5 (■ 2개 = ● 1개) */
export const MARK_SCORE: Record<DayMark, number> = { full: 1, some: 0.5, none: 0 };

/** 하루 선물 상자 종류: 책 상자(볼 한 등급 위) / 랜덤상자 / 없음 */
export type DayBoxKind = 'book' | 'normal' | 'off';
export const DAY_BOX_LABEL: Record<DayBoxKind, string> = { book: '📘 수련 상자', normal: '🎁 랜덤상자', off: '없음' };

/** 처음 값 (보호자 공간 전체 설정 "집 공부 · 전설 규칙"에서 바꾸면 settings.offline_rules에 바꾼 것만) */
export const OFFLINE_DEFAULT = {
  /** 한 주 합계가 이 숫자 이상이면 전설 조각 1개 (그 주에 처음 기록할 때 그 주에 고정) */
  weekGoal: 5,
  /** ● 날 선물 */
  fullBox: 'book' as DayBoxKind, fullCount: 1,
  /** ■ 날 선물 */
  someBox: 'normal' as DayBoxKind, someCount: 1,
  /** ▲ 날 선물 */
  noneBox: 'off' as DayBoxKind, noneCount: 0,
  /** 이벤트 하나에 주는 전설 조각 기본 수 (나들이 체험보고서 등, 이벤트를 열 때 바꿀 수 있음) */
  eventPieces: 2,
  /** 전설 마스터볼에 이로치 확률(마스터볼 확률) 적용 */
  legendShiny: true,
  /** 단계마다 전설 한 마리에 필요한 조각 수. 적힌 단계 뒤로는 마지막 값에서 1씩 늘어남 (3, 4, 5, 6…) */
  stageNeeds: [3, 4] as number[],
  /** 단계별 전설 후보 (단계 번호 → 전국도감 번호). 이미 가진 포켓몬은 자동으로 빠짐 */
  candidates: { 1: [145, 144, 243, 244, 245] } as Record<string, number[]>,
  /** "다른 모양으로 다시 만들기" (4단계부터 자동 보석 모양의 씨앗에 더하는 값) */
  gemSalt: {} as Record<string, number>,
};
export type OfflineRules = typeof OFFLINE_DEFAULT;
export const LEGEND_PER_STAGE = 5;
export const STAGE_NEED_MAX = 20;

/** 숫자 칸 (보호자 화면) */
export const OFFLINE_FIELDS: { key: 'weekGoal' | 'fullCount' | 'someCount' | 'noneCount' | 'eventPieces'; label: string; min: number; max: number; step?: number }[] = [
  { key: 'weekGoal', label: '한 주 조각 기준 (● 1, ■ 0.5)', min: 1, max: 7, step: 0.5 },
  { key: 'fullCount', label: '● 날 상자 수', min: 0, max: 3 },
  { key: 'someCount', label: '■ 날 상자 수', min: 0, max: 3 },
  { key: 'noneCount', label: '▲ 날 상자 수', min: 0, max: 3 },
  { key: 'eventPieces', label: '이벤트 기본 전설 조각 수', min: 0, max: 5 },
];
const isBoxKind = (v: unknown): v is DayBoxKind => v === 'book' || v === 'normal' || v === 'off';
const isId = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 1025;

/** 저장된 값 중 올바른 것만 남김 */
export function cleanOfflineRules(ov?: Partial<Record<string, unknown>> | null): Partial<OfflineRules> {
  const out: Partial<OfflineRules> = {};
  if (!ov || typeof ov !== 'object') return out;
  for (const f of OFFLINE_FIELDS) {
    const v = ov[f.key];
    const step = f.step ?? 1;
    if (typeof v === 'number' && v >= f.min && v <= f.max && Number.isInteger(v / step)) (out as Record<string, number>)[f.key] = v;
  }
  for (const k of ['fullBox', 'someBox', 'noneBox'] as const) if (isBoxKind(ov[k])) out[k] = ov[k] as DayBoxKind;
  if (typeof ov.legendShiny === 'boolean') out.legendShiny = ov.legendShiny;
  if (Array.isArray(ov.stageNeeds)) {
    const needs = ov.stageNeeds.filter(n => Number.isInteger(n) && n >= 1 && n <= STAGE_NEED_MAX).slice(0, 30) as number[];
    if (needs.length) out.stageNeeds = needs;
  }
  if (ov.candidates && typeof ov.candidates === 'object') {
    const c: Record<string, number[]> = {};
    for (const [stage, ids] of Object.entries(ov.candidates as Record<string, unknown>)) {
      if (!/^\d{1,2}$/.test(stage) || !Array.isArray(ids)) continue;
      c[stage] = [...new Set(ids.filter(isId) as number[])].slice(0, LEGEND_PER_STAGE);
    }
    out.candidates = c;
  }
  if (ov.gemSalt && typeof ov.gemSalt === 'object') {
    const s: Record<string, number> = {};
    for (const [stage, v] of Object.entries(ov.gemSalt as Record<string, unknown>)) if (/^\d{1,2}$/.test(stage) && Number.isInteger(v) && (v as number) >= 0) s[stage] = v as number;
    out.gemSalt = s;
  }
  return out;
}
/** 처음 값 + 바꾼 것 (후보는 단계별로 덮어씀) */
export function offlineRulesOf(ov?: Partial<OfflineRules> | null): OfflineRules {
  const clean = cleanOfflineRules(ov as Record<string, unknown>);
  return { ...OFFLINE_DEFAULT, ...clean, candidates: { ...OFFLINE_DEFAULT.candidates, ...(clean.candidates ?? {}) }, gemSalt: { ...(clean.gemSalt ?? {}) } };
}
/** 이 단계에서 전설 한 마리에 필요한 조각 수 */
export function stageNeed(rules: Pick<OfflineRules, 'stageNeeds'>, stage: number): number {
  const needs = rules.stageNeeds.length ? rules.stageNeeds : OFFLINE_DEFAULT.stageNeeds;
  if (stage <= needs.length) return needs[stage - 1];
  return Math.min(STAGE_NEED_MAX, needs[needs.length - 1] + (stage - needs.length));
}
export const stageCandidates = (rules: Pick<OfflineRules, 'candidates'>, stage: number) => rules.candidates[String(stage)] ?? [];

// ---------- 날짜 ----------
const dayNo = (date: string) => Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);
export const plusDays = (date: string, n: number) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
/** 그 날이 속한 주의 월요일 */
export function weekStartOf(date: string): string {
  const dow = new Date(date + 'T00:00:00Z').getUTCDay(); // 0 일 … 6 토
  return plusDays(date, -((dow + 6) % 7));
}
export const weekDates = (start: string) => Array.from({ length: 7 }, (_, i) => plusDays(start, i));
export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
export const daysBetween = (a: string, b: string) => dayNo(b) - dayNo(a);

/** 한 주 합계 (● 1, ■ 0.5) */
export function weekScore(marks: Record<string, DayMark | undefined>, start: string): number {
  return weekDates(start).reduce((sum, d) => sum + (marks[d] ? MARK_SCORE[marks[d]!] : 0), 0);
}
/** 3.5 → "3½" */
export function halfText(n: number): string {
  const whole = Math.floor(n);
  const half = n - whole >= 0.5;
  return half ? (whole ? `${whole}½` : '½') : String(whole);
}
/**
 * 모자랐을 때 아이에게 보여 줄 말 (실패라는 말 없이, 무엇이 더 있었으면 됐는지).
 * 빈 날·▲ 날을 ●로(+1) 먼저, 그다음 ■를 ●로(+0.5) 바꾸는 가장 적은 횟수로 셉니다.
 */
export function shortMessage(marks: Record<string, DayMark | undefined>, start: string, goal: number): string {
  const score = weekScore(marks, start);
  const short = goal - score;
  if (short <= 0) return '';
  const days = weekDates(start).map(d => marks[d]);
  const empty = days.filter(m => !m || m === 'none').length;
  const some = days.filter(m => m === 'some').length;
  let left = short;
  const toFull = Math.min(empty, Math.floor(left));
  left -= toFull;
  let swap = 0;
  let extraFull = 0;
  if (left > 0) {
    // 남은 반 개: ■ → ● 로, ■가 없으면 빈 날 하나 더 ●로
    if (some >= Math.ceil(left / 0.5)) swap = Math.ceil(left / 0.5);
    else if (empty > toFull) extraFull = 1;
    else swap = some;
  }
  const full = toFull + extraFull;
  const parts = [full ? `●가 ${countWord(full)} 더` : '', swap ? `■ 대신 ●가 ${countWord(swap)}` : ''].filter(Boolean);
  const how = parts.length === 2 ? `${parts[0]}, ${parts[1]}만 더` : full ? `●가 ${countWord(full)}만 더` : `■ 대신 ●가 ${countWord(swap)}만 더`;
  return `이번엔 ${halfText(short)}개가 모자랐어. ${how} 있었으면 됐어. 이번 주 수련 다시 도전!`;
}
const countWord = (n: number) => (['', '한 번', '두 번', '세 번', '네 번', '다섯 번', '여섯 번', '일곱 번'][n] ?? `${n}번`);
