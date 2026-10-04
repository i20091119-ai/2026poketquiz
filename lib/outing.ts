// 나들이 체험보고서 이벤트 (2026-10-04 부모님 요청).
// 보호자가 나들이를 다녀온 뒤 이벤트를 열면, 아이가 7단계 안내를 따라 체험보고서를 쓰고,
// 부모님이 확인하면 마스터볼 3개(전설 후보) 중 하나를 고릅니다. 상태 변경은 lib/game-engine.ts, 이 파일은 규칙과 계산만.
import type { GiftSender } from './game-config.ts';

/** 처음 값 (보호자 공간 전체 설정 "나들이 체험보고서"에서 바꾸면 settings.outing_rules). 도전할래!를 누를 때 그 이벤트에 고정됩니다. */
export const OUTING_DEFAULT = {
  /** 직접 쓰는 칸의 최소 글자 수 (띄어쓰기 빼고) */
  minChars: 10,
  /** 기한을 넘겼을 때 이 단계 이상 저장했으면 랜덤상자 1개 */
  attemptStage: 3,
  /** 고치기 요청 최대 횟수 */
  revisionMax: 1,
  /** 마스터볼 보상에 이로치 확률(마스터볼 12%) 적용 */
  shiny: true,
  /** 기한: 도전할래!를 누른 날을 1일째로 며칠째 밤 12시까지 */
  days: 7,
};
export type OutingRules = typeof OUTING_DEFAULT;
export const OUTING_FIELDS: { key: Exclude<keyof OutingRules, 'shiny'>; label: string; min: number; max: number }[] = [
  { key: 'minChars', label: '직접 쓰는 칸 최소 글자 수', min: 1, max: 100 },
  { key: 'attemptStage', label: '기한을 넘겼을 때 랜덤상자를 주는 단계(이상)', min: 1, max: 7 },
  { key: 'revisionMax', label: '고치기 요청 최대 횟수', min: 0, max: 3 },
  { key: 'days', label: '기한(일)', min: 1, max: 30 },
];
export function cleanOutingRules(ov?: Partial<Record<string, unknown>> | null): Partial<OutingRules> {
  const out: Partial<OutingRules> = {};
  for (const f of OUTING_FIELDS) {
    const v = ov?.[f.key];
    if (Number.isInteger(v) && (v as number) >= f.min && (v as number) <= f.max) out[f.key] = v as number;
  }
  if (typeof ov?.shiny === 'boolean') out.shiny = ov.shiny;
  return out;
}
/** 기본 전설 후보: 라이코·앤테이·스이쿤 */
export const OUTING_CANDIDATES = [243, 244, 245];
export const OUTING_PHOTO_MAX = 5;
export const OUTING_SIGHTS_MAX = 12;
export const OUTING_TEXT_MAX = 300;

/** 보고서 내용 (단계마다 저장). 모두 없으면 빈 값으로 시작 */
export type OutingReport = {
  // 1단계 첫머리
  when?: string; who?: string; where?: string; weather?: string; first?: string;
  // 2단계 순서 (고른 일 3개, 순서대로)
  did?: string[]; order?: string;
  // 3단계 자세히
  sight?: string; look?: string; sound?: string; doing?: string; detail?: string;
  // 4단계 새로 안 것
  learned?: string;
  // 5단계 느낌과 이유
  feeling?: string; because?: string;
  // 6단계 그림 (사진 표의 번호)
  picture?: { kind: 'drawing' | 'photo'; mediaId: string };
  // 7단계 다시 읽고 고치기
  checks?: { missing?: boolean; period?: boolean; read?: boolean };
};
export type OutingStatus =
  | 'open' // 열렸지만 아직 도전할래! 전
  | 'writing' // 쓰는 중 (기한 안)
  | 'submitted' // 부모님이 읽는 중
  | 'revise' // 부모님이 고쳐 볼 곳을 돌려보냄
  | 'approved' // 승인, 마스터볼 고르기 전
  | 'rewarded' // 마스터볼을 골랐음 (끝)
  | 'late' // 기한을 넘김 (보고서는 마저 쓸 수 있음, 보상 없음)
  | 'lateDone'; // 기한을 넘긴 뒤 마저 써서 완성

