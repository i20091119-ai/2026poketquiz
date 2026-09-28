# CLAUDE.md

## 대화 방식 (가장 중요)

이 프로젝트의 주인은 아이의 부모이며, 컴퓨터·웹 개발을 잘 모르고 배울 생각도 크게 없습니다.

- **개발 용어를 쓰지 마세요.** 꼭 필요하면 바로 옆에 쉬운 말로 풀어 주세요.
  - 예: "브랜치" → "작업본", "커밋/푸시" → "저장해서 GitHub에 올리기", "DB" → "기록 저장소", "배포" → "인터넷에 올려서 누구나 접속하게 하기"
- **한 번에 한 단계씩** 알려 주세요. 명령어는 "이걸 복사해서 터미널에 붙여 넣고 Enter" 수준으로 안내하고, 각 단계가 끝나면 무엇이 보여야 정상인지 함께 적어 주세요.
- 오류가 나면 원인을 쉬운 말로 한 줄 설명한 뒤, 바로 따라 할 수 있는 해결 방법을 주세요.
- 선택지를 드릴 때는 추천 하나를 먼저 말하고, 이유는 짧게 적어 주세요.
- 부모의 컴퓨터는 **맥북**입니다. 명령어는 맥 터미널 기준으로 안내해 주세요.
- 대화는 한국어로 합니다.

## 프로젝트 한눈에 보기

아이(초1)가 퀴즈를 풀어 속성 스탯을 모으고, 포켓몬을 진화시키며 도감을 채우는 학습 게임입니다.
- **아이 화면:** `/`
- **보호자 공간:** `/parent` (비밀번호 로그인)
- **인터넷 주소:** https://poke-quiz.gnmc-swteacher.workers.dev (부모 본인 Cloudflare 계정. 옛 주소 poke-quiz.qhfk8292.workers.dev 는 애 엄마 계정의 것으로 더 이상 쓰지 않음)
- **실행 환경:** Cloudflare Workers + D1(기록 저장소). Next.js(vinext)로 만들었습니다.
- **작업본:** GitHub `i20091119-ai/2026poketquiz`의 `claude/vibrant-bell-ru08mi` 브랜치
- 자세한 규칙과 실행·배포 방법은 `README.md`에 있습니다.

## 지금까지 정한 게임 규칙

모든 숫자는 `lib/game-config.ts` 한 곳에서 바꿉니다.
- **과목과 속성:** 6과목(국어, 수학, 영어, 한자, 역사, 상식)에 속성 3개씩, 비슷한 계열끼리 묶었습니다.
  - 국어 = 노말·에스퍼·페어리
  - 수학 = 전기·강철·바위
  - 영어 = 물·얼음·비행
  - 한자 = 불꽃·격투·드래곤
  - 역사 = 고스트·악·독
  - 상식 = 풀·벌레·땅
- **시작 포켓몬:** 나오하, 뜨아거, 꾸왁스 중 하나를 고릅니다.
- **일일미션**
  - 과목별 3문제, 총 18문제를 내고, 속성마다 하루 1문제씩 고르게 나옵니다.
  - 문제마다 기회는 3번입니다.
  - 정답을 맞히면 그 속성 +5, 경험치 +10입니다.
  - 18문제를 모두 맞히면 랜덤상자 2개, 15문제 이상이면 1개를 고릅니다.
  - 한 번이라도 틀린 문제는 다른 날 미션에 먼저 다시 나옵니다.
- **탐험**
  - 과목별로 아직 못 맞힌 문제만 나오고, 기회는 1번입니다. 정답은 +1입니다.
  - 틀린 문제는 그날은 빠지고 다른 날 다시 나옵니다.
  - 과목을 모두 맞히면 선물(주로 그 과목 열매)을, 전 과목을 마스터하면 50% 확률로 희귀·전설 볼을 받습니다.
- **가방·아이템:** 보상의 볼과 아이템은 가방 탭에 모입니다. 아이템은 열매 6종(계열별 속성 3개 +5)과 상처약(모든 속성 +5)이고, 아이가 포켓몬을 골라 먹이면 스탯이 오릅니다.
- **경험치:** 정답마다 +10. 첫 화면 "스탯으로 바꾸기"로 경험치 50을 원하는 속성 스탯 +5로 바꿀 수 있습니다. 보호자 화면에는 지금까지 모은 경험치 전체가 남습니다.
  - 모은 경험치 전체가 500 쌓일 때마다 "경험치 선물"로 몬스터볼 3개 중 하나를 고릅니다(스탯으로 바꿔 써도 줄지 않음).
  - 아이 기록은 한 덩어리로 저장되고, 새 항목(`expSpent`, `expGifts`)은 없으면 0으로 읽으므로 예전 기록이 그대로 이어집니다.
