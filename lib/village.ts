// 포켓몬 마을 1단계(시험판, 2026-11-13 부모님 요청).
// 퀴즈가 먼저, 마을은 보상: 그날 일일미션을 끝내면 열리고, 재료를 모아 서식지를 만들면 다음 날부터 손님 포켓몬이 찾아옵니다.
// 재료는 볼·열매·전설 조각 등 다른 보상으로 절대 바뀌지 않아요. 손님은 "만남"(state.met)일 뿐 획득이 아니에요.
// 상태 변경은 lib/game-engine.ts, 이 파일은 규칙과 계산만.
import { SPECIES } from './pokedex.ts';
import type { TypeKey } from './game-config.ts';

/** 재료 4종 */
/** 재료 6종 (돌멩이·진흙은 2026-11-14 땅 바꾸기와 함께) */
export const MATERIALS = ['leaf', 'drop', 'petal', 'twig', 'stone', 'mud'] as const;
export type MaterialKey = typeof MATERIALS[number];
export const MATERIAL_INFO: Record<MaterialKey, { name: string; emoji: string }> = {
  leaf: { name: '풀잎', emoji: '🌿' },
  drop: { name: '물방울', emoji: '💧' },
  petal: { name: '꽃잎', emoji: '🌸' },
  twig: { name: '나뭇가지', emoji: '🪵' },
  stone: { name: '돌멩이', emoji: '🪨' },
  mud: { name: '진흙', emoji: '🟫' },
};

/** 만들 수 있는 물건 (처음부터 모두 열림). 나뭇가지는 지금은 모으기만 */
export const CRAFTS = ['bush', 'puddle', 'flowers'] as const;
export type CraftKey = typeof CRAFTS[number];
export const CRAFT_INFO: Record<CraftKey, { name: string; emoji: string; cost: Partial<Record<MaterialKey, number>> }> = {
  bush: { name: '풀숲', emoji: '🌳', cost: { leaf: 2 } },
  puddle: { name: '물웅덩이', emoji: '🫧', cost: { drop: 2 } },
  flowers: { name: '꽃밭', emoji: '🌼', cost: { petal: 2 } },
};

/** 서식지: 2×2 밭 하나에 놓인 물건 4개로 정해짐 (붙어 있는 4칸) */
export const HABITATS = ['green', 'shore', 'garden'] as const;
export type HabitatKey = typeof HABITATS[number];
export const HABITAT_INFO: Record<HabitatKey, { name: string; emoji: string; need: Partial<Record<CraftKey, number>>; types: TypeKey[]; typeText: string }> = {
  green: { name: '초록 풀숲', emoji: '🌳', need: { bush: 4 }, types: ['grass'], typeText: '풀 타입' },
  shore: { name: '물가', emoji: '🏞️', need: { bush: 2, puddle: 2 }, types: ['water'], typeText: '물 타입' },
  garden: { name: '꽃밭', emoji: '🌼', need: { flowers: 4 }, types: ['bug', 'fairy'], typeText: '벌레·페어리 타입' },
};

