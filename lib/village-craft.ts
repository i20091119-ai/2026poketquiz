// 포켓몬 마을 열매나무·제작대·볼 만들기 (2026-11-14 부모님 결정, 설계 문서 「포켓몬 마을」 > 「열매·제작대」).
// 목적: 열매에 매일 쓸 곳과 긴 목표를 주고, 볼 만들기에는 공부 재료(철 = 트레이너 훈련, 반짝돌 = 복습)가 꼭 필요하게.
// 원작 근거: 레전드 아르세우스 제작대(열매 + 옥돌 → 몬스터볼).
// - 열매는 종류마다 보유 상한 growth().berryCap(기본 99). 레시피의 열매는 "한 종류만"(아이가 고른 종류) 셈 (부모님 선택).
// - 열매나무: 그루당 하루 1개(나무마다 열매 종류 하나), 처음 1그루(파트너 계열 열매), 묘목으로 최대 treeMax그루.
// - 돌 = 마을 재료 "돌멩이"(부모님 선택), 바위 채집 하루 stoneDaily개. 철·반짝돌은 공부로만(산책·손님·상자에서는 절대 안 나옴).
// - 제작 볼은 일반 볼과 따로 보관, 열면 아직 도감에 없는 포켓몬만(전설·환상 제외). 마스터볼·전설 조각은 만들 수 없음.
// 숫자는 모두 보호자 전체 설정에서 바꿈 (settings.village_craft_rules, 바꾼 것만). 상태 변경은 lib/game-engine.ts.
import { POTIONS, SUBJECT_BERRY, SUBJECT_TYPES, SUBJECTS, type PotionKind, type Subject, type TypeKey } from './game-config.ts';
import { isOpenCell } from './village-level.ts';

/** 열매 6종 (상처약 제외) */
export const BERRY_KINDS: readonly PotionKind[] = (Object.keys(POTIONS) as PotionKind[]).filter(k => k !== 'potion');
/** 이 속성의 열매 (속성이 들어 있는 과목의 열매) */
export function berryOfType(type: TypeKey): PotionKind {
  const subject = SUBJECTS.find(s => (SUBJECT_TYPES[s] as readonly TypeKey[]).includes(type)) as Subject | undefined;
  return subject ? SUBJECT_BERRY[subject] : 'apple';
}

/** 레시피 4가지 */
export const RECIPES = ['poke', 'great', 'ultra', 'sapling'] as const;
export type RecipeKey = typeof RECIPES[number];
export const RECIPE_INFO: Record<RecipeKey, { name: string; emoji: string; tier?: number; shiny?: boolean; note: string }> = {
  poke: { name: '몬스터볼', emoji: '🔴', tier: 0, note: '보통 포켓몬이 나와요' },
  great: { name: '슈퍼볼', emoji: '🔵', tier: 1, note: '조금 드문 포켓몬이 나와요' },
  ultra: { name: '하이퍼볼', emoji: '🟡', tier: 2, shiny: true, note: '드문 포켓몬이 나와요. 가끔 이로치도!' },
  sapling: { name: '열매나무 묘목', emoji: '🌱', note: '마을에 심으면 열매나무가 돼요' },
};
/** 공부로만 얻는 재료 */
export const STUDY_MATS = ['iron', 'sparkle'] as const;
export type StudyMat = typeof STUDY_MATS[number];
export const STUDY_MAT_INFO: Record<StudyMat, { name: string; how: string }> = {
  iron: { name: '철', how: '트레이너 훈련을 열심히 한 주에 우편함으로 와요' },
  sparkle: { name: '반짝돌', how: '이틀 뒤 복습 문제를 처음에 맞히면 받아요' },
};
/** 레시피 재료: 열매(한 종류)·돌멩이·철·반짝돌 */
export type RecipeCost = { berry: number; stone: number; iron: number; sparkle: number };

