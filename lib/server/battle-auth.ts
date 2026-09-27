// 포켓로그(/battle) 비밀번호 문 (battle/SPEC.md 9번 "가족만 접속").
// - 비밀번호는 보호자 공간에서 정하고, 서명값만 기록 저장소(settings)에 둡니다.
// - 맞게 넣으면 1년짜리 쿠키(pq_battle)를 주어 기기마다 한 번만 넣으면 됩니다.
// - 비밀번호를 바꾸면 이전 쿠키는 모두 무효가 됩니다.
// - 보호자 비밀번호(PARENT_PASSWORD)가 없는 곳(미리보기 등)에서는 문을 잠그지 않습니다.
import { env } from 'cloudflare:workers';
import { sameText, sign } from './parent-auth.ts';
import { getBattlePasswordHash } from './store.ts';

const COOKIE = 'pq_battle';
const MAX_AGE = 60 * 60 * 24 * 365; // 1년
export const BATTLE_PASSWORD_MIN = 4;

export const hashBattlePassword = (password: string) => sign('battle-pw:' + password, env.PARENT_PASSWORD ?? '');

/** open: 문 없음(보호자 비밀번호 미설정) / unset: 포켓로그 비밀번호를 아직 안 정함 / locked: 비밀번호 필요 */
export async function battleGateMode(): Promise<'open' | 'unset' | 'locked'> {
  if (!env.PARENT_PASSWORD) return 'open';
  return (await getBattlePasswordHash()) ? 'locked' : 'unset';
}

export async function checkBattlePassword(password: string) {
  const stored = await getBattlePasswordHash();
  if (!stored) return false;
  return sameText(await hashBattlePassword(password), stored);
}

export async function battleLoginCookie(request: Request) {
  const stored = (await getBattlePasswordHash()) ?? '';
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE;
  const value = `${expires}.${await sign(`battle:${expires}:${stored}`, env.PARENT_PASSWORD ?? '')}`;
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`;
}

/** 이 요청이 포켓로그를 써도 되는지 (문이 없으면 항상 true) */
export async function isBattleAllowed(request: Request) {
  const mode = await battleGateMode();
  if (mode === 'open') return true;
  if (mode === 'unset') return false;
  const cookie = request.headers.get('cookie') ?? '';
  const value = cookie.split(/;\s*/).find(c => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!value) return false;
  const [expires, sig] = value.split('.');
  if (!expires || !sig || Number(expires) < Date.now() / 1000) return false;
  const stored = (await getBattlePasswordHash()) ?? '';
  return sameText(sig, await sign(`battle:${expires}:${stored}`, env.PARENT_PASSWORD ?? ''));
}
