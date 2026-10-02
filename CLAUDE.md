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
  - 1→2단계: 30 (속성 2개면 20+10)
  - 2→3단계: 80 (속성 2개면 55+25)
  - **센 포켓몬(`lib/strong-pokemon.ts`, 부모님이 고치는 파일):** 희귀 등급(잡기 어려운 포켓몬, `tier>=2`) 진화형 + 인기 포켓몬 `POPULAR_STRONG`(피카츄·라이츄·후딘)은 `isStrong`, 비용 `EVOLUTION_COST_STRONG`(약 1.2배: 1→2 36 / 24+12, 2→3 96 / 66+30). 그중 절반쯤(희귀 최종형 195종 중 100종)은 `THIRD_TYPE` "도전 속성"이 있어 원래 두 속성과 다른 과목의 속성까지 필요(3과목, 1→2 20+10+6, 2→3 55+25+16). 도전 속성은 이야기·기술에 맞게 고름(예: 리자몽 불꽃·비행 + 악). 시작 포켓몬 3계열도 센 포켓몬. 도감 진화 칸에 💥 표시. **보호자 공간 전체 설정 탭 "속성 변경"**(`StrongEditor`: 그림·이름·속성 격자, 그림을 누르면 `StrongDialog` 팝업에서 수정)에서 부모님이 센 포켓몬 여부·도전 속성을 바꿈: 바꾼 것만 `settings.strong_overrides`(`{strong:{id:bool}, third:{id:type|""}}`)에 저장, 보호자 동작 `setStrongPokemon`·`setThirdType`(null = 처음 값)·`resetStrong`. 계산은 `lib/pokedex.ts`의 모듈 설정 `setStrongOverrides`로 맞춤: 서버는 요청마다 `loadStrongOverrides`, 아이·보호자 화면은 응답의 `strong`으로. 3과목이 안 되는 도전 속성은 거절·무시(`isValidThird`). 테스트가 3과목 여부와 비율(40~60%)을 검사.
  - 부모님 결정(2026-09-29): 3일 만에 도감 36마리(대부분 진화)가 되어 2배로 올리고, 센 모습일수록 훨씬 많이 들게 함(원래 15·35). 일일미션만 풀면 2주쯤에 첫 진화가 되는지 확인하는 시뮬레이션 테스트와, 2→3단계가 1→2단계의 2배를 넘는지 보는 테스트가 있습니다.
- **문제은행:** 보호자가 주차별로 만들어 구글 시트 링크나 CSV로 올립니다. 문제마다 **영역**(`questions.area`, 시트 열 "영역", 비우면 '기타')이 있고, 영역 이름은 아이 엄마가 확정함(`lib/game-config.ts`의 `SUBJECT_AREAS`, 출제 규칙 전문은 `data/banks/AREA-RULES.md`): 국어 받침·맞춤법/낱말 뜻/흉내말·반대말/부호·띄어쓰기/내용 확인/생각·까닭, 수학 수·계산/규칙/모양·측정/분류·자료(서술형 30%: 빈칸 문장·틀린 곳 찾기 ㉠~㉤·알맞은 식·이유 고르기), 영어 알파벳/파닉스/사이트워드/기본 단어/문장 만들기, 한자 숫자/요일·자연/방향·위치/사람·가족/학교·나라/색·크기·기타(8급 50자만, 검정 훈음), 역사 선사·고조선/삼국·남북국/고려/조선/근현대/문화·풍속(지금은 선사·고조선 비중 높게), 상식 동식물/날씨·계절/몸·안전/동네·규칙/음악/미술. 미리 만든 연습 문제은행 3개는 `data/banks/`(과목별 원본 + `scripts/assemble-banks.mjs`로 합친 bank1~3.csv, `lib/server/prepared-banks.ts`가 `?raw`로 묶어 보호자 공간 "연습 문제은행 불러오기"로 넣음).
- **영역별 성적·약점 자동 조절:** `BankProgress.areas['과목|영역']`에 첫 시도 결과(o/x 최근 8개)를 남기고, `isWeakArea`(최근 5번 중 2번 이상 틀림)면 `ensureDaily`가 그 영역의 다른 문제를 먼저 놓음(과목당 `WEAK_AREA.maxPerSubjectDaily`=2개까지, 속성 고르게 규칙 유지). 보호자 화면 `areaReport`로 영역표·반복 오답(2번 이상) 표시.
- **활동 기록:** 아이 화면이 1분마다 `quizTime` 액션으로 화면 본 초를 보내 `state.quizLog[날짜]`(초·푼 문제·첫 시도 정답)에 쌓고, 포켓로그 `battleLog`와 함께 `activityList`로 최근 28일을 보호자 그래프(recharts, 최근 7일/4주)에 보여 줌. 보관 35일(`ACTIVITY_LOG_DAYS`).
- **이로치(색이 다른 포켓몬)·이로치 도감(2026-10-02 부모님 결정: 이로치는 퀴즈에서만 얻는다):**
  - **얻는 법:** 볼을 열 때 확률로 나옴(`SHINY_CHANCE_DEFAULT`: 몬스터볼 2%·슈퍼볼 4%·하이퍼볼 7%·마스터볼·럭셔리볼·희귀 포켓몬 볼 12%, 보호자 공간 전체 설정 탭 "이로치 확률"에서 바꿈 = `settings.shiny_chance`). **이로치 볼**(`BALLS.shiny`)은 열면 아이가 가진 포켓몬의 1단계(`rootOf`) 중 하나의 이로치가 확정(아직 이로치 없는 계열 먼저, `pickShinyBallSpecies`). 이로치 볼은 일일미션 랜덤상자(가중치 1), 도전 이벤트 10일 연속 상자(15%), 보호자 큰 선물(`shinyBall` 선택지)에 들어 있음.
  - **보유 방식:** `OwnedPokemon.shiny`(`addPokemon(state,id,now,shiny)`). 이로치는 기본 모습과 **따로 한 마리**: 이미 기본 모습을 가졌어도 이로치가 나오면 새로 얻음(스탯 +5 대신), 같은 이로치가 또 나오면 우정 보너스. 내 포켓몬 카드·파트너 고르기·열매 먹이기에 ✨ 이로치로 나오고 파트너로 고를 수 있음. **진화하면 진화한 모습도 이로치 도감에 추가**(기본 도감에는 안 들어감). 이로치 도감 = `state.shiny`(번호 목록), 퀴즈 이로치 도감에 등록된 것만 포켓로그 이로치로 출전.
  - **연출:** 이로치가 나오면 반짝이 + "✨ 이로치다!" + 색 이름(`shinyName`, 예: 오렌지키링키). 색 이름은 `scripts/shiny-colors.py`가 이로치 그림에서 뽑아 `lib/data/shiny-colors.json`에 둔 것(git 포함). 이로치 그림은 `scripts/fetch-pokemon-art.mjs`가 `public/assets/pokemon/shiny/`에 받음.
  - **포켓로그에서는 이로치를 얻을 수 없음:** 돌발 이벤트 4종은 같은 등급의 아이템 보상으로 바꿨고(`battle/SPEC.md` 3번), 포켓로그가 이로치를 퀴즈 앱에 보내던 `POST /api/battle/shiny`는 아무것도 기록하지 않음(옛 화면 호환용). 지금까지 기록된 이로치는 그대로.
  - **시뮬레이션 확인:** 개발자 메뉴 시뮬레이션의 "시험용 볼 +1씩(이로치 볼 포함)", "볼 열 때 이로치 100%"(`settings.sim_shiny_all`, 시험용 기록에만), "가진 포켓몬마다 이로치도 +1"(포켓로그 팀 선택 화면의 기본·이로치 동시 표시와 동시 출전 확인용).
