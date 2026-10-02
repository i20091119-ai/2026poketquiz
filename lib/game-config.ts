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

/** 받침에 따라 을/를 붙이기 (예: 사과열매를, 상처약을) */
export const eulReul = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 ? '을' : '를');
};

/** 받침에 따라 은/는 (예: 국어는, 수학은) */
export const eunNeun = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 ? '은' : '는');
};
/** 받침에 따라 이/가 (예: 피카츄가, 이상해꽃이) */
export const iGa = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 ? '이' : '가');
};

export const SUBJECTS = ['국어', '수학', '영어', '한자', '역사', '상식'] as const;
export type Subject = typeof SUBJECTS[number];

/**
 * 과목별로 스탯이 오르는 속성. 비슷한 계열 3개씩 묶어 18속성을 모두 한 번씩 씁니다.
 * 문제마다 이 중 하나가 붙습니다.
 */
/**
 * 과목별 영역 (아이 엄마 확정안, 2026-09-28). 시트의 "영역" 칸에 이 글자 그대로 적습니다(빈칸은 '기타').
 * 보호자 화면의 영역별 성적·약점 자동 조절이 이 이름으로 묶입니다. 목록에 없는 이름도 그대로 쓰이지만, 여기 있는 이름을 권장합니다.
 */
export const SUBJECT_AREAS: Record<Subject, readonly string[]> = {
  국어: ['받침·맞춤법', '낱말 뜻', '흉내말·반대말', '부호·띄어쓰기', '내용 확인', '생각·까닭'],
  수학: ['수·계산', '규칙', '모양·측정', '분류·자료'],
  영어: ['알파벳', '파닉스', '사이트워드', '기본 단어', '문장 만들기'],
  한자: ['숫자', '요일·자연', '방향·위치', '사람·가족', '학교·나라', '색·크기·기타'],
  역사: ['선사·고조선', '삼국·남북국', '고려', '조선', '근현대', '문화·풍속'],
  상식: ['동식물', '날씨·계절', '몸·안전', '동네·규칙', '음악', '미술'],
};

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
/** 모은 경험치를 원하는 속성 스탯으로 바꾸기: 경험치 cost → 고른 속성 +amount */
export const EXP_EXCHANGE = { cost: 50, amount: 5 };
/**
 * 경험치 선물: 지금까지 모은 경험치(스탯으로 바꿔 쓴 것 포함)가 every만큼 쌓일 때마다
 * 볼 3개 중 하나를 고릅니다. 스탯으로 바꿔 써도 선물은 줄지 않습니다.
 */
export const EXP_GIFT = { every: 500, ball: 'poke' as const };
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
  // 부모님 결정(2026-09-29): 3일 만에 도감 36마리를 채울 만큼 빨라서 2배로. 센 모습(3단계)일수록 훨씬 많이 필요하게
  2: { dual: [20, 10], single: 30 },
  3: { dual: [55, 25], single: 80 },
};

/**
 * 센 포켓몬(lib/strong-pokemon.ts: 희귀 등급 진화형 + 인기 포켓몬)으로 진화할 때 필요한 스탯. 보통의 약 1.2배.
 * triple = 도전 속성이 있는 포켓몬(원래 두 속성 + 다른 과목의 도전 속성 = 3과목).
 */