export type Outing = {
  id: string;
  createdAt: string; from: GiftSender; place: string; date: string; letter: string;
  sights: string[]; photoIds: string[]; candidates: number[];
  /** 도전할래!를 누를 때 고정되는 규칙 (그전에는 없음) */
  rules?: OutingRules;
  status: OutingStatus;
  /** 소개 팝업을 본 기기 (기기마다 한 번) */
  seenDevices?: string[];
  acceptedAt?: string; acceptedDate?: string;
  /** 마지막 날 (한국 날짜, 이날 밤 12시까지) */
  deadline?: string;
  report: OutingReport;
  /** 마친 단계 (0~7) */
  stage: number;
  /** 처음 제출한 시각, 기한 안에 냈는지 */
  submittedAt?: string; onTime?: boolean;
  revisions: { by: GiftSender; at: string; note: string; fixedAt?: string }[];
  approval?: { by: GiftSender; at: string; praise: string; sticker: string };
  /** 승인 때 정한 마스터볼 3개 내용 (아이가 고르기 전에는 화면에 숨김) */
  reward?: { balls: { species: number; shiny: boolean }[]; picked?: number; pickedAt?: string; duplicate?: boolean };
  /** 기한을 넘겼을 때: 그때 단계, 받은 상자 내용, 안내를 봤는지 */
  late?: { date: string; stage: number; box?: string | null; seen?: boolean };
  /** 보고서를 다 쓴 날 (모음에 완성으로) */
  completedAt?: string;
};

/** 띄어쓰기를 뺀 글자 수 */
export const charCount = (s?: string) => (s ?? '').replace(/\s/g, '').length;
/** 문장 수 (마침표·느낌표·물음표 기준) */
export const sentenceCount = (s?: string) => ((s ?? '').match(/[^.!?。]+[.!?。]/g) ?? []).length;

const dayNo = (date: string) => Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);
export const addDays = (date: string, n: number) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
/** 마감까지 남은 날 (오늘이 마지막 날이면 1) */
export const daysLeft = (o: Outing, today: string) => (o.deadline ? Math.max(0, dayNo(o.deadline) - dayNo(today) + 1) : 0);

export const STEP_TITLES = ['첫머리', '순서', '자세히 쓰기', '새로 안 것', '느낌과 이유', '그림', '다시 읽고 고치기'] as const;
export const FEELINGS = ['신기했다', '놀라웠다', '즐거웠다', '뿌듯했다', '궁금했다', '행복했다', '아쉬웠다', '무서웠다'];
export const WEATHERS = ['☀️ 맑음', '⛅ 구름 조금', '☁️ 흐림', '🌧️ 비', '❄️ 눈'];
export const WHO_OPTIONS = ['엄마와', '아빠와', '엄마, 아빠와', '가족과', '친구와'];
export const ACTIVITY_OPTIONS = ['도착하기', '밥 먹기', '사진 찍기', '놀이하기', '기념품 사기', '집에 오기'];

/** 1단계: 고른 버튼으로 문장 조립 (예: 10월 5일 토요일에 엄마, 아빠와 동물원에 갔다.) */
export const firstSentence = (r: OutingReport) =>
  r.when && r.who && r.where ? `${r.when}${/(어제|오늘|그저께)$/.test(r.when) ? '' : '에'} ${r.who} ${r.where}에 갔다.` : '';
