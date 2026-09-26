# 게임 에셋 교체 안내

지금 들어 있는 파일은 모두 **임시 이미지(SVG)** 입니다. 아래 표의 파일을 **같은 이름으로 덮어쓰면** 게임에 바로 반영됩니다.
PNG 등 다른 형식을 쓰려면 파일을 넣고 `lib/assets.ts`의 경로만 바꿔 주세요.

| 파일 | 용도 | 권장 크기 |
|---|---|---|
| `ui/logo.svg` | 상단 로고 | 128×128, 정사각형 |
| `ui/exp.svg` | 경험치 아이콘 | 64×64 |
| `ui/home-background.svg` | 홈 화면 파트너 뒤 배경 | 1200×400, 가로형 |
| `ui/pokemon-placeholder.svg` | 포켓몬 이미지를 못 불러올 때 대신 보이는 그림 | 256×256 |
| `boxes/box-closed.png` | 랜덤상자 (일일미션 상자, 탐험 선물) — 부모님 그림 | 256×256, 투명 배경 |
| `items/apple-berry.png` | 사과열매 (풀·벌레·땅 +5) — 완성 그림 | 256×256, 투명 배경 |
| `items/ice-berry.png` | 얼음열매 (물·얼음·비행 +5) — 완성 그림 | 256×256, 투명 배경 |
| `items/fire-berry.png` | 불꽃열매 (불꽃·격투·드래곤 +5) — 완성 그림 | 256×256, 투명 배경 |
| `items/thunder-berry.png` | 번개열매 (전기·강철·바위 +5) — 완성 그림 | 256×256, 투명 배경 |
| `items/ghost-berry.png` | 유령열매 (고스트·악·독 +5) — 완성 그림 | 256×256, 투명 배경 |
| `items/star-berry.png` | 별빛열매 (노말·에스퍼·페어리 +5) — 완성 그림 | 256×256, 투명 배경 |
| `items/potion.png` | 상처약 (모든 속성 +5) — 완성 그림 | 256×256, 투명 배경 |
| `balls/poke.png` | 몬스터볼 — 포켓몬 공식 일러스트 (PokeAPI) | 180×180 |
| `balls/great.png` | 슈퍼볼 — 포켓몬 공식 일러스트 (PokeAPI) | 180×180 |
| `balls/ultra.png` | 하이퍼볼 — 포켓몬 공식 일러스트 (PokeAPI) | 180×180 |
| `balls/master.png` | 마스터볼 — 포켓몬 공식 일러스트 (PokeAPI) | 180×180 |
| `balls/luxury.png` | 럭셔리볼 (탐험 전 과목 마스터 보상) — 포켓몬 공식 일러스트 (PokeAPI) | 180×180 |
| `types/<속성>.png` | 속성 아이콘 18종 — 포켓몬 게임(스칼렛·바이올렛) 공식 아이콘, PokeAPI (`normal, flying, fairy, electric, steel, psychic, fighting, rock, dragon, ghost, ground, dark, grass, water, fire, bug, poison, ice`) | 60×60 |

포켓몬 이미지는 에셋 폴더에 넣지 않고 포켓몬코리아 공식 도감 이미지를 불러옵니다 (`lib/pokedex.ts`의 `pokemonImages`).
