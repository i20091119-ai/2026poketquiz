// D1 저장소 접근. 서버(라우트)에서만 사용합니다.
import { env } from 'cloudflare:workers';
import { defaultRules, normalizeRules, type RestRule } from '../battle-rest.ts';
import { DEFAULT_GRADE, GIFT_LIMIT_DEFAULT, GRADES, SHINY_CHANCE_BALLS, SHINY_CHANCE_DEFAULT, SHINY_CHANCE_MAX, SUBJECTS, type GiftLimits, type ShinyBallKind, type Subject } from '../game-config.ts';
import { initialState, type ActiveBank, type GameState, type Question } from '../game-engine.ts';
import type { QuestionInput } from '../question-import.ts';
import { SAMPLE_BANK_TITLE, sampleQuestions } from '../sample-bank.ts';
import type { LogEntry } from '../activity-log.ts';
import { setStrongOverrides, type StrongOverrides } from '@/lib/pokedex';

/** 기록 이름. family = 아이의 진짜 기록, sim = 보호자 시뮬레이션용 시험 기록 (lib/server/player.ts) */
export type PlayerId = 'family' | 'sim';
export const REAL_PLAYER: PlayerId = 'family';
export const SIM_PLAYER: PlayerId = 'sim';

export function db(): D1Database {
  if (!env.DB) throw new Error('D1 데이터베이스(DB)가 연결되지 않았어요. wrangler.jsonc를 확인해 주세요.');
  return env.DB;
}

// 응답마다 지금 올라가 있는 버전을 같이 보냅니다. 화면이 예전 버전이면 스스로 새로고침합니다.
export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-App-Version': __APP_VERSION__ } });

// ---------- 게임 상태 ----------
export async function readState(player: PlayerId = REAL_PLAYER) {
  const d = db();
  await d.prepare('INSERT OR IGNORE INTO game_state (id, revision, document, updated_at) VALUES (?, 0, ?, ?)')
    .bind(player, JSON.stringify(initialState()), new Date().toISOString()).run();
  const row = await d.prepare('SELECT revision, document FROM game_state WHERE id = ?').bind(player)
    .first<{ revision: number; document: string }>();
  if (!row) throw new Error('게임 기록을 불러오지 못했어요.');
  return { revision: row.revision, state: { ...initialState(), ...JSON.parse(row.document) } as GameState };
}

/** 아이 게임 기록을 지웁니다. 다음에 열면 파트너 고르기부터 다시 시작합니다. (문제은행은 그대로) */
export async function resetGame(player: PlayerId = REAL_PLAYER) {
  await db().prepare('DELETE FROM game_state WHERE id = ?').bind(player).run();
}

/** 기록을 통째로 덮어씁니다 (시뮬레이션 시작: 아이 기록 복사 / 빈 기록). 진짜 기록에는 쓰지 않습니다. */
export async function overwriteState(player: typeof SIM_PLAYER, state: GameState) {
  await db().prepare(`INSERT INTO game_state (id, revision, document, updated_at) VALUES (?, 0, ?, ?)
    ON CONFLICT(id) DO UPDATE SET document = excluded.document, revision = game_state.revision + 1, updated_at = excluded.updated_at`)
    .bind(player, JSON.stringify(state), new Date().toISOString()).run();
}

/** revision이 그대로일 때만 저장합니다. 다른 요청이 먼저 저장했다면 false. */
export async function saveState(state: GameState, revision: number, player: PlayerId = REAL_PLAYER) {
  const result = await db().prepare('UPDATE game_state SET document = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?')
    .bind(JSON.stringify(state), new Date().toISOString(), player, revision).run();
  return result.meta.changes === 1;
}

/** 상태를 읽고 → 바꾸고 → 저장. 충돌하면 다시 시도합니다. */
export async function mutateState<T>(change: (state: GameState) => { result: T; changed: boolean }, player: PlayerId = REAL_PLAYER) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { revision, state } = await readState(player);
    const { result, changed } = change(state);
    if (!changed || await saveState(state, revision, player)) return { state, result };
  }
  throw new Error('다른 화면에서 기록이 바뀌었어요. 다시 시도해 주세요.');
}

