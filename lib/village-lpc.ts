// [시험] 마을 사람 캐릭터를 LPC 그림으로 바꿔 보기 (2026-11-20 부모님 요청, /village-demo 에서만 씀)
// 그림: Universal LPC Spritesheet Character Generator 의 걷기 그림(walk.png: 64×64 칸, 9장 × 4줄 = 위·왼쪽·아래·오른쪽)
//       public/assets/village/lpc/ (출처·라이선스 = 같은 폴더 CREDITS.md / CREDITS.csv)
// 옷은 한 장으로 합치지 않고 층(몸·신발·바지·윗옷·머리·머리카락·모자)을 따로 불러와 화면에서 겹쳐 그림 → 옷 바꿔 입히기 시험.
// 실제 마을·아이 기록은 건드리지 않음.

export const LPC_FRAME = 64;
/** 화면 배율: 마을 타일 16px × 3 = 48px. 2배 = 지금 서준(96px)과 키가 비슷(정수라 또렷) · 1.5배 = 한 칸 반 · 1배 = 한 칸.
 *  2026-11-20 부모님: "인간이 너무 크다" → 기본 1.5배 (폰 화면 배율 2배면 점 하나 = 화면 점 3개라 고르게 보임) */
export const LPC_SCALES = [1, 1.5, 2] as const;
export type LpcScale = (typeof LPC_SCALES)[number];
export const LPC_SCALE_DEFAULT: LpcScale = 1.5;
/** 걷기 줄 (LPC 순서) */
export const LPC_ROW = { up: 0, left: 1, down: 2, right: 3 } as const;
/** 걷기 장면: 0 = 서 있기, 1~8 = 걷기 */
export const LPC_WALK_FRAMES = 8;

/** 겹치는 순서 (생성기 zPos 기준: 몸 10 · 신발 15 · 바지 20 · 윗옷 35 · 머리 100 · 머리카락 120 · 모자 130) */
export type LpcLayer = { slot: 'body' | 'feet' | 'legs' | 'torso' | 'head' | 'hair' | 'hat'; file: string };
const L = (slot: LpcLayer['slot'], file: string): LpcLayer => ({ slot, file: `/assets/village/lpc/${file}.png` });
/** 부드러운 테두리: 같은 그림의 _soft (바깥 검은 테두리만 진한 갈색으로 바꿔 둔 것) */
export const softLayers = (layers: LpcLayer[], soft: boolean): LpcLayer[] => soft ? layers.map(l => ({ ...l, file: l.file.replace(/\.png$/, '_soft.png') })) : layers;
/** 서준 얼굴 (2026-11-20 부모님: "얼굴이 못생겼다, 부드러운 건 없니?") */
export const SEOJUN_FACES = [
  { id: 'plain', label: '처음 얼굴' },
  { id: 'happy', label: '웃는 얼굴' },
  { id: 'child', label: '아이 얼굴' },
] as const;
export type SeojunFace = (typeof SEOJUN_FACES)[number]['id'];

export type LpcPerson = { id: string; name: string; layers: LpcLayer[] };

/** 서준이 갈아입을 수 있는 것 (시험: 윗옷 2종 · 모자 1종) */
export const SEOJUN_TOPS = [
  { id: 'tshirt', label: '파란 티셔츠', layer: L('torso', 'tshirt_teen_blue') },
  { id: 'polo', label: '빨간 폴로', layer: L('torso', 'polo_teen_red') },
] as const;
export const SEOJUN_HAT = { id: 'bandana', label: '빨간 반다나', layer: L('hat', 'bandana_red') } as const;

/** 서준: LPC "어린이" 몸은 옷이 셔츠·바지 한 가지씩뿐이고 모자가 없어서, 옷 입히기를 시험하려고 "청소년" 몸 + 작은 남자 머리 */
export function seojunLayers(top: (typeof SEOJUN_TOPS)[number]['id'], hat: boolean, face: SeojunFace = 'plain', soft = false): LpcLayer[] {
  // 아이 얼굴 = LPC 어린이 머리를 청소년 몸에 맞게 4px 올린 것 + 어린이 머리카락(진갈색)
  const head = face === 'child'
    ? [L('head', 'head_child_on_teen'), L('hair', 'hair_relm_child_brown_on_teen')]
    : [L('head', 'head_male_small'), ...(face === 'happy' ? [L('head', 'face_happy')] : []), L('hair', 'hair_plain_black')];
  return softLayers([
    L('body', 'body_teen'), L('feet', 'shoes_thin_gray'), L('legs', 'shorts_thin_tan'),
    SEOJUN_TOPS.find(t => t.id === top)!.layer,
    ...head,
    ...(hat ? [SEOJUN_HAT.layer] : []),
  ], soft);
}

/** 가족 (근처에 서 있거나 천천히 걸음). 하준 = LPC에서 가장 작은 "어린이" 몸 */
export const LPC_FAMILY: (LpcPerson & { home: { dx: number; dy: number } })[] = [
  { id: 'hajun', name: '하준', home: { dx: -2, dy: 1 }, layers: [L('body', 'body_child'), L('legs', 'childpants_darkblue'), L('torso', 'childshirt_lightblue'), L('head', 'head_child'), L('hair', 'hair_relm_child_brown')] },
  { id: 'mom', name: '엄마', home: { dx: 2, dy: 2 }, layers: [L('body', 'body_female'), L('feet', 'shoes_thin_gray'), L('legs', 'pants_thin_navy'), L('torso', 'longsleeve_female_lavender'), L('head', 'head_female'), L('hair', 'hair_bob_chestnut')] },
  { id: 'dad', name: '아빠', home: { dx: -1, dy: 3 }, layers: [L('body', 'body_male'), L('feet', 'shoes_male_black'), L('legs', 'pants_male_charcoal'), L('torso', 'tshirt_male_slate'), L('head', 'head_male'), L('hair', 'hair_plain_brown')] },
];
