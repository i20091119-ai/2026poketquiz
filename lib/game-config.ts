// 게임 규칙의 숫자는 모두 이 파일에서 조정합니다.

export const TYPE_KEYS = [
  'normal', 'psychic', 'fairy', // 마음과 빛
  'electric', 'steel', 'rock', // 광물과 기계
  'water', 'ice', 'flying', // 물과 하늘
  'fire', 'fighting', 'dragon', // 힘과 불
  'ghost', 'dark', 'poison', // 어둠과 옛것
  'grass', 'bug', 'ground', // 자연
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

/** 인터넷에 올린 게임 주소. 보호자 공간 버튼이 이 주소의 /parent 를 새 창으로 엽니다. */
export const SITE_URL = 'https://poke-quiz.qhfk8292.workers.dev';

/** 받침에 따라 을/를 붙이기 (예: 사과열매를, 상처약을) */
export const eulReul = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 ? '을' : '를');
};

export const SUBJECTS = ['국어', '수학', '영어', '한자', '역사', '상식'] as const;
export type Subject = typeof SUBJECTS[number];

/**
 * 과목별로 스탯이 오르는 속성. 비슷한 계열 3개씩 묶어 18속성을 모두 한 번씩 씁니다.
 * 문제마다 이 중 하나가 붙습니다.
 */
export const SUBJECT_TYPES: Record<Subject, TypeKey[]> = {
  국어: ['normal', 'psychic', 'fairy'], // 마음과 빛
  수학: ['electric', 'steel', 'rock'], // 광물과 기계
  영어: ['water', 'ice', 'flying'], // 물과 하늘
  한자: ['fire', 'fighting', 'dragon'], // 힘과 불
  역사: ['ghost', 'dark', 'poison'], // 어둠과 옛것
  상식: ['grass', 'bug', 'ground'], // 자연
};

export const SUBJECT_INFO: Record<Subject, { description: string; color: string }> = {
  국어: { description: '낱말, 맞춤법, 읽기', color: '#e46b8a' },
  수학: { description: '수와 연산, 도형', color: '#e3a008' },
  영어: { description: '낱말, 파닉스, 표현', color: '#2f7fd6' },
  한자: { description: '뜻과 소리', color: '#d9602c' },
  역사: { description: '옛날 사람들의 생활', color: '#7b5ea7' },
  상식: { description: '사회와 과학', color: '#2f9e6a' },
};

/** 부모 화면에서 고를 수 있는 학년 */
export const GRADES = ['초1', '초2', '초3', '초4', '초5', '초6'] as const;
export const DEFAULT_GRADE = '초1';

export const CHOICE_COUNT = 5;
export const STARTERS = [906, 909, 912]; // 나오하, 뜨아거, 꾸왁스

/**
 * 정답 한 번에 오르는 값. 스탯은 문제에 붙은 속성에 들어갑니다.
 * 일일미션(하루 18문제)만 꾸준히 풀어도 일주일에 한 번 이상 진화할 수 있게 맞춘 값입니다.
 * 일일미션은 과목마다 속성을 돌아가며 내므로, 속성 하나당 일주일에 7문제(하루 3문제 × 7일 ÷ 3속성)가 나옵니다.
 *   → 정답률 80%면 속성 하나당 일주일에 약 28점 (첫 진화 15점, 두 번째 진화 25점+12점)
 */
export const REWARD_PER_ANSWER = { daily: 5, explore: 1, exp: 10 };
/**
 * 속성이 많은 과목은 한 속성에 문제가 덜 돌아가므로 스탯에 배수를 줍니다 (속성 수 ÷ 3).
 * 지금은 모든 과목이 속성 3개라 배수는 1입니다. 과목별 속성 수를 바꾸면 자동으로 맞춰집니다.
 */
export const statReward = (subject: Subject, mode: 'daily' | 'explore') =>
  Math.round(REWARD_PER_ANSWER[mode] * SUBJECT_TYPES[subject].length / 3);

export const DAILY_PER_SUBJECT = 3;
/** 일일미션 문제 하나에 주는 기회 (처음 1번 + 다시 풀기 2번). 탐험은 1번입니다. */
export const DAILY_ATTEMPTS = 3;
/**
 * 일일미션 랜덤상자: 맞힌 개수에 따라 3개 중 몇 개를 고를 수 있는지. 위에서부터 먼저 맞는 규칙을 씁니다.
 * minCorrect: 'all'이면 오늘의 문제를 모두 맞혔을 때.
 */