- **도감 탭(아이 화면 `components/game/pokedex-tab.tsx`):** 작은 탭 [기본 도감 | ✨ 이로치 도감 | 메가 도감]. 기본 도감 = "포켓몬 도감 ○ / 1025"(기본 화면은 내 포켓몬 카드, 버튼으로 만난 포켓몬 그림 격자 — 이로치 칸은 섞지 않음), 이로치 도감 = "이로치 도감 ○ / 1025"(이로치 그림 + 색 이름 + "볼을 열 때 가끔 나오고, 이벤트에서도 얻을 수 있어요"), 메가 도감 = "메가 도감 ○ / 96"(`lib/megas.ts` `MEGAS`, 포켓로그의 메가 모습 96개. 그림은 PokeAPI 공식 일러스트 `official-artwork/<art>.png`(100xx 번)를 `public/assets/pokemon/mega/`에 받음. 0마리면 잠긴 실루엣 6개와 "특별 미션으로 열려요"). 메가는 아직 해금 방법이 없어 `state.megas`가 비어 있음(특별 미션이 생기면 `lib/megas.ts`의 key를 넣음). 메가 출전 설계는 `battle/SPEC.md` 13번(만들지 않고 기록만).
- **기간 한정 이벤트(첫 번째: 🌈 레인보우 컬러체인지, 2026-10-03~04, 부모님 요청 2026-10-02):** 설정 틀은 `lib/limited-events.ts` `LIMITED_EVENTS`(id·기간(한국 날짜, 둘 다 포함)·조건 `goal.streak`(10)·보상(`full: 'shinyChange'`, `partial: {minPieces 3, candy 3}`)·이로치 확률 배수 `shinyMultiplier`(5)·마지막 날 안내 시각 `reminderAt`(21:00)). 다음 이벤트도 여기에 한 칸 추가(id는 아이 기록 키라 바꾸지 않음). 기록 `state.limited[id]`(`LimitedProgress`: seen·acceptedAt·과목별 streak·used·missed·pieces·completedAt·changed·remindSeen·ended·endSeen, 없으면 빈 값으로 시작). 규칙(`lib/game-engine.ts`): 시작 전에는 `limitedView`가 비어 아이 화면 어디에도 안 보임(깜짝). 기간 중 처음 열면 팝업 3장(`components/game/rainbow.tsx` `RainbowIntro`, 문구는 부모님 원문 그대로) → "도전할래!" `limitedAccept` / "나중에" `limitedSeen`(이벤트 탭 카드에서 시작 가능). **탐험에서만** 과목별 연속 정답(`rainbowAnswer`): 10이면 그 과목 조각, 틀리면 그 과목만 0. **새 문제가 없는 과목(이미 마스터)은 맞힌 문제를 "레인보우 도전"으로 다시 냄**(`rainbowReplayPool`, 진도·마스터·스탯은 그대로, 오늘 틀린 다시 풀기 문제는 오늘 안 나옴). 6개 완성 → `ShinyChangeDialog`(가진 포켓몬 중 이로치 아닌 것, 파트너 포함 → 조각 6개가 날아가 변신) `limitedShinyChange`: 그 포켓몬 `shiny=true` + 이로치 도감, 포켓로그에도 이로치로. 기간 중 모든 볼 이로치 확률 ×5(`limitedShinyMultiplier`, 최대 100%). 마지막 날 21:00 이후 아직 못 모았으면 안내 한 번(`limitedNotice remind`), 끝나면 `syncLimited`가 정산(조각 3개 이상이면 파트너 사탕 3개) + 결과 팝업 한 번(`limitedNotice end`), 이벤트 탭에 "끝난 이벤트" 카드(참여한 경우만). 보호자 이벤트 기록 탭 맨 위 `LimitedRow`(예약된 시작 전 이벤트도 표시, 참여·조각·과목별 연속·완료·변신·정산) + "팝업 다시 보이게" 버튼(`limitedResetIntro` → `resetLimitedIntro`, 아이의 진짜 기록에만: "팝업 봄"을 지우고 진행이 0이면 도전 시작도 되돌림, 조각·연속·완성·변신·정산이 하나라도 있으면 되돌리지 않고 알림. 시뮬레이션 중엔 버튼 숨김). 소개 팝업은 **기기마다 한 번**(2026-10-03 부모님 요청: 보호자 폰에서 봐도 아이 폰에서는 처음처럼): 기기 브라우저에 이름표 `pq-device-id`(localStorage)를 만들고, "나중에"/닫기 때 `limitedSeen {device}`가 `seenDevices`에 기기를 남김. 도전을 시작(`acceptedAt`)하면 어느 기기에도 안 뜸. 열려 있는 화면은 1분 안에 다시 읽어 1장부터 뜸. 시뮬레이션: 개발 탭 "첫날(토) 10:00으로 / 마지막 날 21:00으로 / 끝난 다음 날로"(`simDate`, 시험용 날짜·시각), "못 모은 과목 연속 9로 / 조각 5개로 / 이벤트 기록 지우기"(`simLimited`). 활동 기록 종류 `limited`.
- **포켓로그 판 안 진화 스위치:** `settings.battle_evolution_allowed`(기본 꺼짐), 보호자 공간 포켓로그 칸 "배틀 중 진화 허용" 버튼(`setBattleEvolution`). `/api/battle` GET과 `/api/battle/progress` 응답의 `evolution`을 게임이 받아(`quiz-link.ts` `isBattleEvolutionAllowed`, 기기 localStorage에 마지막 값 기억) 꺼져 있으면 `pokemon.ts` `getEvolution`이 플레이어 포켓몬에 null을 주고, `init-modifier-pools.ts`가 진화 아이템 가중치를 0으로 둠. 부모님 결정(2026-09-28): 진화는 퀴즈 스탯으로만.
- **포켓로그 하루 시간 제한:** `settings.battle_limit_minutes`(0 = 없음, 기본), 보호자 공간 포켓로그 칸에서 선택. `/api/battle` GET/POST가 `timeUp`이면 새 게임 거부, `/api/battle/progress` 응답의 `timeUp`을 보고 게임(`quiz-link.ts` `showTimeUpOverlay`)이 화면을 덮고 퀴즈로 돌아가게 함. 지금은 제한 없음으로 둠(부모님 결정). AI 자동 생성은 연결 자리만 있고 비어 있습니다(`lib/ai-generator.ts`, 사용할 AI 미정).
- **아이 첫 화면 구성:** 파트너·스탯 판 아래에 탭 묶음 두 개. 위 [일일미션 | 탐험 | 포켓몬 도감 | 가방], 아래(항상 보임, 처음엔 배틀) [배틀 | 이벤트 | 선물]. 배틀 탭 = 포켓로그로 가기·미리 받아 두기·오늘 남은 새 게임 횟수·배틀 추가권·쉬는 시간이면 잠금 표시, 이벤트 탭 = "곧 열려요", 선물 탭 = 받은 선물 목록·열기·답장.
- **보호자 선물(`state.gifts`, `Gift`):** 보호자 공간 "선물 보내기"(보낸 사람 엄마/아빠는 기기 localStorage `pq-gift-sender`에 기억, 이유 4개+직접 입력, 크기 작은/보통/큰, 한 줄 편지) → `sendGift`(한도 `settings.gift_limits`, 기본 `GIFT_LIMIT_DEFAULT` 작은 하루 2·보통 하루 1·큰 주 1(월~일), `giftCounts`). 아이는 `openGift` 액션으로 둘 중 하나를 고름(`GIFT_SIZES`: 작은 = 경험치 +30 또는 계열 열매 / 보통 = 랜덤상자(DAILY_BOX_TABLE 1개) 또는 사탕 3개 / 큰 = 몬스터볼 또는 배틀 추가권 `state.battleTickets`). 추가권은 `startBattle`이 하루 횟수를 다 썼을 때 1장 소모(`battleStartsAvailable`), 쉬는 시간·시간 제한은 그대로 적용. 아이 화면은 1분마다 `/api/game`을 다시 읽어(`POLL_MS`) 안 연 선물이 있으면 `GiftPopup`(세션 안에서 한 번씩) → `GiftOpenDialog` → 볼이면 `BallDialog` → `ReplyDialog`. 시뮬레이션 중 보낸 선물은 `playerOf`대로 시험용 기록으로만 감.
- **아이 답장(`Gift.reply`):** `replyGift` 액션(스티커 `REPLY_STICKERS` 5개 = 새싹 동글이 `public/assets/stickers/<key>.svg`(부모님 샘플 파일의 그림 그대로), 글 30자 `REPLY_TEXT_MAX`, 선물 하나에 한 번). 보호자 공간 맨 위 "새 답장 N개"(`unseenReplies`, "확인했어요" = `markRepliesSeen`), 보낸 선물 기록 표에 스티커·글.
- **도전 이벤트(이벤트 탭, `components/game/events.tsx`):** `state.events.allClear`(수락일·수락 때 문제은행 id·마스터한 과목 목록(수락 전 마스터도 인정, 문제은행이 바뀌어도 남고 이후 공개 은행의 마스터도 더함)·완료일·축하 봄) / `state.events.streak`(연속 일수·마지막으로 다 푼 날·최고·완료일·상자). `syncEvents`가 `/api/game` GET·POST 때마다 진도를 맞춤(어제나 오늘 다 풀었으면 이어짐, 아니면 0). `acceptEvent`(도전할래!), `eventSeen`(올클리어 축하 창 닫으면 카드 숨김), `eventBox`(10일 연속 상자: `streakBoxItems` 희귀 포켓몬 볼 `rare` 또는 배틀 추가권 `BoxItem {kind:'ticket'}`, 세 칸이 모두 같지 않게). 희귀 볼 후보는 부모님이 고치는 `lib/rare-pokemon.ts`(1단계·전설 아님은 테스트로 확인, 아직 없는 계열 먼저 `pickRarePokemon`). 보호자 학습 현황 탭 `EventsSection`, 시뮬레이션 도우미 `simGiveRevive`·`simStreak`.
- **부활권(`state.reviveTickets`, 올클리어 보상):** 게임 오버 판은 원본 "플레이 기록"(기기 `runHistoryData_Guest`)과 함께 퀴즈 서버 표 `battle_runs`(`migrations/0003_battle_runs.sql`, 기록마다 최근 30판)에 올림(`quiz-link.ts` `reportQuizRun`, 게임을 열 때 `syncQuizRunHistory`로 기기에 있던 것도). 게임 오버 화면(`game-over-phase.ts`)에서 `offerQuizRevive`가 "부활권을 쓸까?"를 묻고 `POST /api/battle/revive {mode:'gameover'}` 후 웨이브 시작 저장을 `healSessionData`로 체력 가득·상태 이상 없앤 뒤 원본 "다시 도전" 순서(`restartWave`)로 그 웨이브를 다시 시작. 진행 중인 판이 없으면(기기 `sessionData*_Guest` 없음, `lib/battle-save.ts`) 배틀 탭 "부활권으로 ○○웨이브 판 되살리기" → `{mode:'history', runId}`로 서버의 판 저장을 받아 체력 가득 채워 첫 슬롯에 넣고 `/battle/`로(게임은 `quizRevived` 표시를 보고 "계속하기를 눌러" 안내). 새 게임 횟수는 쓰지 않고 쉬는 시간·시간 제한은 `battleGate`로 지킴.
- **배틀 쉬는 시간(`lib/battle-rest.ts`):** `settings.battle_rest`(규칙 목록 `RestRule {id,name,days,start,end}`, 없으면 `BATTLE_REST_DEFAULT`: 일과 시간 월~금 07:30~18:00, 잠자는 시간 매일 22:30~07:30; 끝이 시작보다 빠르면 다음 날까지 — `ruleActive`가 전날 시작분도 봄), `settings.battle_rest_open`(오늘만 열어 주기 날짜, 그날만 유효). 판단은 `playerOf(request).clock`(서버 한국 시간 `nowKorea`; 시뮬레이션이면 `settings.sim_clock` 'HH:MM', 개발자 메뉴 `simSetClock`). `lib/server/battle-gate.ts` `battleGate`가 시간 제한과 합쳐 `blocked`를 내고 `/api/battle` GET/POST(새 게임·이어하기 모두 거부: 게임 시작 때 `canStartNewBattle`이 덮개 표시), `/api/battle/progress`(응답 `rest.soon` → 게임 `showQuizToast` 10분 전 안내, `blocked` → `quitAfterBattle` 표시 후 웨이브가 바뀔 때 `saveAll` 하고 `/`로), `/api/game`(`battleGate` → 배틀 탭 잠금 표시)이 씀. 퀴즈(일일미션·탐험)는 막지 않음.
- **버전 표시:** `lib/version.ts`의 `APP_VERSION`(버전 이름)과 `UPDATES`(날짜별 바뀐 것, 최신 날짜가 맨 위, 날짜마다 `version`·`items`)를 새 기능을 올릴 때마다 고칩니다. 맨 위 날짜(오늘이면 거기에, 아니면 오늘 날짜를 새로)에 한 줄(70자 이내, 하루 8줄 이하)씩 넣고 맨 위 `version`은 `APP_VERSION`과 같게(`lib/version.test.ts`가 검사). 보호자 공간 업데이트 탭에서 날짜별로 접혀 보이고 가장 최신 날짜만 펼쳐 둠. 날짜는 빌드 때 `__BUILD_DATE__`(한국 시간)로 자동. 화면에는 "1.4 (2026-09-28)" 형식. `__APP_VERSION__`(커밋 앞 7자리)은 자동 새로고침·올린 버전 확인용으로 그대로 씁니다.
- **보호자 공간 개발자 메뉴 / 시뮬레이션:** 아이의 진짜 기록은 `game_state` 의 `family`, 시험용 기록은 `sim` (`lib/server/store.ts` 의 `PlayerId`). `lib/server/player.ts` 의 `playerOf(request)`가 서명 쿠키 `pq_sim`(보호자 비밀번호로 서명, 7일)을 보고 어느 기록과 어떤 "오늘"(진짜 오늘 + `settings.sim_day_offset`)을 쓸지 정하며, 게임·탐험·포켓로그(`/api/battle`, `/api/battle/progress`, `/api/my-pokemon`) 라우트가 모두 이를 씁니다. 보호자 API 동작: `simStart`(source copy|empty, 쿠키 발급), `simNextDay`, `simStop`(쿠키 삭제). 아이 화면과 포켓로그 첫 화면(`scripts/build-battle.mjs` 의 gate script)은 시뮬레이션 중이면 보라색 띠를 보여 주고 누르면 `/parent`로 갑니다. 포켓로그 게임 자체의 브라우저 저장(진행 중인 판)은 기기별이라 시험용과 나뉘지 않습니다. 보호자 공간은 맨 위 아이 현황 요약(새 답장 배지) + 아이 화면처럼 탭 묶음 두 개: 위 `MAIN_TABS` 두 줄 [학습 현황(스탯·활동 그래프·영역별 성적) | 선물 | 이벤트 기록 / 포켓로그 기록(날짜별 표·사탕) | 문제은행(목록)], 그 아래 항상 보이는 `LOWER_TABS` [배틀 설정(쉬는 시간·시간 제한·판 안 진화·비밀번호) | 전체 설정(기본 학년·이로치 확률·속성 변경) | 개발(시뮬레이션·아이 기록 내보내기) | 업데이트(바뀐 내용)]. (영역별 성적은 `seedAreaStats`가 영역 기능 전에 푼 문제를 지난 기록(맞힌 문제·틀린 횟수)으로 한 번 채우고, 최근 결과는 비워 약점으로는 잡지 않음.) 고른 탭은 기기 localStorage `pq-parent-tab4`에 기억합니다. 새 칸은 알맞은 탭에 넣습니다. "아이 게임 처음부터 다시 하기" 칸은 개발 탭의 맨 아래에 항상 둡니다.
- **활동 기록·아이 기록 내보내기(2026-10-02):** 개발 탭 "아이 기록 내보내기" = 보호자 동작 `exportChild`(`lib/child-export.ts` `buildChildExport`)가 아이의 **진짜 기록**(`REAL_PLAYER`, 시뮬레이션 중이어도 시험용은 안 들어감)과 새 표 `activity_log`(`migrations/0004_activity_log.sql`; player·at·date·kind·ukey·data)를 한국어 JSON 한 파일로 만들고, 화면이 `child-record-날짜.json`으로 내려받게 함. 기록 쌓기: `lib/activity-log.ts`의 `beforeAction`/`afterAction`(행동 전후 모습을 비교해 문제 풀이(고른 답·몇 번째 시도)·스탯 변화·포켓몬 얻음(얻은 방법)·진화·볼 결과·상자 고른 것·아이템·사탕·선물 열기/답장·이벤트 변화를 `LogEntry`로), `/api/game` POST(그리고 이벤트가 바뀐 GET)가 `appendActivity`(store.ts)로 저장. 기록 만들기 오류는 `safeLog`로 삼켜 게임 동작을 막지 않음. 그 밖에 `giftSent`(보호자 sendGift), `battleStart`(/api/battle POST), `battleRun`(/api/battle/runs: 새로 올라온 판의 웨이브·결과·파티 레벨, 판 저장은 30판만 남지만 이 기록은 계속), `revive`(/api/battle/revive; 게임 오버 화면에서 쓴 부활권은 판이 끝나기 전에 기록되므로 내보낼 때 "앞 판이 끝난 뒤~이 판 끝"으로 셈), `reset`("처음부터 다시 하기"를 누른 시점: 내보내기 본문은 그 뒤 기록만, 앞 기록은 `처음부터다시하기_이전기록`으로 따로. 포켓몬 번호표 uid가 다시 p1부터라서), `day`(하루 활동 요약, ukey = 날짜로 덮어씀: 퀴즈 시간·푼 문제·포켓로그 시간·웨이브). 시험용(`sim`) 기록은 아예 쓰지 않고 기록 저장이 실패해도 게임은 계속(오류만 로그). 시작일은 `settings.activity_log_since`(처음 쓴 날), 파일 맨 앞 `기록시작`에 항목별 시작일(그 종류의 첫 기록 날짜). 새 항목을 더 남기려면 `afterAction`에 추가하고 `LOG_KINDS`·`buildChildExport`에 이름을 넣음.
- **그림:** 아이템 7종은 부모님이 그린 그림, 랜덤상자는 부모님 그림, 볼 5종과 속성 아이콘 18종은 포켓몬 공식 그림(PokeAPI)입니다. 나머지(배경, 로고)는 임시 그림이고, 부모님이 새 그림을 주면 `public/assets/`에 넣습니다. 포켓몬 그림은 빌드 전에 `scripts/fetch-pokemon-art.mjs`(`prebuild`)가 PokeAPI 저장소의 공식 일러스트 1,025장을 `public/assets/pokemon/`(git 제외, Actions 캐시)에 받아 우리 사이트에서 직접 내보내고, 없을 때만 포켓몬코리아·pokemon.com 순으로 대신 씁니다(`pokemonImages`).
- **포켓로그 최고 레벨:** 게임이 1분마다 보내는 진행 보고에 파티 레벨(`party: [{species, starter, level}]`)이 들어 있고, `recordBattleLevels`가 진화 계열 첫 모습(`starter`) 기준 최고 레벨을 `state.battleLevels`에 남깁니다. 도감 카드와 첫 화면 파트너에 "포켓로그 최고 Lv."로 표시(`rootOf`로 계열 첫 모습을 찾음). 판 안 레벨은 원본대로 새 판마다 5부터 다시 시작.

