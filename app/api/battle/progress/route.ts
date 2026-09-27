// 포켓로그가 1분마다 보내는 진행 보고 (지금 웨이브, 그동안 플레이한 초). 보호자 화면의 날짜별 기록이 됩니다.
import { recordBattleProgress, todayKorea } from '@/lib/game-engine';
import { isBattleAllowed } from '@/lib/server/battle-auth';
import { json, mutateState } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!(await isBattleAllowed(request))) return json({ error: '포켓로그 비밀번호를 먼저 넣어 주세요.' }, 401);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: '게임 화면에서 다시 시도해 주세요.' }, 403);
    let body: { wave?: unknown; seconds?: unknown };
    try { body = JSON.parse(await request.text()); } catch { return json({ error: '요청을 읽지 못했어요.' }, 400); }
    const wave = Number(body?.wave ?? 0), seconds = Number(body?.seconds ?? 0);
    const today = todayKorea();
    const { result } = await mutateState(state => ({ result: recordBattleProgress(state, today, wave, seconds), changed: true }));
    return json({ ok: true, today: result });
  } catch (error) {
    console.error('포켓로그 진행 기록 실패', error);
    return json({ error: '기록하지 못했어요.' }, 503);
  }
}
