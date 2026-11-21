// 서준이 마을 위치 (2026-11-20, 가족 대시보드용): 아이 화면이 마을 안에서 보냄. 아이 기록(game_state)과 따로 마지막 값 하나만.
import { playerOf } from '@/lib/server/player';
import { json, setVillagePresence } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: '페이지에서 다시 시도해 주세요.' }, 403);
    const body = await request.json().catch(() => null) as { inside?: unknown; x?: unknown; y?: unknown } | null;
    const x = Number(body?.x), y = Number(body?.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || Math.abs(x) > 200 || Math.abs(y) > 200) return json({ error: '자리를 다시 보내 주세요.' }, 400);
    const player = await playerOf(request);
    await setVillagePresence(player.id, { inside: body?.inside !== false, x, y, at: new Date().toISOString() });
    return json({ ok: true });
  } catch (error) {
    console.error('마을 위치 저장 실패', error);
    return json({ ok: false }, 503);
  }
}
