// 포켓로그가 게임 오버(또는 클리어)한 판을 올립니다. 원본 "플레이 기록"은 기기 브라우저에만 있어서, 부활권으로 되살릴 수 있게 서버에도 둡니다.
//   POST { runs: [{ id, wave, victory, data }] } → 저장 (같은 판은 한 번만)
import { isBattleAllowed } from '@/lib/server/battle-auth';
import { playerOf } from '@/lib/server/player';
import { appendActivity, json, saveRuns, type RunInput } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/** 판 저장(원본 게임의 세션 저장)에서 활동 기록에 남길 것만: 끝난 시각, 웨이브, 결과, 출전 포켓몬과 레벨 */
function runSummary(r: RunInput) {
  let party: { species: number; level: number; shiny: boolean }[] = [];
  let playTime: number | null = null;
  try {
    const entry = JSON.parse(r.data) as { party?: { species?: number; level?: number; shiny?: boolean }[]; playTime?: number };
    playTime = Number(entry.playTime) || null;
    party = (entry.party ?? []).slice(0, 6).map(p => ({ species: Number(p.species), level: Number(p.level), shiny: !!p.shiny }));
  } catch { /* 파티를 못 읽어도 기록은 남김 */ }
  const end = new Date(Number(r.id));
  return { runId: r.id, endedAt: Number.isFinite(end.getTime()) ? end.toISOString() : new Date().toISOString(), playTime, wave: r.wave, result: r.victory ? '클리어' : '게임 오버', party };
}

const MAX_BODY = 4_000_000;
const MAX_RUN = 1_500_000;

export async function POST(request: Request) {
  try {
    if (!(await isBattleAllowed(request))) return json({ error: '포켓로그 비밀번호를 먼저 넣어 주세요.' }, 401);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: '게임 화면에서 다시 시도해 주세요.' }, 403);
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ error: '판 저장이 너무 커요.' }, 413);
    let body: { runs?: unknown };
    try { body = JSON.parse(text); } catch { return json({ error: '요청을 읽지 못했어요.' }, 400); }
    const runs: RunInput[] = (Array.isArray(body?.runs) ? body.runs : []).slice(0, 30).flatMap((r: Record<string, unknown>) => {
      const id = String(r?.id ?? ''), wave = Number(r?.wave), data = typeof r?.data === 'string' ? r.data : '';
      if (!/^\d{10,16}$/.test(id) || !Number.isInteger(wave) || wave < 1 || wave > 10000 || !data || data.length > MAX_RUN) return [];
      try { JSON.parse(data); } catch { return []; }
      return [{ id, wave, victory: r?.victory === true, data }];
    });
    const player = await playerOf(request);
    const saved = runs.length ? await saveRuns(player.id, runs) : { count: 0, fresh: [] as RunInput[] };
    // 새로 올라온 판마다 활동 기록 한 줄 (판 저장은 최근 30판만 남지만 이 기록은 계속 남음)
    await appendActivity(player.id, player.today, saved.fresh.flatMap(r => { try { return [{ kind: 'battleRun', data: runSummary(r) }]; } catch { return []; } }));
    return json({ ok: true, added: saved.count });
  } catch (error) {
    console.error('포켓로그 판 저장 실패', error);
    return json({ error: '판을 저장하지 못했어요.' }, 503);
  }
}