export const CRAFT_DEFAULT = {
  /** 열매나무 최대 그루 수 (처음 1그루 포함) */
  treeMax: 3,
  /** 바위 채집: 하루 돌멩이 수 */
  stoneDaily: 5,
  /** 손님에게 말 걸면 열매 선물 확률(%), 손님마다 하루 1번 */
  guestChance: 33,
  /** 철: 훈련 주 합계가 ironHighAt 이상이면 ironHigh개, ironLowAt 이상이면 ironLow개 */
  ironHighAt: 5, ironHigh: 2, ironLowAt: 3, ironLow: 1,
  /** 반짝돌: 이틀 뒤 복습 문제를 처음에 맞히면 */
  sparkle: 1,
  pokeBerry: 10, pokeStone: 3,
  greatBerry: 30, greatStone: 5, greatIron: 2,
  ultraBerry: 99, ultraSparkle: 1,
  saplingBerry: 5, saplingStone: 2,
  /** 마을 레벨 (2026-11-14, lib/village-level.ts): 다음 레벨까지 필요한 별 (레벨2는 약 일주일, 그 뒤 2~3주씩) */
  levelNeed2: 50, levelNeed3: 120, levelNeed4: 200, levelNeed5: 300, levelNeed6: 400,
  /** 별 받는 일: 새 손님 만남 · 서식지에 손님이 온 날(서식지마다, 들어갔을 때 하루 한 번) · 서식지·꾸미기 물건 만들기 · 볼·묘목 만들기 · 열매 따기 */
  starGuest: 3, starHabitat: 2, starMake: 1, starBall: 2, starHarvest: 1,
};
export type CraftRules = typeof CRAFT_DEFAULT;
type Field = { key: keyof CraftRules; label: string; min: number; max: number; group: string };
export const CRAFT_FIELDS: Field[] = [
  { key: 'treeMax', label: '처음 마을 열매나무 최대 그루 (넓어진 구역마다 +1)', min: 1, max: 3, group: '열매나무·채집·손님' },
  { key: 'stoneDaily', label: '바위 채집 하루 돌멩이', min: 0, max: 30, group: '열매나무·채집·손님' },
  { key: 'guestChance', label: '손님 열매 선물 확률(%)', min: 0, max: 100, group: '열매나무·채집·손님' },
  { key: 'ironHighAt', label: '철 많이: 주 합계 이상', min: 1, max: 7, group: '철·반짝돌 (공부로만)' },
  { key: 'ironHigh', label: '철 많이: 개수', min: 0, max: 10, group: '철·반짝돌 (공부로만)' },
  { key: 'ironLowAt', label: '철 조금: 주 합계 이상', min: 1, max: 7, group: '철·반짝돌 (공부로만)' },
  { key: 'ironLow', label: '철 조금: 개수', min: 0, max: 10, group: '철·반짝돌 (공부로만)' },
  { key: 'sparkle', label: '복습 첫 정답 반짝돌', min: 0, max: 5, group: '철·반짝돌 (공부로만)' },
  { key: 'pokeBerry', label: '몬스터볼: 열매', min: 1, max: 999, group: '레시피' },
  { key: 'pokeStone', label: '몬스터볼: 돌멩이', min: 0, max: 20, group: '레시피' },
  { key: 'greatBerry', label: '슈퍼볼: 열매', min: 1, max: 999, group: '레시피' },
  { key: 'greatStone', label: '슈퍼볼: 돌멩이', min: 0, max: 20, group: '레시피' },
  { key: 'greatIron', label: '슈퍼볼: 철', min: 0, max: 20, group: '레시피' },
  { key: 'ultraBerry', label: '하이퍼볼: 열매', min: 1, max: 999, group: '레시피' },
  { key: 'ultraSparkle', label: '하이퍼볼: 반짝돌', min: 0, max: 20, group: '레시피' },
  { key: 'saplingBerry', label: '묘목: 열매', min: 1, max: 999, group: '레시피' },
  { key: 'saplingStone', label: '묘목: 돌멩이', min: 0, max: 20, group: '레시피' },
  { key: 'levelNeed2', label: '레벨 2까지 별', min: 1, max: 999, group: '🏡 마을 레벨 (넓어지는 땅)' },
  { key: 'levelNeed3', label: '레벨 3까지 별 (레벨 2에서 더)', min: 1, max: 999, group: '🏡 마을 레벨 (넓어지는 땅)' },
  { key: 'levelNeed4', label: '레벨 4까지 별 (레벨 3에서 더)', min: 1, max: 999, group: '🏡 마을 레벨 (넓어지는 땅)' },
  { key: 'levelNeed5', label: '레벨 5까지 별 (레벨 4에서 더)', min: 1, max: 999, group: '🏡 마을 레벨 (넓어지는 땅)' },
  { key: 'levelNeed6', label: '레벨 6까지 별 (레벨 5에서 더)', min: 1, max: 999, group: '🏡 마을 레벨 (넓어지는 땅)' },
  { key: 'starGuest', label: '별: 새 손님 만남', min: 0, max: 20, group: '🏡 마을 레벨 (넓어지는 땅)' },
  { key: 'starHabitat', label: '별: 서식지에 손님 온 날', min: 0, max: 20, group: '🏡 마을 레벨 (넓어지는 땅)' },
  { key: 'starMake', label: '별: 서식지·꾸미기 물건 만들기', min: 0, max: 20, group: '🏡 마을 레벨 (넓어지는 땅)' },
  { key: 'starBall', label: '별: 볼·묘목 만들기', min: 0, max: 20, group: '🏡 마을 레벨 (넓어지는 땅)' },
  { key: 'starHarvest', label: '별: 열매 따기', min: 0, max: 20, group: '🏡 마을 레벨 (넓어지는 땅)' },
];
export function cleanCraftRules(ov: unknown): Partial<CraftRules> {
  const out: Partial<CraftRules> = {};
  if (!ov || typeof ov !== 'object') return out;
  for (const f of CRAFT_FIELDS) {
    const v = (ov as Record<string, unknown>)[f.key];
    if (typeof v === 'number' && Number.isInteger(v) && v >= f.min && v <= f.max) out[f.key] = v;
  }
  return out;
}
let current: CraftRules = { ...CRAFT_DEFAULT };
/** 서버는 요청마다, 화면은 응답의 village.craft.rules로 맞춤 */
export function setCraftRules(ov?: Partial<CraftRules> | null) { current = { ...CRAFT_DEFAULT, ...cleanCraftRules(ov) }; }
export const craftRules = (): CraftRules => current;

