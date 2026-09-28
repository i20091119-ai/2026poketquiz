// 퀴즈 앱에서 보유 포켓몬 목록을 받아 옵니다. 게임을 만들기 전에 끝나야 하므로 최상위 await 를 씁니다.
import { canStartNewBattle, loadQuizOwnedSpecies, showExitButton, startProgressReporting } from "#app/quiz-link";

await loadQuizOwnedSpecies();
startProgressReporting(); // 보호자 화면용 진행 보고 (1분마다)
showExitButton(); // 오른쪽 위 ✕: 언제든 저장하고 퀴즈로
await canStartNewBattle(); // 하루 시간 제한을 이미 다 썼으면 첫 화면부터 안내판을 띄움 (횟수는 쓰지 않음)
