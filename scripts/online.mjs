// 게임을 인터넷(Cloudflare)에 올리는 자동 진행 도구입니다.
// 사용법: npm run online
//   - 처음: Cloudflare 로그인 → 기록 저장소(D1) 만들기 → 표 만들기 → 올리기 → 보호자 비밀번호 정하기
//   - 다음부터: 바뀐 내용만 다시 올립니다. 이미 된 단계는 건너뜁니다.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const WRANGLER = new URL('../node_modules/.bin/wrangler', import.meta.url).pathname;
const CONFIG = new URL('../wrangler.jsonc', import.meta.url);
const DB_NAME = 'poke-quiz-db';
const PLACEHOLDER = '00000000-0000-4000-8000-000000000000';
const quiet = { ...process.env, WRANGLER_SEND_METRICS: 'false', FORCE_COLOR: '0' };

const say = (msg = '') => console.log(msg);
const step = (n, msg) => say(`\n[${n}/5] ${msg}`);
function stop(msg) {
  say(`\n❌ ${msg}`);
  say('이 창의 글자를 모두 복사해서 Claude에게 보내 주시면 도와드릴게요.');
  process.exit(1);
}

/** wrangler를 실행하고 출력 글자를 돌려받습니다. */
function run(args, { input, env } = {}) {
  const r = spawnSync(WRANGLER, args, { encoding: 'utf8', input, env: { ...quiet, ...env } });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}
/** 사람이 답해야 할 수도 있는 단계는 화면에 그대로 보여 줍니다. */
function runVisible(args, env) {
  const r = spawnSync(WRANGLER, args, { stdio: 'inherit', env: { ...quiet, ...env } });
  return r.status === 0;
}

/** 출력 글자 중에서 [ ... ] 로 된 목록 부분만 읽습니다 (앞에 경고 글자가 있어도 괜찮게). */
function jsonList(out) {
  const m = out.match(/(^|\n)\s*\[\s*[{\]]/);
  if (!m) return [];
  try { return JSON.parse(out.slice(m.index + m[1].length)); } catch { return []; }
}

function ask(question, { hidden = false } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    // 입력한 글자 대신 * 를 보여 줍니다 (지우기로 줄을 다시 그릴 때도 글자가 드러나지 않게).
    rl._writeToOutput = s => {
      if (s.includes(question)) process.stdout.write(`\r\x1b[K${question}${'*'.repeat(rl.line.length)}`);
      else if (s !== '\r\n' && s !== '\n') process.stdout.write('*');
    };
  }
  return new Promise(resolve => rl.question(question, a => { rl.close(); if (hidden) say(); resolve(a.trim()); }));
}

say('🌐 포켓몬 배움 탐험대를 인터넷에 올립니다. 중간에 창을 닫지 말아 주세요.');

// 1. 로그인
step(1, 'Cloudflare 로그인 확인');
if (/not authenticated/i.test(run(['whoami']).out)) {
  say('브라우저가 열리면 Cloudflare에 로그인하고 "Allow(허용)"를 눌러 주세요.');
  if (!runVisible(['login']) || /not authenticated/i.test(run(['whoami']).out)) stop('Cloudflare 로그인에 실패했어요.');
}
say('✅ 로그인되어 있어요.');

