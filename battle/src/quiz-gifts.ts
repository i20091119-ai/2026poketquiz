/*
 * 퀴즈 앱 연동판(SPEC.md 3번): 포켓몬을 주는 돌발 이벤트는 새 포켓몬 대신
 * 지금 파티에 있는 포켓몬 중 하나의 색이 다른 개체(이로치)를 줍니다. 그 판에서만 쓰입니다.
 */
import { globalScene } from "#app/global-scene";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { DexAttr } from "#enums/dex-attr";
import { TrainerSlot } from "#enums/trainer-slot";
import type { EnemyPokemon } from "#field/pokemon";
import type { Variant } from "#sprites/variant";
import { randSeedItem } from "#utils/common";

/** 색 번호 → 도감 속성 비트 */
const VARIANT_ATTR: Record<Variant, bigint> = {
  0: DexAttr.DEFAULT_VARIANT,
  1: DexAttr.VARIANT_2,
  2: DexAttr.VARIANT_3,
};
/** 도감에서 "이로치 보유"를 뜻하는 비트들 (실행마다 초기화할 때도 이것만은 남깁니다) */
export const SHINY_KEEP_BITS = DexAttr.SHINY | DexAttr.VARIANT_2 | DexAttr.VARIANT_3;

/** 파티에서 무작위로 하나를 골라, 같은 종·같은 레벨의 이로치 개체를 만듭니다 (아직 파티에 넣지는 않음). */
export function makeShinyGiftFromParty(): EnemyPokemon {
  const base = randSeedItem(globalScene.getPlayerParty());
  const gift = globalScene.addEnemyPokemon(base.species, base.level, TrainerSlot.NONE, false, true);
  gift.shiny = true;
  // 색 번호는 원본과 같은 규칙으로: 색 데이터가 없는 종은 0 (protected 메서드라 형만 맞춰 호출)
  gift.variant = (gift as unknown as { generateShinyVariant(): Variant }).generateShinyVariant();
  return gift;
}

/**
 * 이벤트로 받은 이로치는 유일하게 "내 것"으로 남깁니다(부모님 결정):
 * 그 포켓몬의 스타터(진화 전 첫 모습) 도감에 이로치·색 비트를 켜 두어, 다음 판부터 스타터 고를 때 이로치로 시작할 수 있습니다.
 */
export function keepShinyGiftForever(gift: EnemyPokemon): void {
  const starterId = speciesDataRegistry.getStarter(gift.species.speciesId);
  const dexEntry = globalScene.gameData.dexData[starterId];
  if (!dexEntry) {
    return;
  }
  const bits = DexAttr.SHINY | VARIANT_ATTR[gift.variant];
  dexEntry.caughtAttr |= bits;
  dexEntry.seenAttr |= bits;
}
