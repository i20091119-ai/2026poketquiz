// 포켓몬 마을 방명록 (2026-11-14 부모님 결정, 설계 문서 「포켓몬 마을」 > 방명록).
// 마을 손님·낚시·벌레잡기에서 만난 포켓몬은 도감이 아니라 방명록에: 처음 온 날·온 횟수·발자국 도장·들은 대사·알아낸 정보(좋아하는 열매·물건).
// 예전 도감 "만남" 기록(state.met)은 지우지 않고 그대로 두고, 방명록이 처음 만들어질 때 옮겨 옴(처음 온 날은 모름 = null).
// 손님은 전설·환상(tier 3) 제외 (lib/village.ts guestPool). 상태 변경은 lib/game-engine.ts.
import type { PotionKind } from './game-config.ts';
import { species } from './pokedex.ts';
import { berryOfType } from './village-craft.ts';
import { DECOR_INFO, DECOR_ITEMS, type DecorKey } from './village-decor.ts';
import { guestPool, HABITATS } from './village.ts';

export type GuestSource = 'guest' | 'fish' | 'bug' | 'old';
export type GuestbookEntry = {
  /** 처음 온 날 (예전 "만남"에서 옮겨 온 것은 null = 모름) */
  first: string | null;
  /** 마지막으로 온 날 (하루에 한 번만 셈) */
  last?: string;
  /** 온 횟수 (= 발자국 도장 수) */
  visits: number;
  /** 들은 대사 (처음 들은 순서, 최대 12) */
  lines?: string[];
  /** 알아낸 정보 */
  knows?: { berry?: boolean; item?: boolean };
  /** 어디서 만났는지 */
  from?: GuestSource[];
};
export type Guestbook = Record<string, GuestbookEntry>;
export const GUESTBOOK_LINES_MAX = 12;

/** 좋아하는 열매 = 첫 번째 타입의 과목 열매 */
export const favoriteBerry = (id: number): PotionKind => berryOfType(species(id).types[0]);
/** 좋아하는 물건 = 꾸미기 물건 중 하나 (번호로 정해짐) */
const DECOR_ONLY = DECOR_ITEMS.filter(k => DECOR_INFO[k].tab === 'decor');
export const favoriteItem = (id: number): DecorKey => DECOR_ONLY[id % DECOR_ONLY.length];

/** 손님으로 올 수 있는 포켓몬 전체 (서식지 손님 + 낚시·벌레잡기) — 방명록 빈칸 수 */
let allGuests: number[] | null = null;
export function possibleGuests(): number[] {
  allGuests ??= [...new Set(HABITATS.flatMap(h => guestPool(h)))].sort((a, b) => a - b);
  return allGuests;
}
