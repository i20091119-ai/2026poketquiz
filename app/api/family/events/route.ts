// 가족 대시보드 사건 받기 (2026-11-20): 지금은 "제때 등교" 하나. 사용법: docs/family-api.md
import { GameError, recordArrival } from '@/lib/game-engine';
import { familyAuthorized, familyJson, familyPlayer } from '@/lib/server/family';
import { appendActivity, mutateState, schoolRulesNow } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export function OPTIONS() { return familyJson(null, 204); }

const TYPES = ['onTimeArrival', 'on_time_arrival', 'school-arrival'];

export async function POST(request: Request) {
  try {
    if (!(await familyAuthorized(request))) return familyJson({ error: '가족 접속 코드가 맞지 않아요.' }, 401);
    const text = await request.text();
    if (text.length > 2000) return familyJson({ error: '요청 내용이 너무 길어요.' }, 400);
    let body: Record<string, unknown>;
    try { body = JSON.parse(text); } catch { return familyJson({ error: 'JSON으로 보내 주세요.' }, 400); }
    if (!TYPES.includes(String(body?.type))) return familyJson({ error: `알 수 없는 사건이에요. type 은 "onTimeArrival" 이어야 해요.` }, 400);
    const player = await familyPlayer(request);
    const rules = await schoolRulesNow();
    const now = new Date().toISOString();
    const { result } = await mutateState(state => {
      const r = recordArrival(state, { date: String(body.date ?? ''), time: body.time == null ? null : String(body.time), source: 'gate' }, player.today, rules, now);
      return { result: r, changed: r.status !== 'duplicate' };
    }, player.id);
    if (result.status !== 'duplicate') await appendActivity(player.id, player.today, [{ kind: 'school', data: { ...result, source: 'gate' } }]);
    const message = result.status === 'duplicate' ? '이 날은 이미 받았어요(한 번만 셈).'
      : result.ok ? `제때 도착! (${result.time} ≤ ${result.deadline}) 아이가 미션을 끝내고 마을에 들어가면 우체통 편지가 와요.`
      : `기준 시각(${result.deadline})보다 늦었어요. 기록만 남기고 아이 화면에는 아무것도 나오지 않아요.`;
    return familyJson({ player: player.id, ...result, message });
  } catch (error) {
    if (error instanceof GameError) return familyJson({ error: error.message }, 400);
    console.error('가족 대시보드 사건 받기 실패', error);
    return familyJson({ error: '저장하지 못했어요. 잠시 후 다시 보내 주세요.' }, 503);
  }
}
