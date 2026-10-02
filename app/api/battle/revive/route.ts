// 부활권 (도전 이벤트 "전 과목 올클리어" 보상): 게임 오버된 판을 그 웨이브에서 체력 가득 채워 되살립니다.
//   GET  → { tickets, blocked, message, run: 되살릴 수 있는 최근 게임 오버 판 }
//   POST { mode: 'gameover' }       → 게임 오버 화면에서 바로 쓰기: 부활권 1장 사용 (판 저장은 게임이 가진 웨이브 시작 저장을 씀)
//   POST { mode: 'history', runId } → 진행 중인 판이 없을 때 배틀 탭에서: 부활권 1장 사용 + 서버에 올려 둔 판 저장을 돌려줌
// 새 게임 횟수(하루 1회)는 쓰지 않고, 배틀 쉬는 시간·하루 시간 제한은 그대로 지킵니다.
import { spendReviveTicket } from '@/lib/game-engine';
import { isBattleAllowed } from '@/lib/server/battle-auth';
import { battleGate } from '@/lib/server/battle-gate';
import { playerOf } from '@/lib/server/player';
import { appendActivity, json, latestDefeat, mutateState, readState, takeRunForRevive, undoRevive } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

const NO_TICKET = '부활권이 없어요. 이벤트 탭의 도전을 해내면 받을 수 있어!';

export async function GET(request: Request) {
  try {
    if (!(await isBattleAllowed(request))) return json({ error: '포켓로그 비밀번호를 먼저 넣어 주세요.' }, 401);
    const player = await playerOf(request);
    const { state } = await readState(player.id);
    const [gate, run] = await Promise.all([battleGate(player, state), latestDefeat(player.id)]);
    return json({ tickets: state.reviveTickets ?? 0, blocked: gate.blocked, message: gate.message, run });
  } catch (error) {
    console.error('부활권 확인 실패', error);
    return json({ error: '부활권을 확인하지 못했어요.' }, 503);
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isBattleAllowed(request))) return json({ error: '포켓로그 비밀번호를 먼저 넣어 주세요.' }, 401);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: '게임 화면에서 다시 시도해 주세요.' }, 403);
    let body: { mode?: unknown; runId?: unknown };
    try { body = JSON.parse(await request.text()); } catch { return json({ error: '요청을 읽지 못했어요.' }, 400); }
    const player = await playerOf(request);
    const { state: before } = await readState(player.id);
    const gate = await battleGate(player, before);
    if (gate.blocked) return json({ ok: false, message: gate.message, blocked: true });
    if ((before.reviveTickets ?? 0) < 1) return json({ ok: false, message: NO_TICKET });

    let run: { wave: number; data: string } | null = null;
    if (body.mode === 'history') {
      run = await takeRunForRevive(player.id, String(body.runId ?? ''));
      if (!run) return json({ ok: false, message: '되살릴 판을 찾지 못했어요. 이미 되살렸을 수도 있어.' });
    } else if (body.mode !== 'gameover') return json({ error: '요청을 확인해 주세요.' }, 400);

    const { result, state } = await mutateState(state => { const ok = spendReviveTicket(state); return { result: ok, changed: ok }; }, player.id);
    if (!result) {
      if (body.mode === 'history') await undoRevive(player.id, String(body.runId));
      return json({ ok: false, message: NO_TICKET });
    }
    await appendActivity(player.id, player.today, [{ kind: 'revive', data: { mode: body.mode === 'history' ? '배틀 탭에서 판 되살리기' : '게임 오버 화면', runId: body.mode === 'history' ? String(body.runId) : null, wave: run?.wave ?? null, ticketsLeft: state.reviveTickets ?? 0 } }]);
    return json({ ok: true, tickets: state.reviveTickets ?? 0, ...(run ? { wave: run.wave, data: run.data } : {}) });
  } catch (error) {
    console.error('부활권 사용 실패', error);
    return json({ error: '부활권을 쓰지 못했어요. 다시 해 줘.' }, 503);
  }
}
