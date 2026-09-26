// 게임에서 쓰는 이미지 경로를 한곳에 모았습니다.
// 지금은 임시 SVG입니다. public/assets/ 안의 파일을 같은 이름으로 덮어쓰거나,
// 다른 형식(png 등)을 쓰려면 여기 경로만 바꾸면 됩니다. 자세한 목록은 public/assets/README.md 참고.
import type { BallKind, PotionKind, TypeKey } from './game-config.ts';

export const ASSETS = {
  logo: '/assets/ui/logo.svg',
  exp: '/assets/ui/exp.svg',
  homeBackground: '/assets/ui/home-background.svg',
  pokemonPlaceholder: '/assets/ui/pokemon-placeholder.svg',
  boxClosed: '/assets/boxes/box-closed.png',
  potion: {
    apple: '/assets/items/apple-berry.png',
    blue: '/assets/items/ice-berry.png',
    fire: '/assets/items/fire-berry.png',
    thunder: '/assets/items/thunder-berry.png',
    moon: '/assets/items/ghost-berry.png',
    star: '/assets/items/star-berry.png',
    potion: '/assets/items/potion.png',
  } satisfies Record<PotionKind, string>,
  ball: {
    poke: '/assets/balls/poke.png',
    great: '/assets/balls/great.png',
    ultra: '/assets/balls/ultra.png',
    master: '/assets/balls/master.png',
    luxury: '/assets/balls/luxury.png',
  } satisfies Record<BallKind, string>,
  type: (t: TypeKey) => `/assets/types/${t}.png`,
};
