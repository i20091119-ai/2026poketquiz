// 게임 규칙의 숫자는 모두 이 파일에서 조정합니다.

export const TYPE_KEYS = [
  'normal', 'flying', 'fairy',
  'electric', 'steel', 'psychic',
  'fighting', 'rock', 'dragon',
  'ghost', 'ground', 'dark',
  'grass', 'water', 'fire', 'bug', 'poison', 'ice',
] as const;
export type TypeKey = typeof TYPE_KEYS[number];

export const TYPE_INFO: Record<TypeKey, { label: string; color: string }> = {
  normal: { label: '노말', color: '#9fa19f' },
  flying: { label: '비행', color: '#81b9ef' },
  fairy: { label: '페어리', color: '#ef70ef' },
  electric: { label: '전기', color: '#fac000' },
  steel: { label: '강철', color: '#60a1b8' },
  psychic: { label: '에스퍼', color: '#ef4179' },
  fighting: { label: '격투', color: '#ff8000' },
  rock: { label: '바위', color: '#afa981' },
  dragon: { label: '드래곤', color: '#5060e1' },
  ghost: { label: '고스트', color: '#704170' },
  ground: { label: '땅', color: '#915121' },
  dark: { label: '악', color: '#624d4e' },
  grass: { label: '풀', color: '#3fa129' },
  water: { label: '물', color: '#2980ef' },
  fire: { label: '불꽃', color: '#e62829' },
  bug: { label: '벌레', color: '#91a119' },
  poison: { label: '독', color: '#9141cb' },
  ice: { label: '얼음', color: '#3dcef3' },
};

export const SUBJECTS = ['국어', '수학', '한자', '역사', '상식'] as const;
export type Subject = typeof SUBJECTS[number];

/** 과목별로 스탯이 오르는 속성. 문제마다 이 중 하나가 붙습니다. */
export const SUBJECT_TYPES: Record<Subject, TypeKey[]> = {
  국어: ['normal', 'flying', 'fairy'],
  수학: ['electric', 'steel', 'psychic'],
  한자: ['fighting', 'rock', 'dragon'],
  역사: ['ghost', 'ground', 'dark'],
  상식: ['grass', 'water', 'fire', 'bug', 'poison', 'ice'],
};

export const SUBJECT_INFO: Record<Subject, { description: string; color: string }> = {
  국어: { description: '낱말, 맞춤법, 읽기', color: '#e46b8a' },
  수학: { description: '수와 연산, 도형', color: '#e3a008' },
  한자: { description: '뜻과 소리', color: '#d9602c' },
  역사: { description: '옛날 사람들의 생활', color: '#7b5ea7' },
  상식: { description: '사회와 과학', color: '#2f9e6a' },
};

/** 부모 화면에서 고를 수 있는 학년 */
export const GRADES = ['초1', '초2', '초3', '초4', '초5', '초6'] as const;
export const DEFAULT_GRADE = '초1';

export const CHOICE_COUNT = 5;
export const STARTERS = [906, 909, 912]; // 나오하, 뜨아거, 꾸왁스

/** 정답 한 번에 오르는 값 */
export const REWARD_PER_ANSWER = { stat: 1, exp: 10 };

export const DAILY_PER_SUBJECT = 4;

/**
 * 진화 조건: 진화 후 포켓몬의 속성을 모읍니다. 진화하면 해당 스탯을 소모합니다.
 * dual = [첫째 속성, 둘째 속성], single = 속성이 하나일 때.
 */
export const EVOLUTION_COST: Record<number, { dual: [number, number]; single: number }> = {
  2: { dual: [10, 5], single: 15 },
  3: { dual: [25, 12], single: 35 },
};

// ---- 물약 ----
export const POTIONS = {
  potion: { label: '상처약', amount: 3 },
  super: { label: '좋은상처약', amount: 5 },
  hyper: { label: '고급상처약', amount: 10 },
} as const;
export type PotionKind = keyof typeof POTIONS;

// ---- 볼 ----
// 등급: 0 흔함, 1 조금 드묾, 2 희귀, 3 전설·환상
export const BALLS = {
  poke: { label: '몬스터볼', odds: [70, 25, 5, 0] },
  great: { label: '슈퍼볼', odds: [40, 45, 15, 0] },
  ultra: { label: '하이퍼볼', odds: [15, 45, 35, 5] },
  master: { label: '마스터볼', odds: [0, 20, 50, 30] },
  // 탐험 전 과목 마스터 보상: 50%가 희귀 또는 전설
  luxury: { label: '럭셔리볼', odds: [20, 30, 25, 25] },
} as const;
export type BallKind = keyof typeof BALLS;
export const TIER_LABELS = ['흔함', '조금 드묾', '희귀', '전설'];

/** 일일미션 랜덤상자 내용물 확률(가중치) */
export const DAILY_BOX_TABLE: { item: { kind: 'potion'; potion: PotionKind } | { kind: 'ball'; ball: BallKind }; weight: number }[] = [
  { item: { kind: 'potion', potion: 'potion' }, weight: 30 },
  { item: { kind: 'potion', potion: 'super' }, weight: 20 },
  { item: { kind: 'potion', potion: 'hyper' }, weight: 10 },
  { item: { kind: 'ball', ball: 'poke' }, weight: 20 },
  { item: { kind: 'ball', ball: 'great' }, weight: 12 },
  { item: { kind: 'ball', ball: 'ultra' }, weight: 6 },
  { item: { kind: 'ball', ball: 'master' }, weight: 2 },
];

/** 탐험에서 과목을 모두 풀었을 때 나오는 물약 확률(가중치). 오르는 속성은 그 과목의 속성 중 랜덤. */
export const EXPLORE_POTION_TABLE: { potion: PotionKind; weight: number }[] = [
  { potion: 'potion', weight: 50 },
  { potion: 'super', weight: 35 },
  { potion: 'hyper', weight: 15 },
];

/** 이미 가진 포켓몬이 또 나오면 그 포켓몬 첫째 속성 스탯으로 바꿔 줍니다. */
export const DUPLICATE_BONUS = 5;
