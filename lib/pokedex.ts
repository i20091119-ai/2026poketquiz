import raw from './data/pokedex.json' with { type: 'json' };
import shinyColors from './data/shiny-colors.json' with { type: 'json' };
import { EVOLUTION_COST, EVOLUTION_COST_STRONG, SUBJECTS, SUBJECT_TYPES, TYPE_INFO, type Subject, type TypeKey } from './game-config.ts';
import { POPULAR_STRONG, THIRD_TYPE } from './strong-pokemon.ts';

export type Species = {
  id: number;
  name: string;
  types: TypeKey[];
  from: number | null;
  stage: number;
  /** 0 흔함, 1 조금 드묾, 2 희귀, 3 전설, 4 환상 */
  tier: number;
};

type Row = [number, string, string[], number | null, number, number, number];

export const SPECIES: Species[] = (raw as Row[]).map(([id, name, types, from, stage, tier]) => ({
  id, name, types: types as TypeKey[], from, stage, tier,
}));
const byId = new Map(SPECIES.map(s => [s.id, s]));
export const TOTAL_SPECIES = SPECIES.length;

export function species(id: number): Species {
  const s = byId.get(id);
  if (!s) throw new Error(`알 수 없는 포켓몬 #${id}`);
  return s;
}
export const isSpecies = (id: number) => byId.has(id);

const nextOf = new Map<number, number[]>();
for (const s of SPECIES) if (s.from) nextOf.set(s.from, [...(nextOf.get(s.from) ?? []), s.id]);
/** 이 포켓몬이 진화할 수 있는 다음 모습들 (이브이처럼 여러 갈래일 수 있음) */
export const evolutionsOf = (id: number) => nextOf.get(id) ?? [];

export type Requirement = { type: TypeKey; amount: number }[];

const POPULAR = new Set(POPULAR_STRONG);

/**
 * 보호자 공간 "속성 변경"에서 바꾼 것 (기록 저장소 settings.strong_overrides).
 * strong[id]: true/false 로 센 포켓몬 여부를 바꿈. third[id]: 도전 속성을 바꿈('' = 도전 속성 없음).
 * 서버는 요청마다, 아이·보호자 화면은 응답을 받을 때마다 setStrongOverrides 로 맞춥니다.
 */
export type StrongOverrides = { strong: Record<string, boolean>; third: Record<string, TypeKey | ''> };
let overrides: StrongOverrides = { strong: {}, third: {} };
export function setStrongOverrides(ov?: Partial<StrongOverrides> | null) {
  overrides = { strong: { ...(ov?.strong ?? {}) }, third: { ...(ov?.third ?? {}) } };
}
export const strongOverrides = (): StrongOverrides => overrides;

/** 바꾸기 전 기본값: 희귀 등급 이상의 진화형이거나 인기 포켓몬 목록(lib/strong-pokemon.ts)에 있는 진화형 */
export function defaultStrong(id: number): boolean {
  const s = byId.get(id);
  return !!s && s.from !== null && (s.tier >= 2 || POPULAR.has(id));
}
/** 바꾸기 전 기본 도전 속성 ('' = 없음) */
export const defaultThird = (id: number): TypeKey | '' => THIRD_TYPE[id] ?? '';

/** 센 포켓몬: 진화에 스탯이 더 많이 드는 포켓몬 */
export function isStrong(id: number): boolean {
  const s = byId.get(id);
  if (!s || s.from === null) return false;
  return overrides.strong[id] ?? defaultStrong(id);
}
/** 센 포켓몬의 도전 속성 (없으면 undefined) */
export function thirdTypeOf(id: number): TypeKey | undefined {
  if (!isStrong(id)) return undefined;
  const t = overrides.third[id] ?? defaultThird(id);
  return t && isValidThird(id, t) ? t : undefined;
}

