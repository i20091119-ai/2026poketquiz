// 포켓로그가 1분마다 보내는 진행 보고 (지금 웨이브, 그동안 플레이한 초). 보호자 화면의 날짜별 기록이 됩니다.
import { battleTimeUp, recordBattleLevels, recordBattleProgress } from '@/lib/game-engine';
import { TIME_UP_MESSAGE } from '../route';
import { isBattleAllowed } from '@/lib/server/battle-auth';
import { playerOf } from '@/lib/server/player';
import { getBattleLimitMinutes, json, mutateState } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!(await isBattleAllowed(request))) return json({ error: '포켓로그 비밀번호를 먼저 넣어 주세요.' }, 401);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: '게임 화면에서 다시 시도해 주세요.' }, 403);
    let body: { wave?: unknown; seconds?: unknown; party?: unknown };
    try { body = JSON.parse(await request.text()); } catch { return json({ error: '요청을 읽지 못했어요.' }, 400); }
    const wave = Number(body?.wave ?? 0), seconds = Number(body?.seconds ?? 0);
    const player = await playerOf(request);
    const today = player.today;
    const limit = await getBattleLimitMinutes();
    const party = Array.isArray(body?.party) ? (body.party as { starter?: unknown; level?: unknown }[]).slice(0, 6) : [];
    const { state, result } = await mutateState(state => {
      recordBattleLevels(state, party.map(p => ({ starter: Number(p?.starter), level: Number(p?.level) })));
      return { result: recordBattleProgress(state, today, wave, seconds), changed: true };
    }, player.id);
    const timeUp = battleTimeUp(state, today, limit);
    // timeUp 이면 게임이 화면을 가리고 퀴즈로 돌아가게 합니다 (하루 시간 제한)
    return json({ ok: true, today: result, limit, timeUp, message: timeUp ? TIME_UP_MESSAGE(limit) : null });
  } catch (error) {
    console.error('포켓로그 진행 기록 실패', error);
    return json({ error: '기록하지 못했어요.' }, 503);
  }
}
