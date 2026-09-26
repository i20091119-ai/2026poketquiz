// PokeAPI 공개 CSV에서 전국도감 데이터를 받아 lib/data/pokedex.json을 만듭니다.
// 사용법: npm run data:pokedex
import { writeFileSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const TYPE_KEYS = [null, 'normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel',
  'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy'];
const KOREAN = 3;

async function csv(name) {
  const res = await fetch(`${BASE}/${name}.csv`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const [header, ...lines] = (await res.text()).trim().split('\n');
  const cols = header.split(',');
  return lines.map(line => Object.fromEntries(line.split(',').map((v, i) => [cols[i], v])));
}

const [species, names, types] = await Promise.all([
  csv('pokemon_species'), csv('pokemon_species_names'), csv('pokemon_types'),
]);

const nameOf = new Map(names.filter(n => Number(n.local_language_id) === KOREAN)
  .map(n => [Number(n.pokemon_species_id), n.name]));
const typesOf = new Map();
for (const t of types) {
  const id = Number(t.pokemon_id);
  if (id > 10000) continue; // 기본 모습만 사용
  const list = typesOf.get(id) ?? [];
  list[Number(t.slot) - 1] = TYPE_KEYS[Number(t.type_id)];
  typesOf.set(id, list);
}
const fromOf = new Map(species.map(s => [Number(s.id), s.evolves_from_species_id ? Number(s.evolves_from_species_id) : null]));

function stage(id) {
  let n = 1;
  for (let cur = fromOf.get(id); cur; cur = fromOf.get(cur)) n++;
  return n;
}

// [id, 이름, 속성들, 진화 전 id, 단계, 등급, 포획률]
// 등급: 0 흔함, 1 조금 드묾, 2 희귀, 3 전설, 4 환상
const out = species.map(s => {
  const id = Number(s.id);
  const capture = Number(s.capture_rate);
  const tier = s.is_mythical === '1' ? 4 : s.is_legendary === '1' ? 3 : capture <= 45 ? 2 : capture <= 120 ? 1 : 0;
  const name = nameOf.get(id);
  const t = typesOf.get(id);
  if (!name || !t?.length) throw new Error(`데이터 누락: #${id}`);
  return [id, name, t.filter(Boolean), fromOf.get(id), stage(id), tier, capture];
}).sort((a, b) => a[0] - b[0]);

writeFileSync(new URL('../lib/data/pokedex.json', import.meta.url), JSON.stringify(out) + '\n');
console.log(`포켓몬 ${out.length}종 저장 완료`);
