// 포켓로그 이벤트에서 받은 이로치(색이 다른 포켓몬)를 퀴즈 도감에 남깁니다 (battle/SPEC.md 3번).
//   POST { species: number[] } → 도감 번호를 state.shiny 에 더함 (이미 있으면 그대로)
import { recordShiny } from '@/lib/game-engine';
import { isBattleAllowed } from '@/lib/server/battle-auth';
import { playerOf } from '@/lib/server/player';
import { json, mutateState } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!(await isBattleAllowed(request))) return json({ error: '포켓로그 비밀번호를 먼저 넣어 주세요.' }, 401);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: '게임 화면에서 다시 시도해 주세요.' }, 403);
    let body: { species?: unknown };
    try { body = JSON.parse(await request.text()); } catch { return json({ error: '요청을 읽지 못했어요.' }, 400); }
    const ids = Array.isArray(body?.species) ? body.species.map(Number).slice(0, 50) : [];
    const player = await playerOf(request);
    const { state, result } = await mutateState(state => { const n = recordShiny(state, ids); return { result: n, changed: n > 0 }; }, player.id);
    return json({ ok: true, added: result, shiny: state.shiny ?? [] });
  } catch (error) {
    console.error('이로치 기록 실패', error);
    return json({ error: '기록하지 못했어요.' }, 503);
  }
}
