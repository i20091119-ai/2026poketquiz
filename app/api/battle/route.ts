// 포켓로그(/battle)의 하루 시도 횟수 (battle/SPEC.md 7번). 횟수는 아이 기록과 함께 이 서버에 저장됩니다.
//   GET  → 오늘 남은 새 게임 횟수
//   POST → 새 게임 시작 (횟수 1 차감). 남은 횟수가 없으면 ok: false
import { battleStartsLeft, startBattle } from '@/lib/game-engine';
import { BATTLE_STARTS_PER_DAY } from '@/lib/game-config';
import { isBattleAllowed } from '@/lib/server/battle-auth';
import { playerOf } from '@/lib/server/player';
import { json, mutateState, readState } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

const NO_STARTS_MESSAGE = '오늘 새 게임은 다 했어요. 하던 게임은 이어서 할 수 있고, 새 게임은 내일 다시 할 수 있어요!';

export async function GET(request: Request) {
  try {
    if (!(await isBattleAllowed(request))) return json({ error: '포켓로그 비밀번호를 먼저 넣어 주세요.' }, 401);
    const player = await playerOf(request);
    const { state } = await readState(player.id);
    const left = battleStartsLeft(state, player.today);
    // sim: 보호자 시뮬레이션 중이면 true (게임 화면 위에 띠를 보여 줌)
    return json({ left, perDay: BATTLE_STARTS_PER_DAY, message: left ? null : NO_STARTS_MESSAGE, sim: !!player.sim });
  } catch (error) {
    console.error('시도 횟수 읽기 실패', error);
    return json({ error: '시도 횟수를 확인하지 못했어요.' }, 503);
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isBattleAllowed(request))) return json({ error: '포켓로그 비밀번호를 먼저 넣어 주세요.' }, 401);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: '게임 화면에서 다시 시도해 주세요.' }, 403);
    const player = await playerOf(request);
    const today = player.today;
    const { state, result } = await mutateState(state => {
      const ok = startBattle(state, today);
      return { result: ok, changed: ok };
    }, player.id);
    const left = battleStartsLeft(state, today);
    return json(result ? { ok: true, left } : { ok: false, left, message: NO_STARTS_MESSAGE });
  } catch (error) {
    console.error('새 게임 시작 기록 실패', error);
    return json({ error: '시도 횟수를 기록하지 못했어요. 다시 눌러 주세요.' }, 503);
  }
}