export const EVOLUTION_COST_STRONG: Record<number, { dual: [number, number]; single: number; triple: [number, number, number] }> = {
  2: { dual: [24, 12], single: 36, triple: [20, 10, 6] },
  3: { dual: [66, 30], single: 96, triple: [55, 25, 16] },
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

// ---- 도전 이벤트 (이벤트 탭) ----
/** 일일미션 연속 이벤트: 이 일수만큼 빠짐없이 다 풀면 완료 */
export const STREAK_DAYS = 10;
export const EVENT_INFO = {
  allClear: { title: '도전! 전 과목 올클리어', reward: '부활권 1장' },
  streak: { title: `일일미션 ${STREAK_DAYS}일 연속`, reward: '랜덤박스 1개' },
} as const;
export type EventId = keyof typeof EVENT_INFO;

// ---- 볼 ----
// 등급: 0 흔함, 1 조금 드묾, 2 희귀, 3 전설·환상
export const BALLS = {
  poke: { label: '몬스터볼', odds: [70, 25, 5, 0] },
  great: { label: '슈퍼볼', odds: [40, 45, 15, 0] },
  ultra: { label: '하이퍼볼', odds: [15, 45, 35, 5] },
  master: { label: '마스터볼', odds: [0, 20, 50, 30] },
  // 탐험 전 과목 마스터 보상: 50%가 희귀 또는 전설
  luxury: { label: '럭셔리볼', odds: [20, 30, 25, 25] },
  // 일일미션 연속 이벤트 보상: lib/rare-pokemon.ts 후보에서만 나옴 (odds 는 쓰지 않음)
  rare: { label: '희귀 포켓몬 볼', odds: [0, 0, 100, 0] },
  // 이로치 볼: 열면 아이가 가진 포켓몬(1단계 기준) 중 하나의 이로치가 확정으로 나옴 (odds 는 쓰지 않음)
  shiny: { label: '이로치 볼', odds: [0, 0, 0, 0] },
} as const;
export type BallKind = keyof typeof BALLS;
export const TIER_LABELS = ['흔함', '조금 드묾', '희귀', '전설'];

/**
 * 볼을 열 때 이로치(색이 다른 포켓몬)가 나올 확률(%). 이로치는 퀴즈에서만 얻습니다(포켓로그에서는 안 줌).
 * 보호자 공간 개발자 메뉴에서 바꿀 수 있고(settings.shiny_chance), 시뮬레이션에서는 100%로 바꿔 볼 수 있습니다.
 * 이로치 볼은 확률과 상관없이 항상 이로치입니다.
 */
export type ShinyBallKind = Exclude<BallKind, 'shiny'>;
export const SHINY_CHANCE_BALLS: ShinyBallKind[] = ['poke', 'great', 'ultra', 'master', 'luxury', 'rare'];
export const SHINY_CHANCE_DEFAULT: Record<ShinyBallKind, number> = { poke: 2, great: 4, ultra: 7, master: 12, luxury: 12, rare: 12 };
export const SHINY_CHANCE_MAX = 100;

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
  // 이로치 볼은 아주 가끔 (퀘스트 보상에 추가)
  { item: { kind: 'ball', ball: 'shiny' }, weight: 1 },
];

/** 탐험에서 과목을 모두 풀었을 때 3개 중 고르는 아이템 확률(가중치): 그 과목 열매 / 다른 열매 / 상처약 */
export const EXPLORE_ITEM_WEIGHTS = { subjectBerry: 60, otherBerry: 30, potion: 10 };

/** 이미 가진 포켓몬이 또 나오면 그 포켓몬 첫째 속성 스탯으로 바꿔 줍니다. */
export const DUPLICATE_BONUS = 5;

// ---- 포켓로그(/battle) 시도 횟수 ----
/** 하루(한국 시간 자정 기준)에 새 게임을 시작할 수 있는 횟수. 이어하기는 횟수를 쓰지 않습니다. */
export const BATTLE_STARTS_PER_DAY = 1;
/** 포켓로그 가족 비밀번호의 최소 글자 수 (보호자 공간에서 정함) */
export const BATTLE_PASSWORD_MIN = 4;
/** 날짜별 기록(퀴즈 시간·포켓로그 기록)을 보관하는 일수 — 보호자 화면 주간 그래프 4주분 */
export const ACTIVITY_LOG_DAYS = 35;
export const BATTLE_LOG_DAYS = ACTIVITY_LOG_DAYS;
/** 한 번 보고에 인정하는 최대 초 (아이 화면·포켓로그 모두 1분마다 보고) */
export const BATTLE_REPORT_MAX_SECONDS = 120;
export const QUIZ_REPORT_MAX_SECONDS = 120;
/** 포켓로그 하루 플레이 시간 제한 선택지(분). 0 = 제한 없음. 보호자 공간에서 고르고, 기본은 제한 없음 */
export const BATTLE_LIMIT_OPTIONS = [0, 15, 30, 45, 60, 90] as const;
/**
 * 약점 영역 판정: 그 영역에서 최근 WEAK_RECENT 번 중 WEAK_WRONG 번 이상 틀리면 약점.
 * 약점 영역 문제는 일일미션에 더 자주 나오고, 최근 5번 중 4번 이상 맞히면 보통으로 돌아갑니다.
 */
export const WEAK_AREA = { recent: 5, wrong: 2, maxPerSubjectDaily: 2 };
/**
 * 일일미션 → 포켓로그 사탕 (battle/SPEC.md 11번 성장 요소).
 * 오늘의 미션을 다 풀면(틀린 것 포함) 파트너 포켓몬(의 진화 전 첫 모습)에게 포켓로그 사탕을 보냅니다. 모두 맞히면 더 많이.
 * 사탕은 게임 안에서 패시브 특성 해제·스타터 비용 낮추기에 씁니다 (싼 포켓몬 패시브 40개 → 만점 2주 정도).
 * 게임 안에서 원래 방식(친밀도·클리어)으로 모이는 사탕은 그대로 더해집니다.
 */
