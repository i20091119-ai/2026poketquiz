// 포켓몬 그림(공식 일러스트, PokeAPI 저장소)을 우리 사이트에 직접 두려고 빌드 전에 내려받습니다.
// 외부 사이트(포켓몬코리아·pokemon.com)가 막히거나 느린 기기에서도 그림이 보이게 하기 위해서입니다.
// 이로치(색이 다른 포켓몬) 그림도 shiny/ 아래에, 메가 모습 그림은 mega/ 아래에 같이 받습니다 (도감 이로치·메가 탭용).
// 이미 받은 파일은 건너뛰므로 두 번째부터는 금방 끝납니다. (npm run build 전에 자동 실행: package.json 의 prebuild)
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const out = path.join(root, 'public', 'assets', 'pokemon');
const SOURCE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/';
const CONCURRENCY = 16;

mkdirSync(path.join(out, 'shiny'), { recursive: true });
mkdirSync(path.join(out, 'mega'), { recursive: true });
const total = JSON.parse(readFileSync(path.join(root, 'lib', 'data', 'pokedex.json'), 'utf8')).length;
// 받을 것: [상대 경로, 원본 경로]. 기본 그림 `1.png`, 이로치 `shiny/1.png`
const jobs = Array.from({ length: total }, (_, i) => i + 1)
  .flatMap(id => [[`${id}.png`, `${id}.png`], [path.join('shiny', `${id}.png`), `shiny/${id}.png`]])
  // 메가 모습 96개: lib/data/megas.json 의 [키, 도감 번호, 이름, 그림 번호, PokeAPI 이름]
  .concat(JSON.parse(readFileSync(path.join(root, 'lib', 'data', 'megas.json'), 'utf8')).map(([, , , art]) => [path.join('mega', `${art}.png`), `${art}.png`]))
  .filter(([file]) => !(existsSync(path.join(out, file)) && statSync(path.join(out, file)).size > 1000));
if (jobs.length === 0) { console.log(`✅ 포켓몬 그림 ${total}장(+이로치·메가) 이미 있음`); process.exit(0); }
console.log(`포켓몬 그림 ${jobs.length}장 받는 중… (${out})`);

let done = 0, failed = 0;
async function fetchOne([file, remote]) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${SOURCE}${remote}`);
      if (res.ok) { writeFileSync(path.join(out, file), Buffer.from(await res.arrayBuffer())); done++; return; }
      if (res.status === 404) { failed++; return; }
    } catch { /* 다시 시도 */ }
    await new Promise(r => setTimeout(r, 500 * attempt));
  }
  failed++;
}
const queue = [...jobs];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (queue.length) await fetchOne(queue.shift()); }));
console.log(`✅ 포켓몬 그림: 새로 ${done}장${failed ? `, 못 받음 ${failed}장 (화면에서는 다른 출처로 대신 보여 줌)` : ''}`);
