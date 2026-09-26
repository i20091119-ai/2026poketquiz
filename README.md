# PokeQuiz · 포켓몬 배움 탐험대

초등학교 1학년을 위한 첫 주 학습 게임입니다.

## 사용 순서

1. 보호자 공간에서 7일치 35문제와 정답을 검토합니다. 필요하면 공개 전에 수정합니다.
2. 검토 확인을 체크하고 오늘부터 시작을 누릅니다.
3. 나의 포켓몬에서 이상해씨, 파이리, 꼬부기 중 첫 파트너를 선택합니다.
4. 매일 5문제를 풀면 포켓볼 3개 중 하나를 선택할 수 있습니다.
5. 에너지를 모아 원하는 포켓몬을 진화시킵니다.

## 학습 범위

- 수학: 받아올림·받아내림 없는 두 자리 덧셈과 뺄셈
- 국어: 겹받침이 들어가는 낱말
- 한자: 한국어문회 8급 기초 글자
- 과학: 초1 자연상식
- 역사: 선사시대의 도구와 생활
- 사회: 다음 주 범위 입력란 제공, 첫 주에서는 제외

## 보상과 저장

정답마다 에너지 10과 해당 과목 능력 1을 얻습니다. 오답 감점은 없으며, 같은 문제를 다시 맞혀도 중복 보상은 없습니다. 일일 포획은 한 번만 가능합니다. 이미 가진 포켓몬이 나오면 에너지 20을 받습니다. 첫 진화는 60, 다음 진화는 120 에너지입니다. 공식 진화 순서를 유지하며 에너지 조건은 이 학습 게임의 별도 규칙입니다.

서버의 D1 데이터베이스에 계정별 학습 기록을 저장합니다. API에서 정답, 보상 자격, 에너지 차감을 검증하고 revision 조건부 갱신으로 동시에 들어온 요청의 중복 지급을 방지합니다. 날짜는 한국 시간 기준입니다. 학습을 시작한 날짜로부터 7일간 오늘의 미션이 열립니다.

## 현재 범위

첫 주 문제를 사용하는 버전입니다. AI 서비스 API 연결과 다음 주차 문제 등록은 아직 구현하지 않았습니다. 보호자 공간에서 다음 범위를 저장하고 AI 대화용 요청문을 복사할 수 있습니다. 보호자 공간은 같은 로그인 계정 안의 화면이며, 별도 PIN이나 보호자/아동 권한 분리는 아직 없습니다.

## 로컬 실행

Node.js 22.13 이상이 필요합니다.

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_fast_blonde_phantom.sql
npm run dev
```

마이그레이션 명령은 새 로컬 데이터베이스에 한 번만 실행합니다. 현재 폴더의 로컬 데이터베이스에는 이미 적용했습니다. 개발 서버가 출력하는 주소를 열면 로컬 모의 로그인으로 사용할 수 있습니다. 배포 환경은 Sites의 비공개 접근과 ChatGPT 로그인을 사용합니다.

이 컴퓨터의 Codex 내장 실행 환경으로 바로 시작하려면 `start-local.ps1`을 실행합니다. 로컬 주소는 개발 서버가 출력합니다.

## 주요 파일

- `app/game-client.tsx`: 학습, 포켓몬, 보호자 화면
- `app/api/game/route.ts`: 저장 및 게임 API
- `lib/game-engine.ts`: 보상, 포획, 진화 검증
- `lib/questions.ts`: 첫 주 35문제
- `lib/learning.ts`: 데이터 형식, 포켓몬 진화 관계
- `db/schema.ts`, `drizzle/`: 저장 구조와 마이그레이션

## 자료 출처

- 포켓몬 한국 공식 도감: https://pokemonkorea.co.kr/pokedex
- 진화 조건: https://pokemondb.net/evolution
- 포켓볼 이미지: https://github.com/PokeAPI/sprites/blob/master/sprites/items/poke-ball.png
- 선사시대: https://daegu.museum.go.kr/kor/sub03_01_01_01.do

포켓몬 이미지는 각 제공처에서 불러오는 저작권 보호 이미지이며 이 프로젝트가 소유한 자산이 아닙니다.
