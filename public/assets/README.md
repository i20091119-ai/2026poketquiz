# 게임 에셋 교체 안내

지금 들어 있는 파일은 모두 **임시 이미지(SVG)** 입니다. 아래 표의 파일을 **같은 이름으로 덮어쓰면** 게임에 바로 반영됩니다.
PNG 등 다른 형식을 쓰려면 파일을 넣고 `lib/assets.ts`의 경로만 바꿔 주세요.

| 파일 | 용도 | 권장 크기 |
|---|---|---|
| `ui/logo.svg` | 상단 로고 | 128×128, 정사각형 |
| `ui/exp.svg` | 경험치 아이콘 | 64×64 |
| `ui/home-background.svg` | 홈 화면 파트너 뒤 배경 | 1200×400, 가로형 |
| `ui/pokemon-placeholder.svg` | 포켓몬 이미지를 못 불러올 때 대신 보이는 그림 | 256×256 |
| `boxes/box-closed.svg` | 일일미션 랜덤상자 (닫힘) | 256×256 |
| `boxes/box-open.svg` | 랜덤상자 (열림) | 256×256 |
| `items/apple-berry.svg` | 사과열매 (풀·벌레·땅 +5) | 128×128 |
| `items/blue-berry.svg` | 파랑열매 (물·얼음·비행 +5) | 128×128 |
| `items/fire-berry.svg` | 불꽃열매 (불꽃·격투·드래곤 +5) | 128×128 |
| `items/thunder-berry.svg` | 번개열매 (전기·강철·바위 +5) | 128×128 |
| `items/moon-berry.svg` | 달빛열매 (고스트·악·독 +5) | 128×128 |
| `items/star-berry.svg` | 별빛열매 (노말·에스퍼·페어리 +5) | 128×128 |
| `items/potion.svg` | 상처약 (모든 속성 +5) | 128×128 |
| `balls/poke.svg` | 몬스터볼 | 128×128 |
| `balls/great.svg` | 슈퍼볼 | 128×128 |
| `balls/ultra.svg` | 하이퍼볼 | 128×128 |
| `balls/master.svg` | 마스터볼 | 128×128 |
| `balls/luxury.svg` | 럭셔리볼 (탐험 전 과목 마스터 보상) | 128×128 |
| `types/<속성>.svg` | 속성 아이콘 18종 (`normal, flying, fairy, electric, steel, psychic, fighting, rock, dragon, ghost, ground, dark, grass, water, fire, bug, poison, ice`) | 64×64 |

포켓몬 이미지는 에셋 폴더에 넣지 않고 포켓몬코리아 공식 도감 이미지를 불러옵니다 (`lib/pokedex.ts`의 `pokemonImages`).
