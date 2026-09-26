// 부모 공간 로그인: PARENT_PASSWORD(Cloudflare Secret)와 비교하고 서명된 쿠키를 발급합니다.
// 비밀번호를 바꾸면 기존 로그인 쿠키는 모두 무효가 됩니다.
import { env } from 'cloudflare:workers';

const COOKIE = 'pq_parent';
const MAX_AGE = 60 * 60 * 24 * 30; // 30일

const encoder = new TextEncoder();
async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode('poke-quiz:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, c => (c === '+' ? '-' : c === '/' ? '_' : ''));
}
function sameText(a: string, b: string) {
  const x = encoder.encode(a), y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export const passwordConfigured = () => !!env.PARENT_PASSWORD;

export async function checkPassword(password: string) {
  if (!env.PARENT_PASSWORD) throw new Error('부모 비밀번호(PARENT_PASSWORD)가 설정되지 않았어요. README의 설정 방법을 확인해 주세요.');
  return sameText(password, env.PARENT_PASSWORD);
}

export async function loginCookie(request: Request) {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE;
  const value = `${expires}.${await sign(String(expires), env.PARENT_PASSWORD!)}`;
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE}${secure}`;
}
export const logoutCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

export async function isParent(request: Request) {
  if (!env.PARENT_PASSWORD) return false;
  const cookie = request.headers.get('cookie') ?? '';
  const value = cookie.split(/;\s*/).find(c => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!value) return false;
  const [expires, sig] = value.split('.');
  if (!expires || !sig || Number(expires) < Date.now() / 1000) return false;
  return sameText(sig, await sign(expires, env.PARENT_PASSWORD));
}
