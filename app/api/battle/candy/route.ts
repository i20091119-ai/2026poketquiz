// 일일미션으로 받은 포켓로그 사탕 (battle/SPEC.md 11번). 게임이 켜질 때 가져갑니다.
//   GET  → 아직 안 가져간 사탕 묶음 목록 [{ id, date, species, amount }]
//   POST { ids } → 게임이 넣은 묶음을 목록에서 뺌 (같은 묶음을 두 번 넣지 않게)
import { claimCandy } from '@/lib/game-engine';
import { isBattleAllowed } from '@/lib/server/battle-auth';
import { playerOf } from '@/lib/server/player';
import { json, mutateState, readState } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    if (!(await isBattleAllowed(request))) return json({ error: '포켓로그 비밀번호를 먼저 넣어 주세요.' }, 401);
    const { state } = await readState((await playerOf(request)).id);
    return json({ gifts: state.candy?.pending ?? [] });
  } catch (error) {
    console.error('사탕 목록 읽기 실패', error);
    return json({ error: '사탕 목록을 불러오지 못했어요.' }, 503);
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isBattleAllowed(request))) return json({ error: '포켓로그 비밀번호를 먼저 넣어 주세요.' }, 401);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: '게임 화면에서 다시 시도해 주세요.' }, 403);
    let body: { ids?: unknown };
    try { body = JSON.parse(await request.text()); } catch { return json({ error: '요청을 읽지 못했어요.' }, 400); }
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 100) : [];
    const player = await playerOf(request);
    const { result } = await mutateState(state => { const n = claimCandy(state, ids); return { result: n, changed: n > 0 }; }, player.id);
    return json({ ok: true, claimed: result });
  } catch (error) {
    console.error('사탕 가져가기 기록 실패', error);
    return json({ error: '기록하지 못했어요.' }, 503);
  }
}
