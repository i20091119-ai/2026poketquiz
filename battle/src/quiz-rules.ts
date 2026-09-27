/*
 * 퀴즈 앱 연동판에서 바꾼 게임 규칙 스위치 (SPEC.md).
 * 원본 규칙에서 달라지는 것은 모두 이 파일의 값으로 켜고 끕니다.
 */
export const QUIZ_RULES = {
  /** SPEC 2번: 전투 중 볼 명령 제거, 포획 처리 차단, 상점 보상에서 볼 제외 */
  captureDisabled: true,
  /** SPEC 3번: 포켓몬을 주는 돌발 이벤트 4종은 파티 포켓몬 중 하나의 이로치를 줌 (quiz-gifts.ts) */
  giftShinyFromParty: true,
  /** SPEC 4번: 알 시스템 제거 — 알 뽑기·알 목록 메뉴 숨김, 알 교환권·유전자쐐기를 보상에서 제외, 알을 받지도 부화하지도 않음 */
  eggsDisabled: true,
  /** SPEC 4번: 게임 모드는 클래식만 (엔드리스·스플라이스드 엔드리스·데일리·챌린지 메뉴 제거) */
  classicOnly: true,
} as const;
