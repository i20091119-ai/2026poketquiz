// 포켓로그(battle/)의 그림·소리 파일 3만 2천 개는 Cloudflare 정적 파일 한도(2만 개)를 넘어서
// 게임 코드만 우리 사이트에 올리고, 그림·소리는 원본 에셋 저장소에서 그때그때 가져와 Cloudflare 캐시에 둡니다.
// (원본에서는 git submodule `assets`. 번역 파일 `locales`는 수가 적어 우리 사이트에 함께 올립니다.)

/** 원본 에셋 저장소(pagefaultgames/pokerogue-assets, beta)의 고정 커밋. 올릴 때 확인한 버전으로 고정합니다. */
export const BATTLE_ASSETS_COMMIT = '056a1f408f26a3be4fef243f7462cb43608c7928';
export const BATTLE_ASSETS_ORIGIN = `https://raw.githubusercontent.com/pagefaultgames/pokerogue-assets/${BATTLE_ASSETS_COMMIT}/`;

/** 원본 저장소가 확장자별 형식을 정확히 안 알려 주므로 우리가 붙입니다. */
const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  json: 'application/json', webmanifest: 'application/manifest+json',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4',
  mp4: 'video/mp4', webm: 'video/webm',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
  js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8',
};
export const battleContentType = (path: string) =>
  CONTENT_TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';
