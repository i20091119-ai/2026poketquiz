import raw from './data/pokedex.json' with { type: 'json' };
import { EVOLUTION_COST, TYPE_INFO, type TypeKey } from './game-config.ts';

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

/** 진화 후 포켓몬(target)의 속성을 기준으로 필요한 스탯을 계산합니다. */
export function evolutionRequirement(target: number): Requirement {
  const s = species(target);
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

/** 진화 계열의 첫 모습(포켓로그의 스타터에 해당). 예: 자포코일 → 코일 */
export function rootOf(id: number): number {
  let cur = id;
  for (let i = 0; i < 5; i++) { const s = byId.get(cur); if (!s?.from) break; cur = s.from; }
  return cur;
}

export const typeLabel = (t: TypeKey) => TYPE_INFO[t].label;
export const typesLabel = (types: TypeKey[]) => types.map(typeLabel).join(' · ');