// ---------- 지도 ----------
/** 마을 크기 (타일 16×16 기준 칸 수) */
export const MAP_W = 12;
export const MAP_H = 20;
/** 서식지를 만드는 밭 3개 (왼쪽 위 칸, 2×2). 칸 번호 = 밭 번호 × 4 + (0 왼위, 1 오위, 2 왼아래, 3 오아래) */
export const PLOTS: { x: number; y: number }[] = [{ x: 1, y: 5 }, { x: 9, y: 5 }, { x: 8, y: 13 }];
export const CELL_COUNT = PLOTS.length * 4;
export const cellPos = (cell: number) => {
  const p = PLOTS[Math.floor(cell / 4)];
  const i = cell % 4;
  return { x: p.x + (i % 2), y: p.y + Math.floor(i / 2) };
};
// 집·나무·길·연못 같은 지도 모습은 lib/village-map.ts (칸 단위 기록: 칸마다 땅 + 그 위 물건)
/** 땅에 떨어진 재료가 나올 수 있는 자리 (날마다 그중 몇 곳) */
export const PICK_SPOTS: { x: number; y: number }[] = [
  { x: 3, y: 2 }, { x: 9, y: 3 }, { x: 3, y: 6 }, { x: 8, y: 10 }, { x: 4, y: 12 },
  { x: 2, y: 10 }, { x: 7, y: 16 }, { x: 10, y: 15 }, { x: 4, y: 19 }, { x: 8, y: 18 },
];
/** 집 문 앞: 처음 서는 자리 */
export const START_POS = { x: 5, y: 4 };
// ---------- 규칙 숫자 (보호자 공간 전체 설정 "포켓몬 마을 규칙"에서 바꾸면 settings.village_rules에 바꾼 것만) ----------
export type VillageTimeMode = 'off' | 'daily' | 'perQuiz';
export const VILLAGE_DEFAULT = {
  /** 퀴즈 정답(첫 시도) 하나에 재료 1개가 나올 확률(%) */
  quizChance: 30,
  /** 일일미션을 끝내면 확정으로 받는 재료 수 */
  missionMats: 2,
  /** 복습 모드 정답(첫 시도) 하나에 재료 확률(%) */
  reviewChance: 15,
  /** 복습 모드를 끝내면 받는 재료 수 */
  reviewMissionMats: 1,
  /** 마을에서 하루에 주울 수 있는 재료 수 */
  pickPerDay: 3,
  /** 재료 종류마다 가질 수 있는 최대 수 */
  matCap: 20,
  /** 마을 시간 제한: off 없음(기본) / daily 하루 ○분 / perQuiz 퀴즈 ○문제당 ○분 */
  timeMode: 'off' as VillageTimeMode,
  dailyMinutes: 30,
  perQuestions: 6,
  perMinutes: 10,
};
export type VillageRules = typeof VILLAGE_DEFAULT;
export const VILLAGE_FIELDS: { key: Exclude<keyof VillageRules, 'timeMode'>; label: string; min: number; max: number }[] = [
  { key: 'quizChance', label: '정답 하나에 재료 확률(%)', min: 0, max: 100 },
  { key: 'missionMats', label: '일일미션 끝내면 재료', min: 0, max: 10 },
  { key: 'reviewChance', label: '복습 모드 정답 재료 확률(%)', min: 0, max: 100 },
  { key: 'reviewMissionMats', label: '복습 모드 끝내면 재료', min: 0, max: 10 },
  { key: 'pickPerDay', label: '마을에서 하루 줍기', min: 0, max: PICK_SPOTS.length },
  { key: 'matCap', label: '재료 종류별 최대', min: 5, max: 99 },
  { key: 'dailyMinutes', label: '하루 마을 시간(분)', min: 5, max: 240 },
  { key: 'perQuestions', label: '퀴즈 몇 문제마다', min: 1, max: 50 },
  { key: 'perMinutes', label: '마을 몇 분', min: 1, max: 120 },
];
export function cleanVillageRules(ov?: Partial<Record<string, unknown>> | null): Partial<VillageRules> {
  const out: Partial<VillageRules> = {};
  if (!ov || typeof ov !== 'object') return out;
  for (const f of VILLAGE_FIELDS) {
    const v = ov[f.key];
    if (typeof v === 'number' && Number.isInteger(v) && v >= f.min && v <= f.max) (out as Record<string, number>)[f.key] = v;
  }
  if (ov.timeMode === 'off' || ov.timeMode === 'daily' || ov.timeMode === 'perQuiz') out.timeMode = ov.timeMode;
  return out;
}
let current: VillageRules = { ...VILLAGE_DEFAULT };
/** 서버는 요청마다, 화면은 응답의 village.rules로 맞춤 */
export function setVillageRules(ov?: Partial<VillageRules> | null) { current = { ...VILLAGE_DEFAULT, ...cleanVillageRules(ov as Record<string, unknown>) }; }
export const villageRules = (): VillageRules => current;

/** 오늘 마을에 있을 수 있는 분 (null = 제한 없음). answered = 오늘 푼 문제 수 */
export function villageMinutesAllowed(rules: VillageRules, answered: number): number | null {
  if (rules.timeMode === 'daily') return rules.dailyMinutes;
  if (rules.timeMode === 'perQuiz') return Math.floor(answered / rules.perQuestions) * rules.perMinutes;
  return null;
}

// ---------- 계산 ----------
/** 같은 씨앗이면 같은 수 (날짜별 줍기 자리·종류) */
export function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 오늘 땅에 떨어진 재료: 자리 번호와 종류 (하루 줍기 수만큼, 날짜로 정해짐) */
export function dayPickups(date: string, count: number): { spot: number; kind: MaterialKey }[] {
  const r = seeded('pick:' + date);
  const spots = PICK_SPOTS.map((_, i) => i);
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  return spots.slice(0, Math.max(0, count)).sort((a, b) => a - b).map(spot => ({ spot, kind: MATERIALS[Math.floor(r() * MATERIALS.length)] }));
}
/** 밭 하나(놓인 물건 4칸)가 어떤 서식지인지 (안 맞으면 null) */
export function habitatOf(cells: (CraftKey | null)[]): HabitatKey | null {
  if (cells.length !== 4 || cells.some(c => !c)) return null;
  const count: Partial<Record<CraftKey, number>> = {};
  for (const c of cells) count[c!] = (count[c!] ?? 0) + 1;
  return HABITATS.find(h => {
    const need = HABITAT_INFO[h].need;
    return CRAFTS.every(k => (count[k] ?? 0) === (need[k] ?? 0));
  }) ?? null;
}
/** 손님 후보: 그 서식지 타입이 있는 포켓몬 (전설·환상 제외) */
const guestPools = new Map<HabitatKey, number[]>();
export function guestPool(h: HabitatKey): number[] {
  let pool = guestPools.get(h);
  if (!pool) {
    const types = HABITAT_INFO[h].types;
    pool = SPECIES.filter(s => s.tier < 3 && s.types.some(t => types.includes(t))).map(s => s.id);
    guestPools.set(h, pool);
  }
  return pool;
}

/** 손님·주민이 누르면 하는 짧은 말 */
export const GUEST_LINES = ['여기 정말 좋다!', '놀러 왔어!', '오늘 문제 다 풀었구나! 대단해!', '이 풀숲 마음에 들어!', '또 올게!', '같이 산책할래?'];
export const RESIDENT_LINES = ['오늘도 공부 열심히 했지?', '마을이 점점 예뻐지고 있어!', '재료를 모으면 서식지를 만들 수 있어!', '손님이 오면 반갑게 맞아 주자!', '같이 걷자!'];
