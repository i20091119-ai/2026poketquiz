// 포켓로그(battle/)를 만들어서 퀴즈 앱 정적 파일 폴더(dist/client/battle)에 넣습니다.
// 사용법: npm run build:battle   (npm run build 뒤에 실행)
//   - 번역(locales)과 그림·소리(assets)가 없으면 원본 저장소에서 받아옵니다 (원본에서는 git submodule).
//   - 배경음악은 스마트폰에서 가볍게 받도록 ffmpeg로 모노·저비트레이트로 다시 압축합니다 (약 1/3 크기).
//   - 그림·소리도 우리 사이트에 정적 파일로 함께 올립니다 (Cloudflare 유료 요금제, 파일 수 한도 10만 개).
//     혹시 빠진 파일은 app/battle/[[...path]]/route.ts 가 원본 저장소에서 가져옵니다.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { BATTLE_ASSETS_COMMIT } from '../lib/battle-assets.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const battle = path.join(root, 'battle');
const locales = path.join(battle, 'locales');
const out = path.join(root, 'dist', 'client', 'battle');
const extras = path.join(root, 'battle-extras'); // 우리가 만든 서비스 워커·게임 준비 페이지
const assets = path.join(battle, 'assets');
const LOCALES_REPO = 'https://github.com/pagefaultgames/pokerogue-locales.git';
const ASSETS_REPO = 'https://github.com/pagefaultgames/pokerogue-assets.git';
/** 배경음악 압축 설정. 바꾸면 BGM_MARK 도 올려서 다시 압축되게 합니다. */
const BGM = { bitrate: '64k', channels: '1', mark: 'bgm-compressed-v1' };
/** 포크(battle/)가 가져온 시점에 submodule로 가리키던 번역 저장소 커밋. 포크를 새로 받아오면 함께 맞춰 줍니다. */
const LOCALES_COMMIT = '270ed0a2938b2c3e2e34e7de940e84aecadf548b';

const run = (cmd, args, cwd, env = {}) => {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) { console.error(`실패: ${cmd} ${args.join(' ')}`); process.exit(r.status ?? 1); }
};

if (!existsSync(path.join(root, 'dist', 'client'))) { console.error('먼저 npm run build 를 실행해 주세요.'); process.exit(1); }

/** 원본 저장소의 특정 커밋 하나만 받아 dir 에 풀어 둡니다 (.git 은 지움). */
function fetchInto(dir, repo, commit, label) {
  console.log(`${label}을 받아옵니다… (${commit.slice(0, 7)})`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const g = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'inherit' });
  g('init', '-q');
  g('fetch', '-q', '--depth', '1', repo, commit);
  g('checkout', '-q', 'FETCH_HEAD');
  rmSync(path.join(dir, '.git'), { recursive: true, force: true });
}

// 1. 번역 파일과 그림·소리 파일
if (!existsSync(path.join(locales, 'en'))) fetchInto(locales, LOCALES_REPO, LOCALES_COMMIT, '번역 파일');
if (!existsSync(path.join(assets, 'images'))) fetchInto(assets, ASSETS_REPO, BATTLE_ASSETS_COMMIT, '그림·소리 파일');

// 1-1. 한국어 번역에서 빠진 문장 채우기 (SPEC 10번): battle-extras/locales-ko 의 내용을 ko 번역 위에 덮어씁니다.
const koOverrides = path.join(extras, 'locales-ko');
const deepMerge = (target, source) => {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) target[k] = deepMerge(target[k] && typeof target[k] === 'object' ? target[k] : {}, v);
    else target[k] = v;
  }
  return target;
};
let filled = 0;
for (const d of readdirSync(koOverrides, { withFileTypes: true, recursive: true })) {
  if (!d.isFile() || !d.name.endsWith('.json')) continue;
  const rel = path.relative(koOverrides, path.join(d.parentPath ?? d.path, d.name));
  const target = path.join(locales, 'ko', rel);
  const current = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : {};
  const override = JSON.parse(readFileSync(path.join(koOverrides, rel), 'utf8'));
  writeFileSync(target, JSON.stringify(deepMerge(current, override), null, 2) + '\n');
  filled++;
}
console.log(`한국어 번역 보완 파일 ${filled}개를 적용했어요.`);

// 1-2. 배경음악 압축 (한 번 하면 표시 파일을 남겨 다시 하지 않음)
const bgmDir = path.join(assets, 'audio', 'bgm');
const bgmMark = path.join(bgmDir, `.${BGM.mark}`);
if (existsSync(bgmDir) && !existsSync(bgmMark)) {
  const ffmpeg = process.env.FFMPEG || 'ffmpeg';
  if (spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status !== 0) {
    console.warn('⚠️ ffmpeg 가 없어 배경음악을 압축하지 않고 원본 그대로 씁니다.');
  } else {
    const files = readdirSync(bgmDir).filter(f => /\.(mp3|ogg|wav)$/i.test(f));
    let before = 0, after = 0;
    console.log(`배경음악 ${files.length}곡을 압축합니다… (모노, ${BGM.bitrate})`);
    for (const f of files) {
      const src = path.join(bgmDir, f);
      const tmp = path.join(bgmDir, `.tmp-${f}`);
      before += statSync(src).size;
      const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', src, '-map_metadata', '-1', '-ac', BGM.channels, '-b:a', BGM.bitrate, tmp], { stdio: 'inherit' });
      if (r.status !== 0 || !existsSync(tmp)) { console.warn(`⚠️ 압축 실패, 원본 유지: ${f}`); rmSync(tmp, { force: true }); after += statSync(src).size; continue; }
      renameSync(tmp, src);
      after += statSync(src).size;
    }
    writeFileSync(bgmMark, `${new Date().toISOString()}\n`);
    console.log(`✅ 배경음악 ${(before / 1048576).toFixed(0)}MB → ${(after / 1048576).toFixed(0)}MB`);
  }
}

