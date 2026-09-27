// /battle/ 아래에서 우리 사이트에 없는 파일(그림·소리 등)은 원본 에셋 저장소에서 가져와 줍니다.
// 게임 코드(index.html, js, 번역)는 정적 파일로 먼저 나가고, 여기는 그 나머지만 옵니다.
import { BATTLE_ASSETS_ORIGIN, battleContentType } from '@/lib/battle-assets';

export const dynamic = 'force-dynamic';

const ONE_YEAR = 'public, max-age=31536000, immutable';
const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } });

/** Cloudflare 캐시 (있을 때만). 원본은 커밋으로 고정되어 바뀌지 않으므로 오래 둡니다. */
const edgeCache = () => (typeof caches !== 'undefined' && 'default' in caches ? (caches as unknown as { default: Cache }).default : null);

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const parts = path.map(decodeURIComponent);
  // 저장소 밖으로 나가는 경로는 막습니다.
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
  const body = await upstream.arrayBuffer();
  const response = new Response(body, { status: 200, headers });
  if (cache) await cache.put(cacheKey, response.clone());
  return response;
}