- **진화:** 진화 후 포켓몬의 속성 스탯을 모으면 진화하고, 진화하면 그 스탯을 소모합니다.
  - 1→2단계: 15 (속성 2개면 10+5)
  - 2→3단계: 35 (속성 2개면 25+12)
  - 일일미션만 풀어도 일주일에 한 번 이상 진화할 수 있게 맞춰 두었습니다. 이를 확인하는 시뮬레이션 테스트가 있습니다.
- **문제은행:** 보호자가 주차별로 만들어 구글 시트 링크나 CSV로 올립니다. 문제마다 **영역**(`questions.area`, 시트 열 "영역", 비우면 '기타')이 있고, 영역 이름은 아이 엄마가 확정함(`lib/game-config.ts`의 `SUBJECT_AREAS`, 출제 규칙 전문은 `data/banks/AREA-RULES.md`): 국어 받침·맞춤법/낱말 뜻/흉내말·반대말/부호·띄어쓰기/내용 확인/생각·까닭, 수학 수·계산/규칙/모양·측정/분류·자료(서술형 30%: 빈칸 문장·틀린 곳 찾기 ㉠~㉤·알맞은 식·이유 고르기), 영어 알파벳/파닉스/사이트워드/기본 단어/문장 만들기, 한자 숫자/요일·자연/방향·위치/사람·가족/학교·나라/색·크기·기타(8급 50자만, 검정 훈음), 역사 선사·고조선/삼국·남북국/고려/조선/근현대/문화·풍속(지금은 선사·고조선 비중 높게), 상식 동식물/날씨·계절/몸·안전/동네·규칙/음악/미술. 미리 만든 연습 문제은행 3개는 `data/banks/`(과목별 원본 + `scripts/assemble-banks.mjs`로 합친 bank1~3.csv, `lib/server/prepared-banks.ts`가 `?raw`로 묶어 보호자 공간 "연습 문제은행 불러오기"로 넣음).
- **영역별 성적·약점 자동 조절:** `BankProgress.areas['과목|영역']`에 첫 시도 결과(o/x 최근 8개)를 남기고, `isWeakArea`(최근 5번 중 2번 이상 틀림)면 `ensureDaily`가 그 영역의 다른 문제를 먼저 놓음(과목당 `WEAK_AREA.maxPerSubjectDaily`=2개까지, 속성 고르게 규칙 유지). 보호자 화면 `areaReport`로 영역표·반복 오답(2번 이상) 표시.
- **활동 기록:** 아이 화면이 1분마다 `quizTime` 액션으로 화면 본 초를 보내 `state.quizLog[날짜]`(초·푼 문제·첫 시도 정답)에 쌓고, 포켓로그 `battleLog`와 함께 `activityList`로 최근 28일을 보호자 그래프(recharts, 최근 7일/4주)에 보여 줌. 보관 35일(`ACTIVITY_LOG_DAYS`).
- **이로치 도감:** 포켓로그 이벤트 이로치를 받으면 `quiz-gifts.ts` `keepShinyGiftForever`가 `reportQuizShiny`로 `POST /api/battle/shiny`에 도감 번호를 보내고(실패 시 기기 localStorage `quizShinyPending`, LoginPhase에서 `flushQuizShinies`), 퀴즈 앱은 `state.shiny`(`recordShiny`)에 남겨 도감 탭에 "이로치 ○○" 카드(`ShinyCard`, 이로치 일러스트 `shinyImages`는 `scripts/fetch-pokemon-art.mjs`가 `public/assets/pokemon/shiny/`에 같이 받음)로 따로 보여 줌. 이름은 색 이름+포켓몬 이름(`shinyName`, 예: 블랙레쿠쟈·레드갸라도스)이고 색 이름은 `scripts/shiny-colors.py`가 이로치 그림에서 뽑아 `lib/data/shiny-colors.json`에 둔 것(git 포함). 기본 색 포켓몬 획득에는 영향 없음.
- **포켓로그 판 안 진화 스위치:** `settings.battle_evolution_allowed`(기본 꺼짐), 보호자 공간 포켓로그 칸 "배틀 중 진화 허용" 버튼(`setBattleEvolution`). `/api/battle` GET과 `/api/battle/progress` 응답의 `evolution`을 게임이 받아(`quiz-link.ts` `isBattleEvolutionAllowed`, 기기 localStorage에 마지막 값 기억) 꺼져 있으면 `pokemon.ts` `getEvolution`이 플레이어 포켓몬에 null을 주고, `init-modifier-pools.ts`가 진화 아이템 가중치를 0으로 둠. 부모님 결정(2026-09-28): 진화는 퀴즈 스탯으로만.
- **포켓로그 하루 시간 제한:** `settings.battle_limit_minutes`(0 = 없음, 기본), 보호자 공간 포켓로그 칸에서 선택. `/api/battle` GET/POST가 `timeUp`이면 새 게임 거부, `/api/battle/progress` 응답의 `timeUp`을 보고 게임(`quiz-link.ts` `showTimeUpOverlay`)이 화면을 덮고 퀴즈로 돌아가게 함. 지금은 제한 없음으로 둠(부모님 결정). AI 자동 생성은 연결 자리만 있고 비어 있습니다(`lib/ai-generator.ts`, 사용할 AI 미정).
- **아이 첫 화면 구성:** 파트너·스탯 판 아래에 탭 묶음 두 개. 위 [일일미션 | 탐험 | 포켓몬 도감 | 가방], 아래(항상 보임, 처음엔 배틀) [배틀 | 이벤트 | 선물]. 배틀 탭 = 포켓로그로 가기·미리 받아 두기·오늘 남은 새 게임 횟수·배틀 추가권·쉬는 시간이면 잠금 표시, 이벤트 탭 = "곧 열려요", 선물 탭 = 받은 선물 목록·열기·답장.
- **보호자 선물(`state.gifts`, `Gift`):** 보호자 공간 "선물 보내기"(보낸 사람 엄마/아빠는 기기 localStorage `pq-gift-sender`에 기억, 이유 4개+직접 입력, 크기 작은/보통/큰, 한 줄 편지) → `sendGift`(한도 `settings.gift_limits`, 기본 `GIFT_LIMIT_DEFAULT` 작은 하루 2·보통 하루 1·큰 주 1(월~일), `giftCounts`). 아이는 `openGift` 액션으로 둘 중 하나를 고름(`GIFT_SIZES`: 작은 = 경험치 +30 또는 계열 열매 / 보통 = 랜덤상자(DAILY_BOX_TABLE 1개) 또는 사탕 3개 / 큰 = 몬스터볼 또는 배틀 추가권 `state.battleTickets`). 추가권은 `startBattle`이 하루 횟수를 다 썼을 때 1장 소모(`battleStartsAvailable`), 쉬는 시간·시간 제한은 그대로 적용. 아이 화면은 1분마다 `/api/game`을 다시 읽어(`POLL_MS`) 안 연 선물이 있으면 `GiftPopup`(세션 안에서 한 번씩) → `GiftOpenDialog` → 볼이면 `BallDialog` → `ReplyDialog`. 시뮬레이션 중 보낸 선물은 `playerOf`대로 시험용 기록으로만 감.
- **아이 답장(`Gift.reply`):** `replyGift` 액션(스티커 `REPLY_STICKERS` 5개 = 새싹 동글이 `public/assets/stickers/<key>.svg`(부모님 샘플 파일의 그림 그대로), 글 30자 `REPLY_TEXT_MAX`, 선물 하나에 한 번). 보호자 공간 맨 위 "새 답장 N개"(`unseenReplies`, "확인했어요" = `markRepliesSeen`), 보낸 선물 기록 표에 스티커·글.
- **배틀 쉬는 시간(`lib/battle-rest.ts`):** `settings.battle_rest`(규칙 목록 `RestRule {id,name,days,start,end}`, 없으면 `BATTLE_REST_DEFAULT`: 일과 시간 월~금 07:30~18:00, 잠자는 시간 매일 22:30~07:30; 끝이 시작보다 빠르면 다음 날까지 — `ruleActive`가 전날 시작분도 봄), `settings.battle_rest_open`(오늘만 열어 주기 날짜, 그날만 유효). 판단은 `playerOf(request).clock`(서버 한국 시간 `nowKorea`; 시뮬레이션이면 `settings.sim_clock` 'HH:MM', 개발자 메뉴 `simSetClock`). `lib/server/battle-gate.ts` `battleGate`가 시간 제한과 합쳐 `blocked`를 내고 `/api/battle` GET/POST(새 게임·이어하기 모두 거부: 게임 시작 때 `canStartNewBattle`이 덮개 표시), `/api/battle/progress`(응답 `rest.soon` → 게임 `showQuizToast` 10분 전 안내, `blocked` → `quitAfterBattle` 표시 후 웨이브가 바뀔 때 `saveAll` 하고 `/`로), `/api/game`(`battleGate` → 배틀 탭 잠금 표시)이 씀. 퀴즈(일일미션·탐험)는 막지 않음.
- **버전 표시:** `lib/version.ts`의 `APP_VERSION`(버전 이름)과 `CHANGES`(이번에 바뀐 것)를 새 기능을 올릴 때마다 고칩니다. 날짜는 빌드 때 `__BUILD_DATE__`(한국 시간)로 자동. 화면에는 "1.4 (2026-09-28)" 형식. `__APP_VERSION__`(커밋 앞 7자리)은 자동 새로고침·올린 버전 확인용으로 그대로 씁니다.
- **보호자 공간 개발자 메뉴 / 시뮬레이션:** 아이의 진짜 기록은 `game_state` 의 `family`, 시험용 기록은 `sim` (`lib/server/store.ts` 의 `PlayerId`). `lib/server/player.ts` 의 `playerOf(request)`가 서명 쿠키 `pq_sim`(보호자 비밀번호로 서명, 7일)을 보고 어느 기록과 어떤 "오늘"(진짜 오늘 + `settings.sim_day_offset`)을 쓸지 정하며, 게임·탐험·포켓로그(`/api/battle`, `/api/battle/progress`, `/api/my-pokemon`) 라우트가 모두 이를 씁니다. 보호자 API 동작: `simStart`(source copy|empty, 쿠키 발급), `simNextDay`, `simStop`(쿠키 삭제). 아이 화면과 포켓로그 첫 화면(`scripts/build-battle.mjs` 의 gate script)은 시뮬레이션 중이면 보라색 띠를 보여 주고 누르면 `/parent`로 갑니다. 포켓로그 게임 자체의 브라우저 저장(진행 중인 판)은 기기별이라 시험용과 나뉘지 않습니다. 보호자 공간의 "아이 게임 처음부터 다시 하기" 칸은 항상 맨 아래에 둡니다.
- **그림:** 아이템 7종은 부모님이 그린 그림, 랜덤상자는 부모님 그림, 볼 5종과 속성 아이콘 18종은 포켓몬 공식 그림(PokeAPI)입니다. 나머지(배경, 로고)는 임시 그림이고, 부모님이 새 그림을 주면 `public/assets/`에 넣습니다. 포켓몬 그림은 빌드 전에 `scripts/fetch-pokemon-art.mjs`(`prebuild`)가 PokeAPI 저장소의 공식 일러스트 1,025장을 `public/assets/pokemon/`(git 제외, Actions 캐시)에 받아 우리 사이트에서 직접 내보내고, 없을 때만 포켓몬코리아·pokemon.com 순으로 대신 씁니다(`pokemonImages`).
- **포켓로그 최고 레벨:** 게임이 1분마다 보내는 진행 보고에 파티 레벨(`party: [{species, starter, level}]`)이 들어 있고, `recordBattleLevels`가 진화 계열 첫 모습(`starter`) 기준 최고 레벨을 `state.battleLevels`에 남깁니다. 도감 카드와 첫 화면 파트너에 "포켓로그 최고 Lv."로 표시(`rootOf`로 계열 첫 모습을 찾음). 판 안 레벨은 원본대로 새 판마다 5부터 다시 시작.

