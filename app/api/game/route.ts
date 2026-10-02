import { afterAction, beforeAction, eventsChange, type LogEntry } from '@/lib/activity-log';
import { daySummary } from '@/lib/activity-log';
import { applyAction, childView, ensureDaily, GameError, secureRandom, syncEvents, type Action } from '@/lib/game-engine';
import { battleGate, type BattleGate } from '@/lib/server/battle-gate';
import { playerOf, type Player } from '@/lib/server/player';
import { activeBank, appendActivity, json, latestDefeat, loadStrongOverrides, mutateState, shinyChanceFor } from '@/lib/server/store';
import type { GameState } from '@/lib/game-engine';

export const dynamic = 'force-dynamic';

function safeLog(make: () => LogEntry[]): LogEntry[] {
  try { return make(); } catch (error) { console.error('활동 기록 만들기 실패', error); return []; }
}

/** 아이 화면 배틀 탭용: 지금 포켓로그를 할 수 있는지 (쉬는 시간·시간 제한) */
async function battleInfo(player: Player, state: GameState) {
  const [gate, run]: [BattleGate, Awaited<ReturnType<typeof latestDefeat>>] = await Promise.all([battleGate(player, state), latestDefeat(player.id)]);
  return {
    blocked: gate.blocked, message: gate.message, restName: gate.rest.name, until: gate.rest.until, timeUp: gate.timeUp, openToday: gate.openToday,
    /** 부활권으로 되살릴 수 있는 가장 최근 게임 오버 판 (없으면 null) */
    reviveRun: run,
  };
}

export async function GET(request: Request) {
  try {
    const [bank, player, strong] = await Promise.all([activeBank(), playerOf(request), loadStrongOverrides()]);
    const { today } = player;
    let log: LogEntry[] = [];
    const { state } = await mutateState(state => {
      const before = beforeAction(state, { type: 'quizTime', seconds: 0 }, today);
      const a = ensureDaily(state, bank, today, secureRandom);
      const b = syncEvents(state, bank, today); // 도전 이벤트 진도 (연속 기록 끊김·올클리어 완료)
      log = safeLog(() => eventsChange(before, state));
      return { result: null, changed: a || b };
    }, player.id);
    await appendActivity(player.id, today, log);
    // sim: 보호자 시뮬레이션 중이면 날짜 정보 (아이 화면 위에 띠를 보여 줌)
    return json({ view: childView(state, bank, today), strong, sim: player.sim, battleGate: await battleInfo(player, state) });
  } catch (error) {
    console.error('게임 기록 읽기 실패', error);
    return json({ error: '게임 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: '페이지에서 다시 시도해 주세요.' }, 403);
    const body = await request.text();
    if (body.length > 5000) return json({ error: '요청 내용이 너무 길어요.' }, 400);
    let action: Action;
    try { action = JSON.parse(body); } catch { return json({ error: '요청을 읽지 못했어요.' }, 400); }
    if (!action || typeof action !== 'object') return json({ error: '요청을 확인해 주세요.' }, 400);

    // strong: 보호자가 바꾼 센 포켓몬·도전 속성 (진화 조건 계산 전에 맞춤)
    const [bank, player, strong] = await Promise.all([activeBank(), playerOf(request), loadStrongOverrides()]);
    const { today } = player;
    const shinyChance = await shinyChanceFor(player.id); // 볼을 열 때 이로치 확률 (보호자 개발자 메뉴, 시뮬레이션이면 100%)
    let log: LogEntry[] = [];
    const { state, result } = await mutateState(state => {
      const ctx = { bank, today, now: new Date().toISOString(), random: secureRandom, shinyChance };
      const before = beforeAction(state, action, today);
      const result = applyAction(state, action, ctx);
      syncEvents(state, bank, today); // 이 행동으로 이벤트가 진행·완료됐을 수 있음
      // 활동 기록을 만들다 오류가 나도 게임 동작은 그대로 진행
      log = safeLog(() => action.type === 'quizTime' ? [daySummary(state, today)] : [...afterAction(before, state, action, result, ctx), ...(action.type === 'answer' ? [daySummary(state, today)] : [])]);
      return { result, changed: true };
    }, player.id);
    await appendActivity(player.id, today, log); // 시험용이면 남기지 않음
    return json({ view: childView(state, bank, today), result, strong, sim: player.sim, battleGate: await battleInfo(player, state) });
  } catch (error) {
    if (error instanceof GameError) return json({ error: error.message }, 400);
    console.error('게임 요청 실패', error);
    return json({ error: '기록을 저장하지 못했어요. 다시 눌러 주세요. 같은 보상은 한 번만 받아요.' }, 503);
  }
}
