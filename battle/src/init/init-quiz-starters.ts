// 퀴즈 앱에서 보유 포켓몬 목록을 받아 옵니다. 게임을 만들기 전에 끝나야 하므로 최상위 await 를 씁니다.
import { loadQuizOwnedSpecies } from "#app/quiz-link";

await loadQuizOwnedSpecies();