## 포켓로그(battle/) — 게임용 작업본 `claude/battle-pokerogue`

- `battle/`는 포켓로그 포크(`i20091119-ai/pokerogue-westjun` beta)를 git subtree(--squash)로 가져온 별도 프로젝트입니다. 사양서는 `battle/SPEC.md`. 퀴즈 앱의 lint·tsconfig에서는 제외되어 있습니다.
- 퀴즈 앱의 `/battle/` 주소에서 열립니다. `npm run build:battle`(`scripts/build-battle.mjs`)이 pnpm으로 만들어 `dist/client/battle/`에 넣습니다 (node 24 필요, 로그인 없이 브라우저 저장 모드 `VITE_BYPASS_LOGIN=1`).
- 그림·소리(원본 submodule `assets`, 3만 2천 개·817MB)와 번역(`locales`)은 빌드 때 고정 커밋(`lib/battle-assets.ts`, `scripts/build-battle.mjs`)으로 받아 정적 파일로 함께 올립니다 (Cloudflare 유료 요금제, 파일 수 한도 10만 개). 배경음악 170곡은 ffmpeg로 모노 64k로 다시 압축해 스마트폰에서 가볍게 받게 합니다. 혹시 빠진 파일은 `app/battle/[...path]/route.ts`가 원본 저장소에서 가져옵니다.
- 앱 정보 파일(manifest.webmanifest)의 시작 주소를 `/battle/`로 고쳐 스마트폰 "홈 화면에 추가"가 포켓로그로 열리게 합니다.
- 개발자 메뉴 작업본 `claude/dev-menu`도 같은 미리보기 사이트에 올라갑니다(마지막에 올린 작업본이 보임). 미리보기 Worker에 `PARENT_PASSWORD`를 넣어야 보호자 공간(개발자 메뉴)을 시험할 수 있습니다.
- 게임 작업본은 `.github/workflows/deploy-preview.yml`이 **미리보기 사이트**(Worker `poke-quiz-preview`, 기록 저장소 `poke-quiz-preview-db`)에 올립니다. 퀴즈 작업본에 합치면 진짜 게임의 자동 올리기(`deploy.yml`)가 `/battle`까지 함께 올립니다. 포켓로그 항목은 사양서 순서대로 게임 작업본에서 만들고, 원본 규칙을 바꿔야 하는 것이 나오면 부모님께 먼저 묻습니다.
- **사양서 진행 상황:** 1번(출전 포켓몬) 완료 — 퀴즈 앱 `GET /api/my-pokemon`(보유 포켓몬 전국도감 번호) → 포켓로그 `src/quiz-link.ts`가 스타터(진화 전 첫 모습)로 바꿔 `defaultStarterSpecies`를 채우고, `game-data.ts`가 실행마다 해제 범위를 이 목록으로 다시 맞춤. 스타터 포인트 한도 15. 퀴즈에서 진화시킨 포켓몬은 **진화한 모습으로 출전**(레벨은 시작 레벨 5 그대로, 부모님 결정 2026-09-28): `quiz-link.ts`의 `quizStartingSpecies`가 고른 스타터 계열 중 퀴즈 보유 종에서 가장 많이 진화한 종을 돌려주고 `select-starter-phase.ts`가 그 종으로 파티를 만듦(`QUIZ_RULES.startEvolved`). 기본 게임 속도는 한 단계 올림(`default-settings.ts` FAST, 이미 쓰던 기기는 설정에서 직접 바꿔야 함). 튜토리얼 문구는 터치 기준(`battle-extras/locales-ko/tutorial.json`). 2번(포획 금지)·3번(이벤트 포켓몬 → 파티 이로치; 이 이로치는 유일한 예외로 판이 끝나도 내 소유로 남음 — `src/quiz-gifts.ts`의 `keepShinyGiftForever`가 스타터 도감에 이로치 비트를 남기고, `game-data.ts` 초기화 때 `SHINY_KEEP_BITS`만 보존)·4번(알 시스템·유전자쐐기 제거, 클래식만)·5번(55웨이브 클리어, `QUIZ_RULES.finalWave`; `isWaveFinal`(200)은 지역·보스 구성용이라 그대로 두고 `isWaveClear`로 클리어만 판정)·6번(판 안 진화는 퀴즈 앱에 반영 안 함 — 게임이 퀴즈 앱에 쓰는 것이 없고, 도감 해제도 실행마다 기본값으로 되돌림)·7번(하루 1회 새 게임: 퀴즈 서버 `GET/POST /api/battle`, `BATTLE_STARTS_PER_DAY`, 기록은 `state.battle`; 제목 화면 새 게임에서 확인하고 스타터 확정 때 차감, 이어하기는 차감 없음; 게임이 1분마다 `POST /api/battle/progress`로 웨이브·플레이 초를 보내 `state.battleLog[날짜]`에 최고 웨이브·시간·새 게임 횟수를 쌓고 보호자 공간 "포켓로그 기록" 표에 최근 14일을 보여 줌)·8번(데이터 절약: `battle-extras/service-worker.js`가 원본 빈 서비스 워커를 대신해 게임 파일을 Cache Storage에 두고(파일 3만 개라 `cache.keys()`가 스마트폰에서 "Operation too large"로 실패하므로 경로 해시로 저장소 16개 `battle-assets-0~15`에 나눔, 옛 `battle-assets` 하나는 activate 때 삭제), `/battle/prepare` 페이지의 "게임 준비하기"로 전체 미리 받기; 파일 목록 `prefetch-manifest.json`은 빌드가 만듦)·10번(한국어 고정 `lng: "ko"`, 언어 메뉴 제거, 번역 빠진 80문장은 `battle-extras/locales-ko/`에서 빌드 때 덮어씀) 완료. 원본 안내문 정리(`QUIZ_RULES.hideOriginalNotices`): 제목 화면의 계정 이름(Guest)·접속자 수 숨김, 메뉴의 커뮤니티 항목 제거, 디스코드·위키를 안내하던 문장은 `battle-extras/locales-ko/`(tutorial·menu·splash-texts)에서 퀴즈용 문장으로 바꿈. 9번(가족만 접속): 부모님 결정으로 **앱 안 비밀번호 문** — 보호자 공간에서 포켓로그 비밀번호를 정하면(`settings.battle_password`에 서명값만 저장) 게임을 켜는 데 꼭 필요한 파일(`/battle/assets/*` 게임 코드, `asset-manifest.json`, `prepare`, `service-worker.js`, `login`)만 `wrangler.jsonc`의 `run_worker_first`로 Worker가 먼저 받아(그림·소리·번역은 검문 없이 정적으로 바로 나가야 로딩이 빠름) `app/battle/[[...path]]/route.ts`가 쿠키(`pq_battle`, 1년)를 확인하고 정적 파일을 `env.ASSETS`로 내보냄. 첫 화면(index.html)만 정적으로 열리고, 그 안의 확인 스크립트가 잠겨 있으면 `/battle/login`으로 보냄. `PARENT_PASSWORD`가 없는 곳(미리보기)에서는 문이 열려 있음. 11번(성장 요소, 부모님 결정): **일일미션을 다 풀면 파트너 포켓몬(의 진화 전 첫 모습)에게 포켓로그 사탕**을 보냄 — `DAILY_CANDY`(다 풀면 1, 모두 맞히면 3), 하루 1번, `settleDailyCandy`가 `state.candy.pending`에 쌓고 `GET/POST /api/battle/candy`로 게임이 가져감(`battle/src/quiz-link.ts`의 `applyQuizCandyGifts`, LoginPhase에서 저장 데이터 읽은 직후 `addStarterCandy` + `saveSystem`, 넣은 묶음 번호는 기기 localStorage `quizCandyApplied`에 기억). 게임 안에서 원래 방식으로 모이는 사탕은 그대로 더해짐. 진화시킨 포켓몬은 진화한 모습으로 출전(부모님 확정, 처음엔 진화 전 모습이었다가 바꿈). 사파리존 이벤트는 나오지 않게 함(부모님 확정). 바꾼 규칙 스위치는 `battle/src/quiz-rules.ts`에 모음.
- 헤드리스 크로미움에는 mp4 코덱이 없어 로컬 Playwright에서는 로딩 화면(evo_bg.mp4)에서 멈춥니다. 실제 확인은 미리보기 사이트에서 합니다.