/** 날짜 'YYYY-MM-DD' → '10월 5일 토요일' */
export function dateLabel(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${'일월화수목금토'[d.getUTCDay()]}요일`;
}
/** 5단계 문단: 참 신기했다. 왜냐하면 … */
export const feelingParagraph = (r: OutingReport) => (r.feeling ? `참 ${r.feeling}. 왜냐하면 ${(r.because ?? '').trim()}` : '');
/** 보고서 글 (문단 순서대로) */
export const reportParagraphs = (r: OutingReport) =>
  [r.first, r.order, r.detail, r.learned, r.feeling ? feelingParagraph(r) : ''].map(s => (s ?? '').trim()).filter(Boolean);

/** 이 단계를 마칠 수 있는지 (못 마치면 아이에게 보여 줄 말) */
export function stepProblem(step: number, r: OutingReport, rules: Pick<OutingRules, 'minChars'>): string | null {
  const min = rules.minChars;
  const short = (s: string | undefined, what: string) => (charCount(s) < min ? `${what}을(를) ${min}글자 넘게 써 보자! (지금 ${charCount(s)}글자)` : null);
  switch (step) {
    case 1:
      if (!r.when || !r.who || !r.where) return '언제, 누구와, 어디서를 모두 골라 줘!';
      if (!r.weather) return '그날 날씨도 골라 줘!';
      return charCount(r.first) < Math.min(min, charCount(firstSentence(r))) ? '위 문장을 보고 따라 써 보자!' : null;
    case 2:
      if ((r.did ?? []).length !== 3) return '한 일을 3개 골라 줘!';
      return short(r.order, '순서 글');
    case 3:
      if (!r.sight) return '자세히 쓸 것을 하나 골라 줘!';
      if (charCount(r.look) < 1 || charCount(r.sound) < 1 || charCount(r.doing) < 1) return '생김새, 소리, 하던 일을 모두 답해 줘!';
      if (sentenceCount(r.detail) < 2) return '두 문장 이상 써 보자! 문장 끝에 마침표(.)를 찍어 줘.';
      return short(r.detail, '자세한 글');
    case 4:
      return short(r.learned, '새로 안 것');
    case 5:
      if (!r.feeling) return '마음을 나타내는 말을 하나 골라 줘!';
      return short(r.because, '왜냐하면 뒤의 글');
    case 6:
      return r.picture?.mediaId ? null : '그림을 그리거나 사진을 골라 줘!';
    case 7: {
      const c = r.checks ?? {};
      return c.missing && c.period && c.read ? null : '세 가지를 모두 확인하고 눌러 줘!';
    }
    default:
      return '단계를 다시 골라 줘.';
  }
}

/** 단계별로 저장할 수 있는 칸 (그 밖의 칸은 무시) */
export const STEP_KEYS: Record<number, (keyof OutingReport)[]> = {
  1: ['when', 'who', 'where', 'weather', 'first'],
  2: ['did', 'order'],
  3: ['sight', 'look', 'sound', 'doing', 'detail'],
  4: ['learned'],
  5: ['feeling', 'because'],
  6: ['picture'],
  7: ['checks'],
};
const cut = (s: unknown, n = OUTING_TEXT_MAX) => (typeof s === 'string' ? s.slice(0, n) : undefined);
/** 아이가 보낸 단계 내용을 정리 (모양이 틀린 값은 버림) */
export function cleanStep(step: number, data: Record<string, unknown>): Partial<OutingReport> {
  const out: Partial<OutingReport> = {};
  for (const key of STEP_KEYS[step] ?? []) {
    const v = data?.[key];
    if (v === undefined) continue;
    if (key === 'did') { if (Array.isArray(v)) out.did = v.filter((x): x is string => typeof x === 'string').slice(0, 3).map(x => x.slice(0, 40)); continue; }
    if (key === 'picture') {
      const p = v as { kind?: unknown; mediaId?: unknown };
      if (p && (p.kind === 'drawing' || p.kind === 'photo') && typeof p.mediaId === 'string' && /^[a-z0-9-]{8,64}$/.test(p.mediaId)) out.picture = { kind: p.kind, mediaId: p.mediaId };
      continue;
    }
    if (key === 'checks') { const c = v as Record<string, unknown>; out.checks = { missing: c?.missing === true, period: c?.period === true, read: c?.read === true }; continue; }
    (out as Record<string, unknown>)[key] = cut(v, ['when', 'who', 'where', 'weather', 'sight', 'feeling'].includes(key) ? 40 : OUTING_TEXT_MAX);
  }
  return out;
}

/** 보고서 모음·보호자 화면용 한 장 (그림일기) */
export const outingPage = (o: Outing) => ({
  id: o.id, place: o.place, date: o.date, weather: o.report.weather ?? '', title: `${o.place} 체험보고서`,
  paragraphs: reportParagraphs(o.report), picture: o.report.picture ?? null,
  complete: o.status === 'approved' || o.status === 'rewarded' || o.status === 'lateDone' || o.status === 'submitted',
});