- **홈 화면 앱 설치(PWA):** `public/manifest.webmanifest`(id·start_url·scope `/`, standalone, 방향 `any`, 이름 "포켓몬 배움 탐험대"/짧은 이름 "배움탐험대"), 아이콘 `public/icons/`(앱 로고 기준, `scripts/make-app-icons.mjs`로 만듦: 192·512 any + maskable + apple-touch-icon 180), `app/layout.tsx`의 metadata(manifest·apple·themeColor)와 `components/pwa.tsx`가 루트 서비스 워커 `public/sw.js`(파일 저장 없음, 화면 이동만 인터넷 끊기면 안내 화면; `/battle/`·`/api/`는 건드리지 않음)를 등록. 크롬 설치 조건은 로컬에서 CDP `Page.getInstallabilityErrors` 빈 목록으로 확인. `/battle/`은 앱 범위 `/` 안이라 같은 앱 창에서 열리고, 설치한 앱 안에서는 `openParent`가 새 창 대신 같은 창으로 보호자 공간을 엶(`isInstalledApp`). 화면 방향(부모님 요청): 설치한 앱에서 퀴즈 화면은 `components/pwa.tsx` `lockPortrait`로 세로 고정, 포켓로그는 `quiz-link.ts` `lockLandscape`(`QUIZ_RULES.landscapeInApp`, 터치 휴대폰이면 설치 여부와 상관없이): 조용히 가로 고정을 시도하고, 그래도 세로면 "가로로 크게 보기" 안내 창 → 누르면 전체 화면 + `screen.orientation.lock("landscape")`(휴대폰은 전체 화면이어야 허락하는 경우가 많음, 2026-09-29 아이 폰에서 조용한 고정은 실패 확인). "그냥 세로로 할래"는 그 실행 동안만 다시 안 물음. 포켓로그 자체 manifest(범위 `/battle/`)는 예전처럼 남아 있어 브라우저에서 포켓로그만 따로 홈 화면에 둘 수도 있음.

