// 포켓로그(battle/)를 만들어서 퀴즈 앱 정적 파일 폴더(dist/client/battle)에 넣습니다.
// 사용법: npm run build:battle   (npm run build 뒤에 실행)
//   - 번역 파일(locales)이 없으면 원본 저장소에서 받아옵니다 (원본에서는 git submodule).
//   - 그림·소리(assets)는 수가 너무 많아 올리지 않고, 사이트가 원본 저장소에서 그때그때 가져옵니다 (lib/battle-assets.ts).
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const battle = path.join(root, 'battle');
const locales = path.join(battle, 'locales');
const out = path.join(root, 'dist', 'client', 'battle');
const LOCALES_REPO = 'https://github.com/pagefaultgames/pokerogue-locales.git';
/** 포크(battle/)가 가져온 시점에 submodule로 가리키던 번역 저장소 커밋. 포크를 새로 받아오면 함께 맞춰 줍니다. */
const LOCALES_COMMIT = '270ed0a2938b2c3e2e34e7de940e84aecadf548b';

const run = (cmd, args, cwd, env = {}) => {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) { console.error(`실패: ${cmd} ${args.join(' ')}`); process.exit(r.status ?? 1); }
};

if (!existsSync(path.join(root, 'dist', 'client'))) { console.error('먼저 npm run build 를 실행해 주세요.'); process.exit(1); }

// 1. 번역 파일
if (!existsSync(path.join(locales, 'en'))) {
  console.log('번역 파일을 받아옵니다…');
  rmSync(locales, { recursive: true, force: true });
  mkdirSync(locales, { recursive: true });
  const g = (...args) => execFileSync('git', ['-C', locales, ...args], { stdio: 'inherit' });
  g('init', '-q');
  g('fetch', '-q', '--depth', '1', LOCALES_REPO, LOCALES_COMMIT);
  g('checkout', '-q', 'FETCH_HEAD');
  rmSync(path.join(locales, '.git'), { recursive: true, force: true });
}

// 2. 설치와 만들기 (로그인 없이 브라우저 저장 모드: VITE_BYPASS_LOGIN=1)
run('pnpm', ['install', '--frozen-lockfile'], battle, { LEFTHOOK: '0' });
run('pnpm', ['build'], battle, { VITE_BYPASS_LOGIN: '1' });

// 3. 퀴즈 앱 정적 파일 폴더로 복사
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(path.join(battle, 'dist'), out, { recursive: true }); // 번역 파일(locales)도 이 안에 함께 들어 있습니다.
const count = dir => readdirSync(dir, { withFileTypes: true, recursive: true }).filter(d => d.isFile()).length;
console.log(`✅ battle/ 완료: dist/client/battle 에 파일 ${count(out)}개`);
