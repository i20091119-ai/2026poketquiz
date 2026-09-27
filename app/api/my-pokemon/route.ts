// 포켓로그(/battle)가 쓰는 주소: 아이가 퀴즈에서 얻어 지금 갖고 있는 포켓몬의 전국도감 번호 목록.
// 포켓로그는 이 목록에 있는 포켓몬(의 진화 전 첫 모습)만 스타터로 열어 줍니다 (battle/SPEC.md 1번).
import { json, readState } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { state } = await readState();
    const species = [...new Set(state.owned.map(p => p.species))].sort((a, b) => a - b);
    return json({ species });
  } catch (error) {
    console.error('보유 포켓몬 목록 읽기 실패', error);
    return json({ error: '보유 포켓몬 목록을 불러오지 못했어요.' }, 503);
  }
}