export function recipeCost(key: RecipeKey, r: CraftRules = current): RecipeCost {
  switch (key) {
    case 'poke': return { berry: r.pokeBerry, stone: r.pokeStone, iron: 0, sparkle: 0 };
    case 'great': return { berry: r.greatBerry, stone: r.greatStone, iron: r.greatIron, sparkle: 0 };
    case 'ultra': return { berry: r.ultraBerry, stone: 0, iron: 0, sparkle: r.ultraSparkle };
    case 'sapling': return { berry: r.saplingBerry, stone: r.saplingStone, iron: 0, sparkle: 0 };
  }
}
/** 레벨마다 더 필요한 별 [2, 3, 4, 5, 6] */
export const levelNeeds = (r: CraftRules = current) => [r.levelNeed2, r.levelNeed3, r.levelNeed4, r.levelNeed5, r.levelNeed6];
/** 지금 레벨에서 나무를 심을 수 있는 자리 (처음 마을 3곳 중 treeMax까지 + 열린 구역마다 1곳) */
export function treeSpotsOpen(level: number, r: CraftRules = current): number[] {
  return TREE_SPOTS.map((_, i) => i).filter(i => (i < 3 ? i < r.treeMax : isOpenCell(TREE_SPOTS[i].x, TREE_SPOTS[i].y, level)));
}
/** 이번 주 훈련 합계로 받는 철 개수 */
export function ironForWeek(score: number, r: CraftRules = current): number {
  if (score >= r.ironHighAt) return r.ironHigh;
  if (score >= r.ironLowAt) return r.ironLow;
  return 0;
}

// ---------- 지도 자리 (lib/village-map.ts 지도 기준, 테스트가 빈자리인지 검사) ----------
/** 열매나무 자리 3곳 (그림 왼쪽 위 칸, 2×3, 아래 2줄이 막힘). 첫 자리는 처음부터 있는 나무 */
export const TREE_SPOTS: { x: number; y: number }[] = [{ x: 0, y: 2 }, { x: 7, y: 4 }, { x: 8, y: 15 },
  // 넓어진 구역마다 1곳 (레벨 2·3·4·5, 열리면 나무 최대 수 +1)
  { x: 17, y: 11 }, { x: -8, y: 4 }, { x: 8, y: 24 }, { x: 17, y: 20 }];
/** 제작대 (그림 왼쪽 위 칸, 3×2) · 우편함 (1×2) */
export const WORKBENCH = { x: 0, y: 13 };
export const MAILBOX = { x: 3, y: 3 };
/** 돌멩이를 캘 수 있는 바위 (지도 꾸밈 바위 자리) */
export const GATHER_ROCKS: { x: number; y: number }[] = [{ x: 11, y: 13 }, { x: 0, y: 7 }, { x: 11, y: 4 },
  // 넓어진 구역 (열린 구역 바위만 캘 수 있음, 하루 돌멩이 수는 그대로)
  { x: 13, y: 15 }, { x: -2, y: 13 }, { x: 3, y: 28 }, { x: 19, y: 22 }, { x: -6, y: 26 }, { x: -2, y: 25 }];