export const subjectOf = (t: TypeKey): Subject => SUBJECTS.find(sub => SUBJECT_TYPES[sub].includes(t))!;
/** 도전 속성으로 고를 수 있는 속성: 두 속성이 서로 다른 과목인 포켓몬이고, 두 과목이 아닌 과목의 속성 (3과목이 되게) */
export function thirdTypeChoices(id: number): TypeKey[] {
  const s = byId.get(id);
  if (!s || s.types.length !== 2) return [];
  const used = new Set(s.types.map(subjectOf));
  if (used.size !== 2) return [];
  return SUBJECTS.filter(sub => !used.has(sub)).flatMap(sub => SUBJECT_TYPES[sub]);
}
export const isValidThird = (id: number, t: TypeKey) => thirdTypeChoices(id).includes(t);

/** 진화 후 포켓몬(target)의 속성을 기준으로 필요한 스탯을 계산합니다. 센 포켓몬은 더 많이, 도전 속성이 있으면 3과목. */
export function evolutionRequirement(target: number): Requirement {
  const s = species(target);
  if (isStrong(target)) {
    const cost = EVOLUTION_COST_STRONG[s.stage] ?? EVOLUTION_COST_STRONG[3];
    const third = thirdTypeOf(target);
    if (third && s.types.length === 2) {
      return [{ type: s.types[0], amount: cost.triple[0] }, { type: s.types[1], amount: cost.triple[1] }, { type: third, amount: cost.triple[2] }];
    }
    if (s.types.length === 1) return [{ type: s.types[0], amount: cost.single }];
    return [{ type: s.types[0], amount: cost.dual[0] }, { type: s.types[1], amount: cost.dual[1] }];
  }
  const cost = EVOLUTION_COST[s.stage] ?? EVOLUTION_COST[3];
  if (s.types.length === 1) return [{ type: s.types[0], amount: cost.single }];
  return [{ type: s.types[0], amount: cost.dual[0] }, { type: s.types[1], amount: cost.dual[1] }];
}

/** 포획에 쓰는 등급별 후보: 진화 전 첫 단계만 나옵니다. 등급 3에는 전설과 환상이 함께 들어 있습니다. */
export const CATCH_POOLS: number[][] = [[], [], [], []];
for (const s of SPECIES) if (s.from === null) CATCH_POOLS[Math.min(s.tier, 3)].push(s.id);

const pad = (id: number, n: number) => String(id).padStart(n, '0');
/** 포켓몬코리아 공식 도감 이미지. 실패하면 pokemon.com 이미지, 그다음 임시 이미지를 씁니다. */
/** 포켓몬 그림 후보: 우리 사이트에 둔 공식 일러스트(빌드 때 받음) → 포켓몬코리아 → pokemon.com 순서 */
export function pokemonImages(id: number): string[] {
  return [
    `/assets/pokemon/${id}.png`,
    `https://data1.pokemonkorea.co.kr/newdata/pokedex/full/${pad(id, 4)}01.png`,
    `https://assets.pokemon.com/assets/cms2/img/pokedex/full/${pad(id, 3)}.png`,
  ];
}

/** 이로치(색이 다른 포켓몬) 공식 일러스트 후보: 우리 사이트에 둔 그림(빌드 때 받음) → PokeAPI 저장소 */
export function shinyImages(id: number): string[] {
  return [
    `/assets/pokemon/shiny/${id}.png`,
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/${id}.png`,
  ];
}
/** 이로치의 색 이름 (scripts/shiny-colors.py 가 그림에서 뽑음). 예: 384 → '블랙' */
export const shinyColor = (id: number): string => (shinyColors as Record<string, string>)[String(id)] ?? '이로치';
/** 이로치 이름: 색 이름 + 포켓몬 이름. 예: 블랙레쿠쟈, 레드갸라도스 */
export const shinyName = (id: number) => `${shinyColor(id)}${species(id).name}`;

/** 진화 계열의 첫 모습(포켓로그의 스타터에 해당). 예: 자포코일 → 코일 */
export function rootOf(id: number): number {
  let cur = id;
  for (let i = 0; i < 5; i++) { const s = byId.get(cur); if (!s?.from) break; cur = s.from; }
  return cur;
}

export const typeLabel = (t: TypeKey) => TYPE_INFO[t].label;
export const typesLabel = (types: TypeKey[]) => types.map(typeLabel).join(' · ');