// ---------- 시뮬레이션 날짜 ----------
// 보호자가 "다음 날로 넘기기"를 누른 횟수. 시험용 기록의 오늘 = 진짜 오늘 + 이 값(일).
export async function getSimDayOffset(): Promise<number> {
  const row = await db().prepare("SELECT value FROM settings WHERE key = 'sim_day_offset'").first<{ value: string }>();
  return Math.max(0, Number(row?.value) || 0);
}
export async function setSimDayOffset(days: number) {
  await db().prepare("INSERT INTO settings (key, value) VALUES ('sim_day_offset', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(String(days)).run();
}

// ---------- 이로치 확률 ----------
export type ShinyChances = Record<ShinyBallKind, number>;
/** 보호자 개발자 메뉴에서 정한 볼별 이로치 확률(%). 정하지 않은 볼은 기본값 */
export async function getShinyChance(): Promise<ShinyChances> {
  const row = await db().prepare("SELECT value FROM settings WHERE key = 'shiny_chance'").first<{ value: string }>();
  const out = { ...SHINY_CHANCE_DEFAULT };
  try {
    const v = row ? JSON.parse(row.value) as Record<string, unknown> : {};
    for (const k of SHINY_CHANCE_BALLS) { const n = Number(v[k]); if (v[k] !== undefined && Number.isFinite(n)) out[k] = Math.max(0, Math.min(SHINY_CHANCE_MAX, n)); }
  } catch { /* 기본값 */ }
  return out;
}
export async function setShinyChance(values: Partial<ShinyChances> | null) {
  if (values === null) { await db().prepare("DELETE FROM settings WHERE key = 'shiny_chance'").run(); return; }
  const clean: Partial<ShinyChances> = {};
  for (const k of SHINY_CHANCE_BALLS) { const n = Number(values[k]); if (values[k] !== undefined && Number.isFinite(n)) clean[k] = Math.max(0, Math.min(SHINY_CHANCE_MAX, Math.round(n * 10) / 10)); }
  await db().prepare("INSERT INTO settings (key, value) VALUES ('shiny_chance', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(clean)).run();
}
/** 시뮬레이션에서만: 이로치 확률을 모두 100%로 (볼 열기 시험용). 진짜 기록에는 영향 없음 */
export async function getSimShinyAll(): Promise<boolean> {
  const row = await db().prepare("SELECT value FROM settings WHERE key = 'sim_shiny_all'").first<{ value: string }>();
  return row?.value === '1';
}
export async function setSimShinyAll(on: boolean) {
  await db().prepare("INSERT INTO settings (key, value) VALUES ('sim_shiny_all', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(on ? '1' : '0').run();
}
/** 이 기록에서 볼을 열 때 쓸 이로치 확률 */
export async function shinyChanceFor(player: PlayerId): Promise<ShinyChances> {
  if (player === SIM_PLAYER && (await getSimShinyAll())) return Object.fromEntries(SHINY_CHANCE_BALLS.map(k => [k, SHINY_CHANCE_MAX])) as ShinyChances;
  return getShinyChance();
}

// ---------- 설정 ----------
export async function getGrade(): Promise<string> {
  const row = await db().prepare("SELECT value FROM settings WHERE key = 'grade'").first<{ value: string }>();
  return row?.value ?? DEFAULT_GRADE;
}
export async function setGrade(grade: string) {
  if (!(GRADES as readonly string[]).includes(grade)) throw new Error('학년을 다시 골라 주세요.');
  await db().prepare("INSERT INTO settings (key, value) VALUES ('grade', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(grade).run();
}

// ---------- 포켓로그(/battle) 하루 플레이 시간 제한 (분, 0 = 없음) ----------
export async function getBattleLimitMinutes(): Promise<number> {
  const row = await db().prepare("SELECT value FROM settings WHERE key = 'battle_limit_minutes'").first<{ value: string }>();
  return Math.max(0, Number(row?.value) || 0);
}
export async function setBattleLimitMinutes(minutes: number) {
  await db().prepare("INSERT INTO settings (key, value) VALUES ('battle_limit_minutes', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(String(minutes)).run();
}

// ---------- 포켓로그(/battle) 판 안 진화 허용 (기본 꺼짐: 레벨이 올라도 진화하지 않고, 진화 아이템도 보상에 안 나옴) ----------
/** 보호자 공간 "속성 변경"에서 바꾼 센 포켓몬·도전 속성 (lib/pokedex.ts StrongOverrides) */
export async function getStrongOverrides(): Promise<StrongOverrides> {
  const row = await db().prepare("SELECT value FROM settings WHERE key = 'strong_overrides'").first<{ value: string }>();
  try {
    const v = row ? JSON.parse(row.value) as Partial<StrongOverrides> : {};
    return { strong: v.strong ?? {}, third: v.third ?? {} };
  } catch {
    return { strong: {}, third: {} };
  }
}
export async function saveStrongOverrides(ov: StrongOverrides) {
  await db().prepare("INSERT INTO settings (key, value) VALUES ('strong_overrides', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(ov)).run();
}
/** 요청을 처리하기 전에 센 포켓몬 설정을 맞춥니다 (진화 조건 계산에 씀) */
export async function loadStrongOverrides(): Promise<StrongOverrides> {
  const ov = await getStrongOverrides();
  setStrongOverrides(ov);
  return ov;
}

export async function getBattleEvolutionAllowed(): Promise<boolean> {
  const row = await db().prepare("SELECT value FROM settings WHERE key = 'battle_evolution_allowed'").first<{ value: string }>();
  return row?.value === '1';
}
export async function setBattleEvolutionAllowed(allowed: boolean) {
  await db().prepare("INSERT INTO settings (key, value) VALUES ('battle_evolution_allowed', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(allowed ? '1' : '0').run();
}

// ---------- 설정 공통 (문자열 하나) ----------
async function getSetting(key: string): Promise<string | null> {
  const row = await db().prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? null;
}
async function setSetting(key: string, value: string | null) {
  if (value === null) await db().prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
  else await db().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value).run();
}

// ---------- 보호자 선물 한도 ----------
export async function getGiftLimits(): Promise<GiftLimits> {
  try {
    const raw = JSON.parse((await getSetting('gift_limits')) ?? 'null') as Partial<GiftLimits> | null;
    const num = (v: unknown, d: number) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : d);
    return { small: num(raw?.small, GIFT_LIMIT_DEFAULT.small), medium: num(raw?.medium, GIFT_LIMIT_DEFAULT.medium), large: num(raw?.large, GIFT_LIMIT_DEFAULT.large) };
  } catch { return { ...GIFT_LIMIT_DEFAULT }; }
}
export const setGiftLimits = (limits: GiftLimits) => setSetting('gift_limits', JSON.stringify(limits));

// ---------- 포켓로그 쉬는 시간 ----------
export async function getBattleRest(): Promise<RestRule[]> {
  const raw = await getSetting('battle_rest');
  if (raw === null) return defaultRules();
  try { return normalizeRules(JSON.parse(raw)); } catch { return defaultRules(); }
}
export const setBattleRest = (rules: RestRule[]) => setSetting('battle_rest', JSON.stringify(rules));
/** "오늘만 열어 주기"를 누른 날짜 (그날이 지나면 저절로 풀림) */
export const getRestOpenDate = () => getSetting('battle_rest_open');
export const setRestOpenDate = (date: string | null) => setSetting('battle_rest_open', date);

// ---------- 포켓로그 게임 오버 판 (부활권) ----------
const RUNS_KEEP = 30;
export type RunInput = { id: string; wave: number; victory: boolean; data: string };
/** 게임이 올린 판들을 저장합니다 (같은 판은 한 번만). 기록마다 최근 RUNS_KEEP 판만 남깁니다. 새로 넣은 수를 돌려줍니다. */
export async function saveRuns(player: PlayerId, runs: RunInput[]): Promise<{ count: number; fresh: RunInput[] }> {
  let added = 0;
  const fresh: RunInput[] = [];
  const now = new Date().toISOString();
  for (const r of runs) {
    const res = await db().prepare('INSERT OR IGNORE INTO battle_runs (player, id, wave, victory, data, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(player, r.id, r.wave, r.victory ? 1 : 0, r.data, now).run();
    added += res.meta.changes ?? 0;
    if (res.meta.changes) fresh.push(r);
  }
  if (added) {
    await db().prepare(`DELETE FROM battle_runs WHERE player = ? AND id NOT IN (SELECT id FROM battle_runs WHERE player = ? ORDER BY CAST(id AS INTEGER) DESC LIMIT ${RUNS_KEEP})`)
      .bind(player, player).run();
  }
  return { count: added, fresh };
}
/** 부활권으로 되살릴 수 있는 가장 최근 게임 오버 판 (이긴 판·이미 되살린 판 제외) */
export async function latestDefeat(player: PlayerId): Promise<{ id: string; wave: number } | null> {
  const row = await db().prepare('SELECT id, wave FROM battle_runs WHERE player = ? AND victory = 0 AND revived_at IS NULL ORDER BY CAST(id AS INTEGER) DESC LIMIT 1')
    .bind(player).first<{ id: string; wave: number }>();
  return row ?? null;
}
/** 판 저장을 꺼내고 "되살림"으로 표시합니다. 없거나 이미 되살렸으면 null */
export async function takeRunForRevive(player: PlayerId, id: string): Promise<{ wave: number; data: string } | null> {
  const row = await db().prepare('SELECT wave, data FROM battle_runs WHERE player = ? AND id = ? AND victory = 0 AND revived_at IS NULL').bind(player, id).first<{ wave: number; data: string }>();
  if (!row) return null;
  await db().prepare('UPDATE battle_runs SET revived_at = ? WHERE player = ? AND id = ?').bind(new Date().toISOString(), player, id).run();
  return row;
}
/** 되살림 표시를 되돌립니다 (부활권을 못 썼을 때) */
export async function undoRevive(player: PlayerId, id: string) {
  await db().prepare('UPDATE battle_runs SET revived_at = NULL WHERE player = ? AND id = ?').bind(player, id).run();
}

// ---------- 시뮬레이션 시각 ('HH:MM', 없으면 진짜 시각) ----------
export const getSimClock = () => getSetting('sim_clock');
export const setSimClock = (clock: string | null) => setSetting('sim_clock', clock);

// ---------- 포켓로그(/battle) 비밀번호 ----------
// 비밀번호 자체가 아니라 서명값(해시)만 저장합니다 (lib/server/battle-auth.ts).
export async function getBattlePasswordHash(): Promise<string | null> {
  const row = await db().prepare("SELECT value FROM settings WHERE key = 'battle_password'").first<{ value: string }>();
  return row?.value ?? null;
}
export async function setBattlePasswordHash(hash: string | null) {
  if (hash === null) await db().prepare("DELETE FROM settings WHERE key = 'battle_password'").run();
  else await db().prepare("INSERT INTO settings (key, value) VALUES ('battle_password', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(hash).run();
}

// ---------- 문제은행 ----------
type QuestionRow = { id: number; bank_id: number; subject: string; type: string; prompt: string; choices: string; answer: number; explanation: string; area: string | null };
const toQuestion = (r: QuestionRow): Question => ({
  id: r.id, subject: r.subject as Subject, type: r.type as Question['type'], prompt: r.prompt,
  choices: JSON.parse(r.choices), answer: r.answer, explanation: r.explanation, area: r.area ?? '',
});

export type BankRow = { id: number; title: string; grade: string; keywords: string; status: 'draft' | 'published' | 'archived'; created_at: string; published_at: string | null };

export async function bankQuestions(bankId: number) {
  const { results } = await db().prepare('SELECT * FROM questions WHERE bank_id = ? ORDER BY id').bind(bankId).all<QuestionRow>();
  return results.map(toQuestion);
}

/** 공개 중인 문제은행. 문제은행이 하나도 없으면 샘플 문제은행을 만들어 공개합니다. */
export async function activeBank(): Promise<ActiveBank | null> {
  let row = await db().prepare("SELECT * FROM question_banks WHERE status = 'published' ORDER BY published_at DESC LIMIT 1").first<BankRow>();
  if (!row) {
    // 샘플은 처음 한 번만 넣습니다. (동시에 들어온 요청이 두 번 넣지 않도록 settings에 표시)
    const claim = await db().prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('sample_seeded', '1')").run();
    if (claim.meta.changes !== 1) return null;
    const id = await createBank(SAMPLE_BANK_TITLE, DEFAULT_GRADE, {});
    await addQuestions(id, sampleQuestions);
    await publishBank(id);
    row = await db().prepare('SELECT * FROM question_banks WHERE id = ?').bind(id).first<BankRow>();
    if (!row) return null;
  }
  return { id: row.id, title: row.title, questions: await bankQuestions(row.id) };
}

export async function listBanks() {
  const { results } = await db().prepare(
    `SELECT b.*, (SELECT COUNT(*) FROM questions q WHERE q.bank_id = b.id) AS question_count
     FROM question_banks b ORDER BY b.id DESC`).all<BankRow & { question_count: number }>();
  return results.map(b => ({ ...b, keywords: JSON.parse(b.keywords) as Partial<Record<Subject, string>> }));
}

export async function getBank(id: number) {
  return db().prepare('SELECT * FROM question_banks WHERE id = ?').bind(id).first<BankRow>();
}

export async function createBank(title: string, grade: string, keywords: Partial<Record<Subject, string>>) {
  const clean = Object.fromEntries(SUBJECTS.filter(s => keywords[s]?.trim()).map(s => [s, keywords[s]!.trim().slice(0, 500)]));
  const row = await db().prepare('INSERT INTO question_banks (title, grade, keywords, status, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(title.trim().slice(0, 100) || '새 문제은행', grade, JSON.stringify(clean), 'draft', new Date().toISOString()).first<{ id: number }>();
  if (!row) throw new Error('문제은행을 만들지 못했어요.');
  return row.id;
}

export async function updateBank(id: number, title: string, grade: string, keywords: Partial<Record<Subject, string>>) {
  const clean = Object.fromEntries(SUBJECTS.filter(s => keywords[s]?.trim()).map(s => [s, keywords[s]!.trim().slice(0, 500)]));
  await db().prepare('UPDATE question_banks SET title = ?, grade = ?, keywords = ? WHERE id = ?')
    .bind(title.trim().slice(0, 100) || '새 문제은행', grade, JSON.stringify(clean), id).run();
}

export async function addQuestions(bankId: number, questions: QuestionInput[]) {
  const now = new Date().toISOString();
  const stmt = db().prepare('INSERT INTO questions (bank_id, subject, type, prompt, choices, answer, explanation, area, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  // D1 batch는 한 번에 너무 많으면 실패할 수 있어 나눠서 넣습니다.
  for (let i = 0; i < questions.length; i += 50) {
    await db().batch(questions.slice(i, i + 50).map(q =>
      stmt.bind(bankId, q.subject, q.type, q.prompt, JSON.stringify(q.choices), q.answer, q.explanation, q.area ?? '', now)));
  }
}

export async function publishBank(id: number) {
  const now = new Date().toISOString();
  await db().batch([
    db().prepare("UPDATE question_banks SET status = 'archived' WHERE status = 'published' AND id != ?").bind(id),
    db().prepare("UPDATE question_banks SET status = 'published', published_at = ? WHERE id = ?").bind(now, id),
  ]);
}

export async function deleteBank(id: number) {
  await db().batch([
    db().prepare('DELETE FROM questions WHERE bank_id = ?').bind(id),
    db().prepare('DELETE FROM question_banks WHERE id = ?').bind(id),
  ]);
}

export async function updateQuestion(id: number, q: QuestionInput) {
  await db().prepare('UPDATE questions SET subject = ?, type = ?, prompt = ?, choices = ?, answer = ?, explanation = ?, area = ? WHERE id = ?')
    .bind(q.subject, q.type, q.prompt, JSON.stringify(q.choices), q.answer, q.explanation, q.area ?? '', id).run();
}

export async function deleteQuestion(id: number) {
  await db().prepare('DELETE FROM questions WHERE id = ?').bind(id).run();
}

// ---------- 활동 기록 (아이 기록 내보내기) ----------
/**
 * 활동 기록을 남깁니다. 시험용(sim) 기록은 남기지 않습니다. 기록이 실패해도 게임은 계속되게 오류는 삼킵니다.
 * 처음 남길 때 "기록 시작일"도 settings.activity_log_since 에 한 번 적어 둡니다.
 */
export async function appendActivity(player: PlayerId, date: string, entries: LogEntry[]) {
  if (player !== REAL_PLAYER || !entries.length) return;
  try {
    const d = db();
    const now = new Date().toISOString();
    await d.batch([d.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('activity_log_since', ?)").bind(date), ...entries.map(e => e.ukey === undefined
      ? d.prepare('INSERT INTO activity_log (player, at, date, kind, ukey, data) VALUES (?, ?, ?, ?, NULL, ?)').bind(player, now, date, e.kind, JSON.stringify(e.data))
      : d.prepare(`INSERT INTO activity_log (player, at, date, kind, ukey, data) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(player, kind, ukey) WHERE ukey IS NOT NULL DO UPDATE SET at = excluded.at, data = excluded.data`).bind(player, now, date, e.kind, e.ukey, JSON.stringify(e.data)))]);
  } catch (error) {
    console.error('활동 기록 저장 실패', error);
  }
}
export type ActivityRow = { seq: number; at: string; date: string; kind: string; data: Record<string, unknown> };
export async function readActivity(player: PlayerId = REAL_PLAYER): Promise<{ since: string | null; rows: ActivityRow[] }> {
  const d = db();
  const [since, res] = await Promise.all([
    d.prepare("SELECT value FROM settings WHERE key = 'activity_log_since'").first<{ value: string }>(),
    d.prepare('SELECT seq, at, date, kind, data FROM activity_log WHERE player = ? ORDER BY seq').bind(player).all<{ seq: number; at: string; date: string; kind: string; data: string }>(),
  ]);
  return {
    since: since?.value ?? null,
    rows: (res.results ?? []).map(r => ({ seq: r.seq, at: r.at, date: r.date, kind: r.kind, data: JSON.parse(r.data) as Record<string, unknown> })),
  };
}
