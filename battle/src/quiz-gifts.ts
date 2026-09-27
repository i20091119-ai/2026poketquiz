/*
 * 퀴즈 앱 연동판(SPEC.md 3번): 포켓몬을 주는 돌발 이벤트는 새 포켓몬 대신
 * 지금 파티에 있는 포켓몬 중 하나의 색이 다른 개체(이로치)를 줍니다. 그 판에서만 쓰입니다.
 */
import { globalScene } from "#app/global-scene";
import { TrainerSlot } from "#enums/trainer-slot";
import type { EnemyPokemon } from "#field/pokemon";
import type { Variant } from "#sprites/variant";
import { randSeedInt, randSeedItem } from "#utils/common";

/** 파티에서 무작위로 하나를 골라, 같은 종·같은 레벨의 이로치 개체를 만듭니다 (아직 파티에 넣지는 않음). */
export function makeShinyGiftFromParty(): EnemyPokemon {
  const base = randSeedItem(globalScene.getPlayerParty());
  const gift = globalScene.addEnemyPokemon(base.species, base.level, TrainerSlot.NONE, false, true);
  gift.shiny = true;
  gift.variant = randSeedInt(3) as Variant;
  return gift;
}
