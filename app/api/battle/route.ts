// 포켓로그(/battle)의 하루 시도 횟수 (battle/SPEC.md 7번). 횟수는 아이 기록과 함께 이 서버에 저장됩니다.
//   GET  → 오늘 남은 새 게임 횟수
//   POST → 새 게임 시작 (횟수 1 차감). 남은 횟수가 없으면 ok: false
import { battleSecondsToday, battleStartsLeft, battleTimeUp, startBattle } from '@/lib/game-engine';
import { BATTLE_STARTS_PER_DAY } from '@/lib/game-config';
import { isBattleAllowed } from '@/lib/server/battle-auth';
import { playerOf } from '@/lib/server/player';
import { getBattleEvolutionAllowed, getBattleLimitMinutes, json, mutateState, readState } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

const NO_STARTS_MESSAGE = '오늘 새 게임은 다 했어요. 하던 게임은 이어서 할 수 있고, 새 게임은 내일 다시 할 수 있어요!';
export const TIME_UP_MESSAGE = (limit: number) => `오늘 포켓로그 시간(${limit}분)을 다 썼어요. 내일 또 하자!`;

export async function GET(request: Request) {
  try {
    if (!(await isBattleAllowed(request))) return json({ error: '포켓로그 비밀번호를 먼저 넣어 주세요.' }, 401);
    const player = await playerOf(request);
    const [{ state }, limit, evolution] = await Promise.all([readState(player.id), getBattleLimitMinutes(), getBattleEvolutionAllowed()]);
    const timeUp = battleTimeUp(state, player.today, limit);
    const left = timeUp ? 0 : battleStartsLeft(state, player.today);
    // sim: 보호자 시뮬레이션 중이면 true (게임 화면 위에 띠를 보여 줌). limit/used/timeUp: 하루 시간 제한(분, 0 = 없음). evolution: 판 안 진화 허용(보호자 설정)
    return json({
      left, perDay: BATTLE_STARTS_PER_DAY, message: timeUp ? TIME_UP_MESSAGE(limit) : left ? null : NO_STARTS_MESSAGE, sim: !!player.sim,
      limit, usedSeconds: battleSecondsToday(state, player.today), timeUp, evolution,
    });
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
    const limit = await getBattleLimitMinutes();
    const { state, result } = await mutateState((state): { result: boolean | 'timeUp'; changed: boolean } => {
      if (battleTimeUp(state, today, limit)) return { result: 'timeUp', changed: false };
      const ok = startBattle(state, today);
      return { result: ok, changed: ok };
    }, player.id);
    if (result === 'timeUp') return json({ ok: false, left: 0, message: TIME_UP_MESSAGE(limit), timeUp: true });
    const left = battleStartsLeft(state, today);
    return json(result ? { ok: true, left } : { ok: false, left, message: NO_STARTS_MESSAGE });
  } catch (error) {
    console.error('새 게임 시작 기록 실패', error);
    return json({ error: '시도 횟수를 기록하지 못했어요. 다시 눌러 주세요.' }, 503);
  }
}
