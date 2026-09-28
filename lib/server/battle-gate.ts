// 포켓로그를 지금 할 수 있는지 한 번에 봅니다: 하루 시간 제한 + 쉬는 시간 (둘 중 하나라도 걸리면 막힘).
// 시각은 서버의 한국 시간(시뮬레이션이면 정한 시각) 기준입니다 — 기기 시계는 믿지 않습니다.
import { restStatus, type RestStatus } from '../battle-rest.ts';
import { battleTimeUp, type GameState } from '../game-engine.ts';
import type { Player } from './player.ts';
import { getBattleLimitMinutes, getBattleRest, getRestOpenDate } from './store.ts';

export type BattleGate = {
  /** 하루 시간 제한(분, 0 = 없음)과 다 썼는지 */
  limit: number; timeUp: boolean;
  /** 쉬는 시간 상태 */
  rest: RestStatus;
  /** 오늘만 열어 주기가 켜져 있는지 */
  openToday: boolean;
  /** 새 게임도 이어하기도 막아야 하는지 */
  blocked: boolean;
  /** 막혔을 때 아이에게 보여 줄 말 */
  message: string | null;
};

export const TIME_UP_MESSAGE = (limit: number) => `오늘 포켓로그 시간(${limit}분)을 다 썼어요. 내일 또 하자!`;

export async function battleGate(player: Player, state: GameState): Promise<BattleGate> {
  const [limit, rules, openDate] = await Promise.all([getBattleLimitMinutes(), getBattleRest(), getRestOpenDate()]);
  const openToday = openDate === player.today;
  const rest = restStatus(rules, player.clock, openToday);
  const timeUp = battleTimeUp(state, player.today, limit);
  const blocked = timeUp || rest.blocked;
  return { limit, timeUp, rest, openToday, blocked, message: rest.blocked ? rest.message : timeUp ? TIME_UP_MESSAGE(limit) : null };
}

/** 게임(포켓로그)에 보내는 모양 */
export const gateForGame = (gate: BattleGate) => ({
  limit: gate.limit, timeUp: gate.timeUp,
  rest: { blocked: gate.rest.blocked, name: gate.rest.name, until: gate.rest.until, message: gate.rest.message, soon: gate.rest.soon },
});
