import { SUBJECTS, type Subject } from './game-config.ts';

/**
 * 기간 한정 이벤트 (주말 깜짝 이벤트 등). 다음 이벤트도 여기에 한 칸 더 적으면 됩니다.
 * - 날짜는 한국 시간. start 날 00:00 ~ end 날 23:59 동안 열리고, 그 전에는 아이 화면 어디에도 안 보입니다(깜짝).
 * - 보상·확률은 아래 칸에서 바꿉니다. 지금 있는 종류(kind)는 'rainbow' 하나:
 *   과목마다 탐험에서 goal.streak 문제를 연속으로 맞히면 그 과목 조각 1개. 틀리면 그 과목 연속 수는 0부터.
 *   조각을 모두 모으면 가진 포켓몬 하나를 골라 이로치로 바꿈. 끝났을 때 partial.minPieces 개 이상이면 사탕.
 *   기간 동안 모든 볼의 이로치 확률 × shinyMultiplier.
 */
export type LimitedEventDef = {
  /** 기록에 쓰는 이름 (바꾸지 마세요: 아이 기록이 이 이름으로 저장됨) */
  id: string;
  kind: 'rainbow';
  title: string;
  /** 시작 날, 끝 날 (한국 시간, 둘 다 포함) */
  start: string;
  end: string;
  goal: { streak: number; subjects: readonly Subject[] };
  reward: {
    /** 조각을 다 모으면: 가진 포켓몬 하나를 이로치로 */
    full: 'shinyChange';
    /** 끝났을 때 조각이 minPieces 개 이상이면 파트너에게 포켓로그 사탕 candy 개 */
    partial: { minPieces: number; candy: number };
  };
  /** 기간 동안 볼 이로치 확률 배수 (최대 100%) */
  shinyMultiplier: number;
  /** 마지막 날 이 시각 이후 아직 못 모았으면 "오늘 밤 12시면 끝나!" 안내 ('HH:MM') */
  reminderAt: string;
};

export const LIMITED_EVENTS: readonly LimitedEventDef[] = [
  {
    id: 'rainbow-2026-10-03',
    kind: 'rainbow',
    title: '레인보우 컬러체인지!',
    start: '2026-10-03',
    end: '2026-10-04',
    goal: { streak: 10, subjects: SUBJECTS },
    reward: { full: 'shinyChange', partial: { minPieces: 3, candy: 3 } },
    shinyMultiplier: 5,
    reminderAt: '21:00',
  },
];

/** 과목별 조각 색 (이름·하트 이모지). 색 자체는 SUBJECT_INFO 색을 씀 */
export const PIECE_INFO: Record<Subject, { color: string; heart: string }> = {
  국어: { color: '분홍', heart: '🩷' },
  수학: { color: '노랑', heart: '💛' },
  영어: { color: '파랑', heart: '💙' },
  한자: { color: '주황', heart: '🧡' },
  역사: { color: '보라', heart: '💜' },
  상식: { color: '초록', heart: '💚' },
};

export type LimitedPhase = 'before' | 'active' | 'ended';
export const limitedPhase = (def: LimitedEventDef, today: string): LimitedPhase =>
  today < def.start ? 'before' : today > def.end ? 'ended' : 'active';
export const limitedById = (id: string) => LIMITED_EVENTS.find(e => e.id === id);
/** 오늘 열려 있는 기간 한정 이벤트들 */
export const activeLimited = (today: string) => LIMITED_EVENTS.filter(e => limitedPhase(e, today) === 'active');
/** 오늘 볼 이로치 확률 배수 (열린 이벤트 중 가장 큰 값, 없으면 1) */
export const limitedShinyMultiplier = (today: string) => activeLimited(today).reduce((m, e) => Math.max(m, e.shinyMultiplier), 1);

const dayNo = (date: string) => Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);
/** 끝날 때까지 남은 분 (오늘 날짜와 지금 시각(분) 기준). 끝났으면 0 */
export function minutesLeft(def: LimitedEventDef, today: string, minutes: number): number {
  return Math.max(0, (dayNo(def.end) - dayNo(today)) * 1440 + (1440 - minutes));
}
/** "1일 5시간", "5시간 20분", "20분" */
export function leftLabel(mins: number): string {
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  if (d > 0) return `${d}일 ${h}시간`;
  if (h > 0) return `${h}시간 ${m}분`;
  return `${Math.max(1, m)}분`;
}
export const hmToMinutes = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
