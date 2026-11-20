// 제때 등교 (2026-11-20 부모님 요청). 가족 대시보드(따로 만든 프로그램)가 교문 통과 시각을 보내면 포켓퀴즈가 판정합니다.
// - 기준 시각: 처음 2주 08:45, 그 뒤 08:40 (보호자 공간 전체 설정에서 바꿈 = settings.school_rules 바꾼 것만)
// - 기준 시각 "이전"(같은 분 포함, 초는 버림)이면 성공 → 그날 미션을 끝내고 마을에 들어가면 우체통 편지로 기본 재료 6종 중 1개 고르기
// - 같은 날 두 번 와도 한 번만. 실패·기록 없음은 아무 연출 없음. 보호자는 그날 저녁(handCheckUntil)까지 "제때 도착" 손 체크
// 상태 변경은 lib/game-engine.ts, 이 파일은 규칙과 계산만.

export const SCHOOL_DEFAULT = {
  /** 처음 기간의 기준 시각 */
  firstTime: '08:45',
  /** 처음 기간(주). 시작일부터 이 주 수 동안 firstTime */
  firstWeeks: 2,
  /** 그 뒤 기준 시각 */
  laterTime: '08:40',
  /** 시작일 (비우면 처음 등교 기록이 온 날) */
  startDate: '',
  /** 보호자 손 체크를 할 수 있는 마지막 시각 (그날만) */
  handCheckUntil: '21:00',
};
export type SchoolRules = typeof SCHOOL_DEFAULT;

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isHm = (v: unknown): v is string => typeof v === 'string' && HM.test(v);
export const isDateStr = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));
/** "08:41", "08:41:30", "8:41" → "08:41" (초는 버림). 아니면 null */
export function normalizeTime(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hm = `${m[1].padStart(2, '0')}:${m[2]}`;
  return isHm(hm) ? hm : null;
}

export function cleanSchoolRules(ov?: Partial<Record<string, unknown>> | null): Partial<SchoolRules> {
  const out: Partial<SchoolRules> = {};
  if (!ov || typeof ov !== 'object') return out;
  for (const k of ['firstTime', 'laterTime', 'handCheckUntil'] as const) if (isHm(ov[k])) out[k] = ov[k] as string;
  if (typeof ov.firstWeeks === 'number' && Number.isInteger(ov.firstWeeks) && ov.firstWeeks >= 0 && ov.firstWeeks <= 52) out.firstWeeks = ov.firstWeeks;
  if (ov.startDate === '' || isDateStr(ov.startDate)) out.startDate = ov.startDate as string;
  return out;
}
export const schoolRulesOf = (ov?: Partial<SchoolRules> | null): SchoolRules => ({ ...SCHOOL_DEFAULT, ...cleanSchoolRules(ov as Record<string, unknown>) });

const dayNo = (date: string) => Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);
/** 그 날의 기준 시각 (start = 시작일: 규칙의 startDate, 없으면 처음 기록 날) */
export function deadlineFor(rules: SchoolRules, date: string, start: string | null): string {
  const s = rules.startDate || start || date;
  return dayNo(date) - dayNo(s) < rules.firstWeeks * 7 ? rules.firstTime : rules.laterTime;
}
/** 기준 시각 이전(같은 분 포함)이면 성공 */
export const onTime = (time: string, deadline: string) => time <= deadline;

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export const dowName = (date: string) => DOW[new Date(date + 'T00:00:00Z').getUTCDay()];
/** 편지 제목: 오늘이면 "오늘 제때 도착!", 지난날이면 "지난 ○요일 제때 도착!" */
export function letterTitle(date: string, today: string): string {
  return date === today ? '오늘 학교에 제때 도착!' : `지난 ${dowName(date)}요일 제때 도착!`;
}
/** 며칠 전 기록까지 받을지 (너무 오래된 체크는 거절) */
export const ARRIVAL_MAX_DAYS_AGO = 14;
