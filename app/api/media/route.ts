// 나들이 체험보고서의 사진·그림.
//   GET  ?id=…                         → 그림 파일 (번호를 아는 사람만 볼 수 있음: 짐작할 수 없는 긴 번호)
//   POST { kind: 'drawing', data }     → 아이가 6단계에서 그린 그림 저장 (휴대폰에서 줄여서 보냄) → { id }
//   POST { kind: 'photo', data }       → 보호자가 올린 사진 (보호자 로그인 필요) → { id }
import { isParent } from '@/lib/server/parent-auth';
import { playerOf } from '@/lib/server/player';
import { getMedia, json, MEDIA_MAX_CHARS, saveMedia } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!/^[a-z0-9-]{8,64}$/.test(id)) return new Response('not found', { status: 404 });
  try {
    const m = await getMedia(id);
    if (!m) return new Response('not found', { status: 404 });
    const bytes = Uint8Array.from(atob(m.data), c => c.charCodeAt(0));
    return new Response(bytes, { headers: { 'Content-Type': m.mime, 'Cache-Control': 'private, max-age=31536000, immutable' } });
  } catch (error) {
    console.error('그림 읽기 실패', error);
    return new Response('error', { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: '페이지에서 다시 시도해 주세요.' }, 403);
    const text = await request.text();
    if (text.length > MEDIA_MAX_CHARS + 200) return json({ error: '그림이 너무 커요.' }, 400);
    let body: { kind?: unknown; data?: unknown };
    try { body = JSON.parse(text); } catch { return json({ error: '요청을 읽지 못했어요.' }, 400); }
    const kind = body.kind === 'photo' ? 'photo' : body.kind === 'drawing' ? 'drawing' : null;
    if (!kind || typeof body.data !== 'string') return json({ error: '요청을 확인해 주세요.' }, 400);
    if (kind === 'photo' && !(await isParent(request))) return json({ error: '부모 로그인이 필요해요.' }, 401);
    const player = await playerOf(request);
    const id = await saveMedia(player.id, kind, body.data);
    return json({ id });
  } catch (error) {
    console.error('그림 저장 실패', error);
    return json({ error: (error as Error).message || '그림을 저장하지 못했어요.' }, 400);
  }
}
