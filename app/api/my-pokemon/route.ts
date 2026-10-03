// 포켓로그(/battle)가 쓰는 주소: 아이가 퀴즈에서 얻어 지금 갖고 있는 포켓몬(기본 모습)의 전국도감 번호 목록과 이로치 도감 번호 목록.
// 포켓로그는 이 목록에 있는 포켓몬(의 진화 전 첫 모습)만 스타터로 열어 줍니다 (battle/SPEC.md 1번).
import { isBattleAllowed } from '@/lib/server/battle-auth';
import { playerOf } from '@/lib/server/player';
import { battleIvList, teamOf } from '@/lib/game-engine';
import { growth } from '@/lib/game-config';
import { json, loadGrowthRules, readState } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    if (!(await isBattleAllowed(request))) return json({ error: '포켓로그 비밀번호를 먼저 넣어 주세요.' }, 401);
    const [{ state }] = await Promise.all([readState((await playerOf(request)).id), loadGrowthRules()]);
    const species = [...new Set(state.owned.filter(p => !p.shiny).map(p => p.species))].sort((a, b) => a - b);
    // shiny: 이로치 도감(퀴즈에서 얻은 이로치, 진화한 모습 포함). 포켓로그는 이 목록에 있는 것만 이로치로 쓸 수 있어요 (battle/SPEC.md 3번)
    const shiny = [...new Set(state.shiny ?? [])].sort((a, b) => a - b);
    // ivs: 배틀 힘(포켓로그 개체값). 가진 포켓몬 번호 → 6개 능력치에 똑같이 쓰는 값 (같은 진화 계열은 같은 값)
    // team: 모험 팀 (파트너 먼저, 그다음 친구). 포켓로그 팀 선택 화면에서 맨 앞에 보여 줌. ivMax: ★ 배틀 힘 최대 (별 5칸 계산용)
    const { partner, friends } = teamOf(state);
    const team = [partner, ...friends].filter(p => !!p).map(p => ({ species: p!.species, shiny: !!p!.shiny }));
    return json({ species, shiny, ivs: battleIvList(state), team, ivMax: growth().ivMax });
  } catch (error) {
    console.error('보유 포켓몬 목록 읽기 실패', error);
    return json({ error: '보유 포켓몬 목록을 불러오지 못했어요.' }, 503);
  }
}
