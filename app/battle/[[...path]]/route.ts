// /battle/* 의 문지기. wrangler.jsonc 의 run_worker_first 로 /battle/* 요청은 정적 파일보다 먼저 여기로 옵니다.
// 1) 비밀번호 문(battle/SPEC.md 9번): 가족 비밀번호 쿠키가 없으면 로그인 화면으로
// 2) 통과하면 정적 파일(게임)을 그대로 내보내고, 없는 파일은 원본 에셋 저장소에서 가져옵니다
import { env } from 'cloudflare:workers';
import { BATTLE_ASSETS_ORIGIN, battleContentType } from '@/lib/battle-assets';
import { type BattleAccess, battleAccess, battleLoginCookie, checkBattlePassword } from '@/lib/server/battle-auth';

export const dynamic = 'force-dynamic';

const ONE_YEAR = 'public, max-age=31536000, immutable';
const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } });
const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const wantsHtml = (request: Request) => (request.headers.get('accept') ?? '').includes('text/html');
const UNSET_BODY = '<p>보호자 공간에서 <b>포켓로그 비밀번호</b>를 먼저 정해 주세요. 정하고 나면 이 주소에서 게임을 할 수 있어요.</p><p><a href="/parent">보호자 공간 열기 →</a></p>';
/** 잘못된 %-표기가 들어와도 500 대신 404 가 되도록 */
const safeDecode = (parts: string[]) => { try { return parts.map(decodeURIComponent); } catch { return null; } };

/** Cloudflare 캐시 (있을 때만). 원본은 커밋으로 고정되어 바뀌지 않으므로 오래 둡니다. */
const edgeCache = () => (typeof caches !== 'undefined' && 'default' in caches ? (caches as unknown as { default: Cache }).default : null);

type Params = { params: Promise<{ path?: string[] }> };

export async function GET(request: Request, { params }: Params) {
  const parts = safeDecode((await params).path ?? []);
  if (!parts) return notFound();
  const access = await battleAccess(request);
  if (parts.length === 1 && parts[0] === 'login') return loginPage(request, access, new URL(request.url).searchParams.get('e') === '1');

  if (access.mode === 'unset') {
    return wantsHtml(request) ? html(page('포켓로그 준비 중', UNSET_BODY), 403) : new Response('Forbidden', { status: 403 });
  }
  if (!access.allowed) {
    return wantsHtml(request)
      ? Response.redirect(new URL('/battle/login', request.url).toString(), 302)
      : new Response('Unauthorized', { status: 401 });
  }

  // 게임 정적 파일 (index.html, js, 번역, 그림·소리)
  const served = await env.ASSETS.fetch(request.url, { method: 'GET', headers: request.headers });
  if (served.status !== 404) return new Response(served.body, served); // 그대로는 못 고치는 응답이라 새로 감쌉니다.

  // 정적 파일에 없는 것은 원본 에셋 저장소에서
  if (parts.some(p => p === '..' || p === '' || p.startsWith('.'))) return notFound();
  const rel = parts.join('/');
  const cache = edgeCache();
  const cacheKey = new Request(new URL(request.url).toString().split('?')[0], { method: 'GET' });
  const hit = await cache?.match(cacheKey);
  if (hit) return new Response(hit.body, hit); // 캐시에서 꺼낸 응답은 그대로 못 고치므로 새로 감쌉니다.
  const upstream = await fetch(BATTLE_ASSETS_ORIGIN + parts.map(encodeURIComponent).join('/'));
  if (!upstream.ok) return notFound();
  const headers = new Headers();
  headers.set('Content-Type', battleContentType(rel));
  headers.set('Cache-Control', ONE_YEAR);
  const response = new Response(await upstream.arrayBuffer(), { status: 200, headers });
  if (cache) await cache.put(cacheKey, response.clone());
  return response;
}

/** 로그인 화면에서 비밀번호를 보냅니다. */
export async function POST(request: Request, { params }: Params) {
  const parts = (await params).path ?? [];
  if (!(parts.length === 1 && parts[0] === 'login')) return new Response('Method not allowed', { status: 405 });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  if (!(await checkBattlePassword(password))) {
    await new Promise(r => setTimeout(r, 1000)); // 무작정 대입을 늦춥니다.
    return Response.redirect(new URL('/battle/login?e=1', request.url).toString(), 303);
  }
  return new Response(null, { status: 303, headers: { Location: new URL('/battle/', request.url).toString(), 'Set-Cookie': await battleLoginCookie(request) } });
}

async function loginPage(request: Request, access: BattleAccess, wrong: boolean) {
  if (access.allowed) return Response.redirect(new URL('/battle/', request.url).toString(), 302);
  // 아직 비밀번호를 안 정했으면 로그인 화면 대신 안내만 (첫 화면과 서로 되돌기 방지)
  if (access.mode === 'unset') return html(page('포켓로그 준비 중', UNSET_BODY), 403);
  return html(page('포켓로그 들어가기', `
    <p>우리 가족만 들어갈 수 있어요. 보호자가 정한 <b>포켓로그 비밀번호</b>를 넣어 주세요. 이 기기에서는 한 번만 넣으면 돼요.</p>
    ${wrong ? '<p class="err">비밀번호가 맞지 않아요. 다시 넣어 주세요.</p>' : ''}
    <form method="post" action="/battle/login">
      <input name="password" type="password" inputmode="text" autocomplete="current-password" placeholder="비밀번호" autofocus required />
      <button type="submit">들어가기</button>
    </form>
    <p class="muted">비밀번호를 모르면 보호자에게 물어보세요.</p>`));
}

function page(title: string, body: string) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>
body{margin:0;padding:32px 16px;font-family:-apple-system,"Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif;background:#f3f6f2;color:#23302a}
main{max-width:420px;margin:0 auto;background:#fff;border:1px solid #dfe7dc;border-radius:16px;padding:22px 18px}
h1{font-size:22px;margin:0 0 8px}p{line-height:1.55}.muted{color:#6c7a72;font-size:14px}.err{color:#b3261e;font-weight:700}
input{width:100%;box-sizing:border-box;font-size:20px;padding:14px;border:2px solid #cfdacb;border-radius:12px;margin:8px 0}
button{width:100%;border:0;border-radius:12px;padding:16px;font-size:18px;font-weight:800;background:#2e7d5b;color:#fff;cursor:pointer}
a{color:#2e7d5b;font-weight:700}
</style></head><body><main><h1>${title}</h1>${body}</main></body></html>`;
}