export const DAILY_BOX_RULES: { minCorrect: number | 'all'; picks: number }[] = [
  { minCorrect: 'all', picks: 2 },
  { minCorrect: 15, picks: 1 },
];

/**
 * 진화 조건: 진화 후 포켓몬의 속성을 모읍니다. 진화하면 해당 스탯을 소모합니다.
 * dual = [첫째 속성, 둘째 속성], single = 속성이 하나일 때.
 */
export const EVOLUTION_COST: Record<number, { dual: [number, number]; single: number }> = {
  2: { dual: [10, 5], single: 15 },
  3: { dual: [25, 12], single: 35 },
};

// ---- 아이템 (열매·상처약) ----
// 보상으로 받으면 가방에 들어가고, 아이가 포켓몬에게 먹이면 적힌 속성 스탯이 모두 오릅니다.
// 열매는 과목 계열 하나(속성 3개), 상처약은 모든 속성을 올립니다.
export const POTIONS = {
  apple: { label: '사과열매', types: SUBJECT_TYPES.상식, amount: 5 },
  blue: { label: '얼음열매', types: SUBJECT_TYPES.영어, amount: 5 },
  fire: { label: '불꽃열매', types: SUBJECT_TYPES.한자, amount: 5 },
  thunder: { label: '번개열매', types: SUBJECT_TYPES.수학, amount: 5 },
  moon: { label: '유령열매', types: SUBJECT_TYPES.역사, amount: 5 },
  star: { label: '별빛열매', types: SUBJECT_TYPES.국어, amount: 5 },
  potion: { label: '상처약', types: 'all', amount: 5 },
} as const satisfies Record<string, { label: string; types: readonly TypeKey[] | 'all'; amount: number }>;
export type PotionKind = keyof typeof POTIONS;
/** 이 아이템을 먹이면 오르는 속성들 */
export const potionTargets = (kind: PotionKind): readonly TypeKey[] => {
  const types = POTIONS[kind].types;
  return types === 'all' ? TYPE_KEYS : types;
};
/** 과목별 열매 (탐험에서 그 과목을 다 풀면 주로 이 열매가 나옵니다) */
export const SUBJECT_BERRY: Record<Subject, PotionKind> = {
  국어: 'star', 수학: 'thunder', 영어: 'blue', 한자: 'fire', 역사: 'moon', 상식: 'apple',
};

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

/** 일일미션 랜덤상자 내용물 확률(가중치, 합 100) */
export const DAILY_BOX_TABLE: { item: { kind: 'potion'; potion: PotionKind } | { kind: 'ball'; ball: BallKind }; weight: number }[] = [
  { item: { kind: 'potion', potion: 'apple' }, weight: 8 },
  { item: { kind: 'potion', potion: 'blue' }, weight: 8 },
  { item: { kind: 'potion', potion: 'fire' }, weight: 8 },
  { item: { kind: 'potion', potion: 'thunder' }, weight: 8 },
  { item: { kind: 'potion', potion: 'moon' }, weight: 8 },
  { item: { kind: 'potion', potion: 'star' }, weight: 8 },
  { item: { kind: 'potion', potion: 'potion' }, weight: 4 },
  { item: { kind: 'ball', ball: 'poke' }, weight: 25 },
  { item: { kind: 'ball', ball: 'great' }, weight: 14 },
  { item: { kind: 'ball', ball: 'ultra' }, weight: 7 },
  { item: { kind: 'ball', ball: 'master' }, weight: 2 },
];

/** 탐험에서 과목을 모두 풀었을 때 3개 중 고르는 아이템 확률(가중치): 그 과목 열매 / 다른 열매 / 상처약 */
export const EXPLORE_ITEM_WEIGHTS = { subjectBerry: 60, otherBerry: 30, potion: 10 };

/** 이미 가진 포켓몬이 또 나오면 그 포켓몬 첫째 속성 스탯으로 바꿔 줍니다. */
export const DUPLICATE_BONUS = 5;