// 2. 기록 저장소
step(2, '기록 저장소(D1) 준비');
const findDb = () => jsonList(run(['d1', 'list', '--json']).out).find(d => d.name === DB_NAME);
let db = findDb();
if (!db) {
  say('처음이라 새로 만들어요…');
  const created = run(['d1', 'create', DB_NAME], { env: { CI: 'true' } });
  if (!created.ok) { say(created.out); stop('기록 저장소를 만들지 못했어요.'); }
  db = findDb();
}
if (!db?.uuid) stop('기록 저장소 정보를 찾지 못했어요.');
const config = readFileSync(CONFIG, 'utf8');
const updated = config.replace(/("database_id":\s*")[^"]*(")/, `$1${db.uuid}$2`);
if (updated !== config) writeFileSync(CONFIG, updated);
if (config.includes(PLACEHOLDER)) say(`(저장소 번호: ${db.uuid} — Claude에게 알려 주시면 설정에 저장해 둘게요)`);
say('✅ 기록 저장소가 준비됐어요.');

// 3. 표 만들기 (이미 된 부분은 건너뜀)
step(3, '기록 저장소 안에 표 만들기');
const migrated = run(['d1', 'migrations', 'apply', 'DB', '--remote'], { env: { CI: 'true' } });
if (!migrated.ok) { say(migrated.out); stop('표를 만들지 못했어요.'); }
say('✅ 표가 준비됐어요.');

// 4. 올리기
step(4, '게임을 만들어서 올리기 (1~2분 걸려요)');
const build = spawnSync('npm', ['run', 'build'], { encoding: 'utf8', env: quiet });
if (build.status !== 0) { say(`${build.stdout}${build.stderr}`); stop('게임을 만드는 중에 문제가 생겼어요.'); }
// 먼저 질문 없이 올려 보고, workers.dev 주소 이름을 정해야 한다면 화면을 보여 주며 다시 올립니다.
let deployed = run(['deploy'], { env: { CI: 'true' } });
if (!deployed.ok) {
  if (/workers\.dev|subdomain/i.test(deployed.out)) {
    say('처음이라 인터넷 주소 이름을 정해야 해요. 질문이 나오면 영어 소문자로 원하는 이름(예: our-family)을 입력하고 Enter를 누르세요.');
    if (!runVisible(['deploy'])) stop('인터넷에 올리지 못했어요.');
    deployed = { ok: true, out: run(['deploy'], { env: { CI: 'true' } }).out };
  } else if (/verify your email/i.test(deployed.out)) {
    stop('Cloudflare 가입 인증 메일을 아직 누르지 않았어요. 메일함(스팸함 포함)에서 Cloudflare 메일을 찾아 인증 버튼을 누른 뒤, npm run online 을 다시 실행해 주세요.');
  } else { say(deployed.out); stop('인터넷에 올리지 못했어요.'); }
}
const siteUrl = deployed.out.match(/https:\/\/[\w.-]+\.workers\.dev/)?.[0];
say('✅ 올리기 완료!');

// 5. 보호자 비밀번호
step(5, '보호자 공간 비밀번호 확인');
let hasPassword;
hasPassword = jsonList(run(['secret', 'list', '--format', 'json']).out).some(s => s.name === 'PARENT_PASSWORD');
if (hasPassword) {
  say('✅ 비밀번호가 이미 정해져 있어요. (바꾸려면: npx wrangler secret put PARENT_PASSWORD)');
} else {
  let pw = '';
  while (pw.length < 6) {
    pw = await ask('보호자 공간 비밀번호를 정해 주세요 (6자 이상, 입력한 글자는 *로 보여요): ', { hidden: true });
    if (pw.length < 6) say('6자 이상으로 정해 주세요.');
  }
  const again = await ask('한 번 더 입력해 주세요: ', { hidden: true });
  if (again !== pw) stop('두 번 입력한 비밀번호가 달라요. npm run online 을 다시 실행해 주세요.');
  const put = run(['secret', 'put', 'PARENT_PASSWORD'], { input: pw + '\n' });
  if (!put.ok) { say(put.out); stop('비밀번호를 저장하지 못했어요.'); }
  say('✅ 비밀번호를 저장했어요.');
}

say('\n🎉 모두 끝났어요!');
if (siteUrl) {
  say(`   아이 게임:    ${siteUrl}`);
  say(`   보호자 공간:  ${siteUrl}/parent`);
  say('   아이 태블릿의 사파리에서 위 주소를 열고, 공유 버튼 → "홈 화면에 추가"를 누르면 앱처럼 쓸 수 있어요.');
} else {
  say('   주소는 위에 나온 https://…workers.dev 주소예요.');
}
if (siteUrl) { try { execFileSync('open', [siteUrl]); } catch { /* 맥이 아니면 무시 */ } }