## 인터넷에 올리기

**자동:** 작업본에 저장해서 올리면 GitHub 자동 작업(`.github/workflows/deploy.yml`)이 검사·만들기·Cloudflare 올리기·버전 확인까지 합니다. GitHub 저장소 Secrets에 `CLOUDFLARE_API_TOKEN`이 있어야 합니다. Cloudflare 계정은 `wrangler.jsonc`의 `account_id`(부모 본인 계정)이고, 기록 저장소 번호는 자동 작업이 채웁니다. 보호자 비밀번호는 Cloudflare 화면(Workers → poke-quiz → Settings → Variables and Secrets)에서 부모가 직접 넣습니다. 옛 계정(애 엄마 로그인)의 기록은 `data/restore.sql`로 한 번 옮깁니다. 결과는 GitHub Actions 기록으로 확인합니다(부모님께 맥 명령을 안내할 필요 없음).

**예비 방법:** 맥 터미널에서 게임 폴더로 이동한 뒤 `npm run online`을 실행합니다(`scripts/online.mjs`). 로그인, 저장소, 표, 올리기, 비밀번호까지 알아서 진행하고, 이미 된 단계는 건너뜁니다. 코드를 고친 뒤 다시 올릴 때도 같은 명령 하나면 됩니다(새 버전 받기를 스스로 함). 열려 있던 게임 화면은 새 버전을 알아채면 스스로 한 번 새로고침합니다. 화면 맨 아래 "버전"으로 올라간 버전을 확인할 수 있습니다.

## 작업할 때 확인할 것

바꾼 뒤에는 아래를 모두 통과시킨 다음 저장해서 올립니다.
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
