// 포켓로그(battle/)의 그림·소리 파일(원본 submodule `assets`)은 빌드 때 아래 커밋으로 받아
// 우리 사이트에 정적 파일로 함께 올립니다 (scripts/build-battle.mjs). 이 파일의 주소는 혹시 빠진 파일이
// 있을 때 app/battle/[[...path]]/route.ts 가 원본 저장소에서 가져오는 예비 경로에만 쓰입니다.

/**
 * 원본 에셋 저장소(pagefaultgames/pokerogue-assets)의 고정 커밋.
 * 포크(battle/)가 가져온 시점에 submodule로 가리키던 커밋입니다. 포크를 새로 받아오면 함께 맞춰 줍니다.
 */
export const BATTLE_ASSETS_COMMIT = '87426a79611f9d212c4dc8af58e2834a05b93725';
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