export const DAILY_CANDY = { finished: 1, perfect: 3 };

// ---- 보호자 선물 ----
/** 보내는 사람 */
export const GIFT_SENDERS = { mom: '엄마', dad: '아빠' } as const;
export type GiftSender = keyof typeof GIFT_SENDERS;
/** 미리 골라 둔 이유 (직접 입력도 가능) */
export const GIFT_REASONS = ['숙제', '독서', '정리정돈', '운동'] as const;
export const GIFT_REASON_MAX = 20;
export const GIFT_LETTER_MAX = 60;
/** 선물 크기별 이름과, 아이가 상자를 열 때 둘 중 하나를 고르는 내용 */
export const GIFT_SIZES = {
  small: { label: '작은 선물', emoji: '🎀', options: ['exp', 'berry'] },
  medium: { label: '보통 선물', emoji: '🎁', options: ['box', 'candy'] },
  large: { label: '큰 선물', emoji: '🎉', options: ['ball', 'ticket', 'shinyBall'] },
} as const satisfies Record<string, { label: string; emoji: string; options: readonly GiftChoice[] }>;
export type GiftSize = keyof typeof GIFT_SIZES;
export type GiftChoice = 'exp' | 'berry' | 'box' | 'candy' | 'ball' | 'ticket' | 'shinyBall';
export const GIFT_EXP = 30;
export const GIFT_CANDY = 3;
export const GIFT_BALL: BallKind = 'poke';
export const GIFT_CHOICE_INFO: Record<GiftChoice, { label: string; description: string }> = {
  exp: { label: `경험치 +${GIFT_EXP}`, description: '바로 경험치가 올라. 스탯으로 바꿔 쓸 수 있어.' },
  berry: { label: '원하는 열매 1개', description: '계열(과목)을 골라서 그 열매를 가방에 넣어.' },
  box: { label: '랜덤상자 1개', description: '열매·상처약·볼 중 하나가 들어 있어.' },
  candy: { label: `포켓로그 사탕 ${GIFT_CANDY}개`, description: '파트너 포켓몬에게 보내. 포켓로그를 켜면 들어가.' },
  ball: { label: '몬스터볼 1개', description: '가방에 넣었다가 열어서 새 포켓몬을 만나.' },
  ticket: { label: '배틀 추가권 1장', description: '포켓로그 새 게임을 한 번 더 할 수 있어. 안 쓰면 남아 있어.' },
  shinyBall: { label: '이로치 볼 1개', description: '열면 내가 가진 포켓몬 중 하나의 이로치(색이 다른 모습)가 꼭 나와!' },
};
/** 하루(작은·보통)·일주일(큰) 한도 기본값. 보호자 공간에서 바꿀 수 있습니다. */
export const GIFT_LIMIT_DEFAULT = { small: 2, medium: 1, large: 1 };
export type GiftLimits = { small: number; medium: number; large: number };
/** 아이 화면에 두는 선물 기록 수 */
export const GIFT_HISTORY = 40;

// ---- 아이 답장 ----
/** 새싹 동글이 스티커 5개 (public/assets/stickers/<key>.svg) */
export const REPLY_STICKERS = [
  { key: 'thanks', label: '감사합니다' },
  { key: 'moved', label: '감동이야' },
  { key: 'love', label: '사랑해' },
  { key: 'try', label: '열심히 할게요' },
  { key: 'yay', label: '신나신나' },
] as const;
export type ReplySticker = typeof REPLY_STICKERS[number]['key'];
export const REPLY_TEXT_MAX = 30;

// ---- 포켓로그 쉬는 시간 ----
/** 처음 값. 보호자 공간에서 고칩니다. 요일: 0 일 … 6 토. 끝 시각이 시작보다 빠르면 다음 날까지(자정 넘김). */
export const BATTLE_REST_DEFAULT = [
  { id: 'work', name: '일과 시간', days: [1, 2, 3, 4, 5], start: '07:30', end: '18:00' },
  { id: 'sleep', name: '잠자는 시간', days: [0, 1, 2, 3, 4, 5, 6], start: '22:30', end: '07:30' },
];
/** 쉬는 시간 몇 분 전에 게임 화면에 미리 알릴지 */
export const BATTLE_REST_WARN_MINUTES = 10;
