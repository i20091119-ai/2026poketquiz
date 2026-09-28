// 퀴즈 앱 화면에서 포켓로그(같은 주소 아래 /battle/)의 기기 저장을 다룹니다. 포켓로그는 로그인 없이 브라우저 저장만 씁니다.
// 저장 형식(로그인 없는 모드): btoa(encodeURIComponent(JSON)) — battle/src/utils/data.ts 의 encrypt/decrypt 와 같음.

/** 포켓로그 저장 슬롯 5개의 이름 (battle/src/account.ts getSessionDataLocalStorageKey) */
const SLOT_KEYS = ['sessionData_Guest', 'sessionData1_Guest', 'sessionData2_Guest', 'sessionData3_Guest', 'sessionData4_Guest'];

/** 이 기기에 진행 중인 포켓로그 판이 있는지 */
export function hasBattleInProgress(): boolean {
  try { return SLOT_KEYS.some(k => !!localStorage.getItem(k)); } catch { return false; }
}

type SavedPokemon = { hp: number; stats?: number[]; status?: unknown };
/** 파티 전원(기절 포함)과 상대의 체력을 가득 채우고 상태 이상을 없앱니다 (battle/src/quiz-link.ts healSessionData 와 같음) */
export function healSession(data: { party?: SavedPokemon[]; enemyParty?: SavedPokemon[] }) {
  for (const p of [...(data.party ?? []), ...(data.enemyParty ?? [])]) {
    const max = p.stats?.[0];
    if (typeof max === 'number' && max > 0) p.hp = max;
    p.status = null;
  }
}

/** 서버에서 받은 게임 오버 판 저장을 체력 가득 채워 첫 슬롯에 넣습니다. 포켓로그에서 "계속하기"를 누르면 그 웨이브부터 시작해요. */
export function writeRevivedSession(json: string) {
  const data = JSON.parse(json) as { party?: SavedPokemon[]; enemyParty?: SavedPokemon[]; timestamp?: number };
  healSession(data);
  data.timestamp = Date.now();
  localStorage.setItem(SLOT_KEYS[0], btoa(encodeURIComponent(JSON.stringify(data))));
  localStorage.setItem('quizRevived', '1'); // 게임이 열리면 "계속하기를 눌러" 안내
}
