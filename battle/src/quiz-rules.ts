/*
 * 퀴즈 앱 연동판에서 바꾼 게임 규칙 스위치 (SPEC.md).
 * 원본 규칙에서 달라지는 것은 모두 이 파일의 값으로 켜고 끕니다.
 */
export const QUIZ_RULES = {
  /** SPEC 2번: 전투 중 볼 명령 제거, 포획 처리 차단, 상점 보상에서 볼 제외 */
  captureDisabled: true,
  /** SPEC 3번: 포켓몬을 주는 돌발 이벤트 4종은 파티 포켓몬 중 하나의 이로치를 줌 (quiz-gifts.ts). 이 이로치만은 다음 판에도 내 것으로 남음 */
  giftShinyFromParty: true,
  /** SPEC 4번: 알 시스템 제거 — 알 뽑기·알 목록 메뉴 숨김, 알 교환권·유전자쐐기를 보상에서 제외, 알을 받지도 부화하지도 않음 */
  eggsDisabled: true,
  /** SPEC 4번: 게임 모드는 클래식만 (엔드리스·스플라이스드 엔드리스·데일리·챌린지 메뉴 제거) */
  classicOnly: true,
  /**
   * SPEC 5번: 이 웨이브에서 이기면 게임 클리어 (원본 클래식 200). 55 = 원본 고정 전투 라이벌3.
   * 지역 변경·보스·체육관 배치는 원본 그대로 두고, 클리어 시점만 앞당깁니다. 추후 100 → 150 → 200 으로 늘릴 수 있습니다.
   */
  finalWave: 55,
  /** SPEC 10번: 한국어 고정 — 설정의 언어 선택 메뉴 제거 (i18n.ts 에서 lng: "ko") */
  koreanOnly: true,
  /** 부모님 결정(SPEC 11번): 퀴즈에서 진화시킨 포켓몬은 스타터를 고르면 진화한 모습(레벨은 시작 레벨 그대로)으로 출전 */
  startEvolved: true,
  /**
   * 부모님 결정: 판 안 진화는 보호자 공간의 "배틀 중 진화 허용" 스위치로 정함 (기본 꺼짐).
   * 꺼져 있으면 플레이어 포켓몬은 레벨이 올라도 진화하지 않고(pokemon.ts getEvolution), 진화 아이템은 보상에 나오지 않음(init-modifier-pools.ts).
   * 값은 퀴즈 서버 /api/battle 과 진행 보고 응답의 evolution 으로 받음 (quiz-link.ts isBattleEvolutionAllowed).
   */
  evolutionSwitch: true,
  /**
   * 부모님 결정: 게임 화면 오른쪽 위에 늘 ✕ 버튼. 누르면 "그만할까?" 확인 후 저장하고 퀴즈 앱(/)으로.
   * 전투 중이면 원본 "저장 후 나가기"와 같게 이번 웨이브 시작 지점으로 저장 (quiz-link.ts showExitButton)
   */
  exitButton: true,
  /**
   * 부모님 결정: 부활권(퀴즈 앱 도전 이벤트 보상). 게임 오버 화면에서 쓰면 웨이브 시작 저장을 체력 가득 채워 그 웨이브를 다시 시작.
   * 게임 오버된 판은 퀴즈 앱 서버에도 올려(원본 플레이 기록은 기기에만 있음), 진행 중인 판이 없을 때 배틀 탭에서 되살릴 수 있게 함.
   */
  reviveTickets: true,
  /**
   * 부모님 요청: 홈 화면에 설치한 앱으로 열면 게임 화면을 가로로 돌려 크게 보여 줌 (quiz-link.ts lockLandscape).
   * 앱 정보 파일은 "any"(방향 자유), 퀴즈 화면은 components/pwa.tsx 가 세로로 고정.
   */
  landscapeInApp: true,
  /** 원본 안내 정리(부모님 결정): 제목 화면의 "접속자 수·로그인 계정" 표시와 메뉴의 커뮤니티(디스코드 등) 항목을 숨김. 안내 문장은 battle-extras/locales-ko 로 바꿈 */
  hideOriginalNotices: true,
} as const;
