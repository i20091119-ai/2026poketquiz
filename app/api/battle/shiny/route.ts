// (끔) 포켓로그에서 받은 이로치를 퀴즈 도감에 남기던 주소.
// 이로치는 퀴즈에서만 얻도록 바꿔서(battle/SPEC.md 3번), 이제 아무것도 기록하지 않습니다.
// 예전 버전의 게임 화면이 열려 있어도 오류가 나지 않게 같은 모양으로만 답합니다. 지금까지 기록된 이로치는 그대로 남아 있어요.
import { json } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export async function POST() {
  return json({ ok: true, added: 0, ignored: true });
}