## 포켓로그(battle/) — 게임용 작업본 `claude/battle-pokerogue`

- `battle/`는 포켓로그 포크(`i20091119-ai/pokerogue-westjun` beta)를 git subtree(--squash)로 가져온 별도 프로젝트입니다. 사양서는 `battle/SPEC.md`. 퀴즈 앱의 lint·tsconfig에서는 제외되어 있습니다.
- 퀴즈 앱의 `/battle/` 주소에서 열립니다. `npm run build:battle`(`scripts/build-battle.mjs`)이 pnpm으로 만들어 `dist/client/battle/`에 넣습니다 (node 24 필요, 로그인 없이 브라우저 저장 모드 `VITE_BYPASS_LOGIN=1`).
- 그림·소리(원본 submodule `assets`, 3만 2천 개·817MB)와 번역(`locales`)은 빌드 때 고정 커밋(`lib/battle-assets.ts`, `scripts/build-battle.mjs`)으로 받아 정적 파일로 함께 올립니다 (Cloudflare 유료 요금제, 파일 수 한도 10만 개). 배경음악 170곡은 ffmpeg로 모노 64k로 다시 압축해 스마트폰에서 가볍게 받게 합니다. 혹시 빠진 파일은 `app/battle/[...path]/route.ts`가 원본 저장소에서 가져옵니다.
- 앱 정보 파일(manifest.webmanifest)의 시작 주소를 `/battle/`로 고쳐 스마트폰 "홈 화면에 추가"가 포켓로그로 열리게 합니다.
- 개발자 메뉴 작업본 `claude/dev-menu`도 같은 미리보기 사이트에 올라갑니다(마지막에 올린 작업본이 보임). 미리보기 Worker에 `PARENT_PASSWORD`를 넣어야 보호자 공간(개발자 메뉴)을 시험할 수 있습니다.
- 게임 작업본은 `.github/workflows/deploy-preview.yml`이 **미리보기 사이트**(Worker `poke-quiz-preview`, 기록 저장소 `poke-quiz-preview-db`)에 올립니다. 퀴즈 작업본에 합치면 진짜 게임의 자동 올리기(`deploy.yml`)가 `/battle`까지 함께 올립니다. 포켓로그 항목은 사양서 순서대로 게임 작업본에서 만들고, 원본 규칙을 바꿔야 하는 것이 나오면 부모님께 먼저 묻습니다.
- **사양서 진행 상황:** 1번(출전 포켓몬) 완료 — 퀴즈 앱 `GET /api/my-pokemon`(보유 포켓몬 전국도감 번호) → 포켓로그 `src/quiz-link.ts`가 스타터(진화 전 첫 모습)로 바꿔 `defaultStarterSpecies`를 채우고, `game-data.ts`가 실행마다 해제 범위를 이 목록으로 다시 맞춤. 스타터 포인트 한도 15. 퀴즈에서 진화시킨 포켓몬은 **진화한 모습으로 출전**(레벨은 시작 레벨 5 그대로, 부모님 결정 2026-09-28): `quiz-link.ts`의 `quizStartingSpecies`가 고른 스타터 계열 중 퀴즈 보유 종에서 가장 많이 진화한 종을 돌려주고 `select-starter-phase.ts`가 그 종으로 파티를 만듦(`QUIZ_RULES.startEvolved`). 기본 게임 속도는 한 단계 올림(`default-settings.ts` FAST, 이미 쓰던 기기는 설정에서 직접 바꿔야 함). 튜토리얼 문구는 터치 기준(`battle-extras/locales-ko/tutorial.json`). 2번(포획 금지)·3번(이벤트 이로치 — 2026-10-02에 **끔**: 포켓로그에서는 이로치를 얻을 수 없고 돌발 이벤트 4종은 같은 등급 아이템 보상. 이로치 출전은 `battle/SPEC.md` 12번: 퀴즈 이로치 도감에 있는 이로치만, 팀 선택 화면에 기본 칸·이로치 칸을 따로 보여 주고(`starter-select-ui-handler.ts` `expandShinyCells`·`markShinyCells`) 둘 다 출전 가능, 색은 공식 이로치 색 하나, 도감 해제는 `game-data.ts` `quizStarterAttr`, 시작 종은 `quizStartingSpecies(starterId, shiny)`)·4번(알 시스템·유전자쐐기 제거, 클래식만)·5번(55웨이브 클리어, `QUIZ_RULES.finalWave`; `isWaveFinal`(200)은 지역·보스 구성용이라 그대로 두고 `isWaveClear`로 클리어만 판정)·6번(판 안 진화는 퀴즈 앱에 반영 안 함 — 게임이 퀴즈 앱에 쓰는 것이 없고, 도감 해제도 실행마다 기본값으로 되돌림)·7번(하루 1회 새 게임: 퀴즈 서버 `GET/POST /api/battle`, `BATTLE_STARTS_PER_DAY`, 기록은 `state.battle`; 제목 화면 새 게임에서 확인하고 스타터 확정 때 차감, 이어하기는 차감 없음; 게임이 1분마다 `POST /api/battle/progress`로 웨이브·플레이 초를 보내 `state.battleLog[날짜]`에 최고 웨이브·시간·새 게임 횟수를 쌓고 보호자 공간 "포켓로그 기록" 표에 최근 14일을 보여 줌)·8번(데이터 절약: `battle-extras/service-worker.js`가 원본 빈 서비스 워커를 대신해 게임 파일을 Cache Storage에 두고(파일 3만 개라 `cache.keys()`가 스마트폰에서 "Operation too large"로 실패하므로 경로 해시로 저장소 16개 `battle-assets-0~15`에 나눔, 옛 `battle-assets` 하나는 activate 때 삭제), `/battle/prepare` 페이지의 "게임 준비하기"로 전체 미리 받기; 파일 목록 `prefetch-manifest.json`은 빌드가 만듦)·10번(한국어 고정 `lng: "ko"`, 언어 메뉴 제거, 번역 빠진 80문장은 `battle-extras/locales-ko/`에서 빌드 때 덮어씀) 완료. 원본 안내문 정리(`QUIZ_RULES.hideOriginalNotices`): 제목 화면의 계정 이름(Guest)·접속자 수 숨김, 메뉴의 커뮤니티 항목 제거, 디스코드·위키를 안내하던 문장은 `battle-extras/locales-ko/`(tutorial·menu·splash-texts)에서 퀴즈용 문장으로 바꿈. 9번(가족만 접속): 부모님 결정으로 **앱 안 비밀번호 문** — 보호자 공간에서 포켓로그 비밀번호를 정하면(`settings.battle_password`에 서명값만 저장) 게임을 켜는 데 꼭 필요한 파일(`/battle/assets/*` 게임 코드, `asset-manifest.json`, `prepare`, `service-worker.js`, `login`)만 `wrangler.jsonc`의 `run_worker_first`로 Worker가 먼저 받아(그림·소리·번역은 검문 없이 정적으로 바로 나가야 로딩이 빠름) `app/battle/[[...path]]/route.ts`가 쿠키(`pq_battle`, 1년)를 확인하고 정적 파일을 `env.ASSETS`로 내보냄. 첫 화면(index.html)만 정적으로 열리고, 그 안의 확인 스크립트가 잠겨 있으면 `/battle/login`으로 보냄. `PARENT_PASSWORD`가 없는 곳(미리보기)에서는 문이 열려 있음. 11번(성장 요소, 부모님 결정): **일일미션을 다 풀면 파트너 포켓몬(의 진화 전 첫 모습)에게 포켓로그 사탕**을 보냄 — `DAILY_CANDY`(다 풀면 1, 모두 맞히면 3), 하루 1번, `settleDailyCandy`가 `state.candy.pending`에 쌓고 `GET/POST /api/battle/candy`로 게임이 가져감(`battle/src/quiz-link.ts`의 `applyQuizCandyGifts`, LoginPhase에서 저장 데이터 읽은 직후 `addStarterCandy` + `saveSystem`, 넣은 묶음 번호는 기기 localStorage `quizCandyApplied`에 기억). 게임 안에서 원래 방식으로 모이는 사탕은 그대로 더해짐. 진화시킨 포켓몬은 진화한 모습으로 출전(부모님 확정, 처음엔 진화 전 모습이었다가 바꿈). 사파리존 이벤트는 나오지 않게 함(부모님 확정). 바꾼 규칙 스위치는 `battle/src/quiz-rules.ts`에 모음. 게임 화면 오른쪽 위 ✕ 버튼(`QUIZ_RULES.exitButton`, `quiz-link.ts` `showExitButton`, `init-quiz-starters.ts`에서 켬): 확인 창 뒤 원본 저장 후 나가기와 같은 방식으로 저장하고 `/`로.
- `battle/index.html`은 `lang="ko" translate="no"` + `<meta name="google" content="notranslate">`: 원래 `lang="en"`이라 크롬 자동 번역이 터치 버튼 글자(A→에이, B→비, Menu→메뉴)를 바꿔 버렸음(2026-09-29 아이 폰).
- 헤드리스 크로미움에는 mp4 코덱이 없어 로컬 Playwright에서는 로딩 화면(evo_bg.mp4)에서 멈춥니다. 실제 확인은 미리보기 사이트에서 합니다.