// 2. 설치와 만들기 (로그인 없이 브라우저 저장 모드: VITE_BYPASS_LOGIN=1)
run('pnpm', ['install', '--frozen-lockfile'], battle, { LEFTHOOK: '0' });
run('pnpm', ['build'], battle, { VITE_BYPASS_LOGIN: '1' });

// 3. 퀴즈 앱 정적 파일 폴더로 복사
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
// 그림·소리를 먼저, 게임 코드(dist)를 나중에 복사합니다. dist 안에는 작게 줄인 JSON과 번역 파일이 들어 있어 그쪽이 남습니다.
cpSync(assets, out, { recursive: true, filter: src => !/[\\/]\.(git|tmp-|bgm-)/.test(src) });
cpSync(path.join(battle, 'dist'), out, { recursive: true });
// 스마트폰 "홈 화면에 추가"가 /battle/ 을 가리키도록 앱 정보 파일을 고칩니다 (원본은 사이트 뿌리 "/" 기준).
const manifestPath = path.join(out, 'manifest.webmanifest');
if (existsSync(manifestPath)) {
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  writeFileSync(manifestPath, JSON.stringify({ ...m, scope: '/battle/', start_url: '/battle/' }));
}
// 4. 데이터 절약(SPEC 8번): 우리 서비스 워커와 "게임 준비하기" 페이지를 넣고, 미리 받을 파일 목록을 만듭니다.
//    (원본의 service-worker.js 는 빈 파일이라 우리 것으로 덮어씁니다)
const version = (() => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return String(Date.now()); } })();
writeFileSync(path.join(out, 'service-worker.js'), readFileSync(path.join(extras, 'service-worker.js'), 'utf8').replace('__BATTLE_VERSION__', version));
cpSync(path.join(extras, 'prepare.html'), path.join(out, 'prepare.html'));
// 비밀번호 문(SPEC 9번): 첫 화면은 정적으로 바로 열리므로, 문이 잠겨 있으면(401/403) 로그인 화면으로 보내는 확인 스크립트를 넣습니다.
const indexPath = path.join(out, 'index.html');
// 1) 문이 잠겨 있으면 로그인 화면으로  2) 보호자 시뮬레이션 중이면(퀴즈 서버 /api/battle 의 sim) 화면 위에 띠를 보여 줌
const gateScript = '<script>fetch("./asset-manifest.json",{cache:"no-store",credentials:"same-origin"}).then(function(r){if(r.status===401||r.status===403){location.replace("./login")}}).catch(function(){});'
  + 'fetch("/api/battle",{cache:"no-store",credentials:"same-origin"}).then(function(r){return r.ok?r.json():null}).then(function(b){if(!b||!b.sim)return;var a=document.createElement("a");a.href="/parent";a.textContent="\uD83E\uDDEA \uC2DC\uBBAC\uB808\uC774\uC158 \uC911 \u00B7 \uC2DC\uD5D8\uC6A9 \uAE30\uB85D \u00B7 \uB20C\uB7EC\uC11C \uBCF4\uD638\uC790 \uACF5\uAC04\uC73C\uB85C";a.style.cssText="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#6d28d9;color:#fff;text-align:center;font:800 13px/1.2 system-ui,sans-serif;padding:7px 10px;text-decoration:none";function add(){document.body.appendChild(a)}if(document.body){add()}else{document.addEventListener("DOMContentLoaded",add)}}).catch(function(){})</script>';
writeFileSync(indexPath, readFileSync(indexPath, 'utf8').replace('<head>', '<head>' + gateScript));
const SKIP = new Set(['index.html', 'asset-manifest.json', 'prefetch-manifest.json', 'prepare.html', 'service-worker.js']);
const files = readdirSync(out, { withFileTypes: true, recursive: true })
  .filter(d => d.isFile())
  .map(d => path.relative(out, path.join(d.parentPath ?? d.path, d.name)).split(path.sep).join('/'))
  .filter(p => !SKIP.has(p) && !p.startsWith('.'))
  .sort()
  .map(p => [p, statSync(path.join(out, p)).size]);
writeFileSync(path.join(out, 'prefetch-manifest.json'), JSON.stringify({ version, files }));
const totalMb = (files.reduce((a, [, s]) => a + s, 0) / 1048576).toFixed(0);
console.log(`✅ battle/ 완료: dist/client/battle 에 파일 ${files.length + SKIP.size}개, 미리 받을 파일 ${files.length}개 (${totalMb}MB), 버전 ${version}`);
