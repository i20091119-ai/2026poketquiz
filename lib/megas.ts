import raw from './data/megas.json' with { type: 'json' };

/**
 * 메가 도감: 포켓로그에 있는 메가 모습 96개 (battle/src/data/balance/species/ 의 메가 폼과 같음).
 * 그림은 PokeAPI 공식 일러스트(저장소 PokeAPI/sprites 의 official-artwork/<art>.png, art 가 100xx 번)를 씁니다.
 * 데이터 출처: PokeAPI 의 pokemon-species varieties (api 이름으로 확인한 번호). 목록은 lib/data/megas.json 에서 한 줄에 한 개씩.
 * 아직 해금하는 방법이 없어 state.megas 는 비어 있고, 나중에 특별 미션이 생기면 key 를 넣습니다.
 */
export type MegaForm = {
  /** 도감 번호-모습 (예: 6-mega-x). state.megas 에 이 값을 넣습니다 */
  key: string;
  /** 원래 포켓몬의 전국도감 번호 */
  species: number;
  /** 화면에 보이는 이름 (예: 메가리자몽X) */
  name: string;
  /** PokeAPI 그림 번호 (예: 10034) */
  art: number;
  /** PokeAPI 이름 (예: charizard-mega-x) */
  api: string;
};

export const MEGAS: MegaForm[] = (raw as [string, number, string, number, string][]).map(([key, species, name, art, api]) => ({ key, species, name, art, api }));
export const TOTAL_MEGAS = MEGAS.length;
const byKey = new Map(MEGAS.map(m => [m.key, m]));
export const megaByKey = (key: string) => byKey.get(key);

/** 메가 그림 후보: 우리 사이트에 둔 그림(빌드 때 받음) → PokeAPI 저장소 */
export function megaImages(art: number): string[] {
  return [
    `/assets/pokemon/mega/${art}.png`,
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${art}.png`,
  ];
}
