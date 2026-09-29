// 퀴즈 앱에서 보유 포켓몬 목록을 받아 옵니다. 게임을 만들기 전에 끝나야 하므로 최상위 await 를 씁니다.
import {
  canStartNewBattle,
  loadQuizOwnedSpecies,
  lockLandscape,
  noteRevivedRun,
  showExitButton,
  startProgressReporting,
  syncQuizRunHistory,
} from "#app/quiz-link";

await loadQuizOwnedSpecies();
startProgressReporting(); // 보호자 화면용 진행 보고 (1분마다)
showExitButton(); // 오른쪽 위 ✕: 언제든 저장하고 퀴즈로
lockLandscape(); // 설치한 앱이면 게임 화면을 가로로
void syncQuizRunHistory(); // 기기에 있던 플레이 기록(게임 오버 판)을 퀴즈 앱 서버에 올림 (부활권용)
noteRevivedRun(); // 배틀 탭에서 부활권으로 되살리고 들어왔으면 안내
await canStartNewBattle(); // 하루 시간 제한을 이미 다 썼으면 첫 화면부터 안내판을 띄움 (횟수는 쓰지 않음)