## 인터넷에 올리기

**자동:** 작업본에 저장해서 올리면 GitHub 자동 작업(`.github/workflows/deploy.yml`)이 검사·만들기·Cloudflare 올리기·버전 확인까지 합니다. GitHub 저장소 Secrets에 `CLOUDFLARE_API_TOKEN`이 있어야 합니다. Cloudflare 계정은 `wrangler.jsonc`의 `account_id`(부모 본인 계정)이고, 기록 저장소 번호는 자동 작업이 채웁니다. 보호자 비밀번호는 Cloudflare 화면(Workers → poke-quiz → Settings → Variables and Secrets)에서 부모가 직접 넣습니다. 옛 계정(애 엄마 로그인)의 기록은 `data/restore.sql`로 한 번 옮깁니다. 결과는 GitHub Actions 기록으로 확인합니다(부모님께 맥 명령을 안내할 필요 없음).

**예비 방법:** 맥 터미널에서 게임 폴더로 이동한 뒤 `npm run online`을 실행합니다(`scripts/online.mjs`). 로그인, 저장소, 표, 올리기, 비밀번호까지 알아서 진행하고, 이미 된 단계는 건너뜁니다. 코드를 고친 뒤 다시 올릴 때도 같은 명령 하나면 됩니다(새 버전 받기를 스스로 함). 열려 있던 게임 화면은 새 버전을 알아채면 스스로 한 번 새로고침합니다. 화면 맨 아래 "버전"으로 올라간 버전을 확인할 수 있습니다.

## 작업할 때 확인할 것

**아이 기록 지키기(부모님 당부, 2026-10-02):** 업데이트하다가 아이가 한 것(포켓몬·스탯·경험치·푼 문제·선물·이벤트·부활권 등)을 날리거나 없애면 안 됩니다.
- 기록 형식을 바꿀 때 기존 값을 지우거나 이름을 바꾸지 말고, 새 항목은 "없으면 기본값"으로 읽어 예전 기록이 그대로 이어지게 합니다.
- 표 바꾸기(`migrations/`)는 추가만(CREATE … IF NOT EXISTS, 열 추가). 지우기·덮어쓰기 금지.
- 진짜 게임에 합치기 전에 `git diff`로 아이 기록을 지우거나 줄이는 코드가 없는지 확인하고, 부모님께 "아이 기록은 그대로"인지 함께 알립니다.
- 미리보기 사이트는 기록 저장소가 따로라(`poke-quiz-preview-db`) 아이의 진짜 기록이 보이지 않습니다. 진짜 기록 확인은 진짜 사이트 보호자 공간이나 "아이 기록 내보내기"로 합니다.

바꾼 뒤에는 아래를 모두 통과시킨 다음 저장해서 올립니다.
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
