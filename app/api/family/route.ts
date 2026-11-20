// 가족 대시보드 읽기 창구 (2026-11-20). 사용법: docs/family-api.md
import { familyAuthorized, familyJson, familyPlayer, familyStatus } from '@/lib/server/family';
import { loadGrowthRules, loadVillageRules, offlineRulesNow, readState, schoolRulesNow } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export function OPTIONS() { return familyJson(null, 204); }

export async function GET(request: Request) {
  try {
    if (!(await familyAuthorized(request))) return familyJson({ error: '가족 접속 코드가 맞지 않아요.' }, 401);
    const player = await familyPlayer(request);
    const [{ state }, offline, school] = await Promise.all([readState(player.id), offlineRulesNow(), schoolRulesNow(), loadVillageRules(), loadGrowthRules()]);
    return familyJson(await familyStatus(request, state, player, { offline, school }));
  } catch (error) {
    console.error('가족 대시보드 읽기 실패', error);
    return familyJson({ error: '기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }, 503);
  }
}
