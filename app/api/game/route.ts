import { applyAction, childView, ensureDaily, GameError, secureRandom, type Action } from '@/lib/game-engine';
import { playerOf } from '@/lib/server/player';
import { activeBank, json, mutateState } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const [bank, player] = await Promise.all([activeBank(), playerOf(request)]);
    const { today } = player;
    const { state } = await mutateState(state => ({ result: null, changed: ensureDaily(state, bank, today, secureRandom) }), player.id);
    // sim: 보호자 시뮬레이션 중이면 날짜 정보 (아이 화면 위에 띠를 보여 줌)
    return json({ view: childView(state, bank, today), sim: player.sim });
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

    const [bank, player] = await Promise.all([activeBank(), playerOf(request)]);
    const { today } = player;
    const { state, result } = await mutateState(state => ({
      result: applyAction(state, action, { bank, today, now: new Date().toISOString(), random: secureRandom }),
      changed: true,
    }), player.id);
    return json({ view: childView(state, bank, today), result, sim: player.sim });
  } catch (error) {
    if (error instanceof GameError) return json({ error: error.message }, 400);
    console.error('게임 요청 실패', error);
    return json({ error: '기록을 저장하지 못했어요. 다시 눌러 주세요. 같은 보상은 한 번만 받아요.' }, 503);
  }
}
