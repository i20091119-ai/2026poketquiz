// D1 저장소 접근. 서버(라우트)에서만 사용합니다.
import { env } from 'cloudflare:workers';
import { DEFAULT_GRADE, GRADES, SUBJECTS, type Subject } from '../game-config.ts';
import { initialState, type ActiveBank, type GameState, type Question } from '../game-engine.ts';
import type { QuestionInput } from '../question-import.ts';
import { SAMPLE_BANK_TITLE, sampleQuestions } from '../sample-bank.ts';

const PLAYER_ID = 'family';

export function db(): D1Database {
  if (!env.DB) throw new Error('D1 데이터베이스(DB)가 연결되지 않았어요. wrangler.jsonc를 확인해 주세요.');
  return env.DB;
}

// 응답마다 지금 올라가 있는 버전을 같이 보냅니다. 화면이 예전 버전이면 스스로 새로고침합니다.
export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-App-Version': __APP_VERSION__ } });

// ---------- 게임 상태 ----------
export async function readState() {
  const d = db();
  await d.prepare('INSERT OR IGNORE INTO game_state (id, revision, document, updated_at) VALUES (?, 0, ?, ?)')
    .bind(PLAYER_ID, JSON.stringify(initialState()), new Date().toISOString()).run();
  const row = await d.prepare('SELECT revision, document FROM game_state WHERE id = ?').bind(PLAYER_ID)
    .first<{ revision: number; document: string }>();
  if (!row) throw new Error('게임 기록을 불러오지 못했어요.');
  return { revision: row.revision, state: { ...initialState(), ...JSON.parse(row.document) } as GameState };
}

/** 아이 게임 기록을 지웁니다. 다음에 열면 파트너 고르기부터 다시 시작합니다. (문제은행은 그대로) */
export async function resetGame() {
  await db().prepare('DELETE FROM game_state WHERE id = ?').bind(PLAYER_ID).run();
}

/** revision이 그대로일 때만 저장합니다. 다른 요청이 먼저 저장했다면 false. */
export async function saveState(state: GameState, revision: number) {
  const result = await db().prepare('UPDATE game_state SET document = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?')
    .bind(JSON.stringify(state), new Date().toISOString(), PLAYER_ID, revision).run();
  return result.meta.changes === 1;
}

/** 상태를 읽고 → 바꾸고 → 저장. 충돌하면 다시 시도합니다. */
export async function mutateState<T>(change: (state: GameState) => { result: T; changed: boolean }) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { revision, state } = await readState();
    const { result, changed } = change(state);
    if (!changed || await saveState(state, revision)) return { state, result };
  }
  throw new Error('다른 화면에서 기록이 바뀌었어요. 다시 시도해 주세요.');
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
type QuestionRow = { id: number; bank_id: number; subject: string; type: string; prompt: string; choices: string; answer: number; explanation: string };
const toQuestion = (r: QuestionRow): Question => ({
  id: r.id, subject: r.subject as Subject, type: r.type as Question['type'], prompt: r.prompt,
  choices: JSON.parse(r.choices), answer: r.answer, explanation: r.explanation,
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
  const stmt = db().prepare('INSERT INTO questions (bank_id, subject, type, prompt, choices, answer, explanation, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  // D1 batch는 한 번에 너무 많으면 실패할 수 있어 나눠서 넣습니다.
  for (let i = 0; i < questions.length; i += 50) {
    await db().batch(questions.slice(i, i + 50).map(q =>
      stmt.bind(bankId, q.subject, q.type, q.prompt, JSON.stringify(q.choices), q.answer, q.explanation, now)));
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
  await db().prepare('UPDATE questions SET subject = ?, type = ?, prompt = ?, choices = ?, answer = ?, explanation = ? WHERE id = ?')
    .bind(q.subject, q.type, q.prompt, JSON.stringify(q.choices), q.answer, q.explanation, id).run();
}

export async function deleteQuestion(id: number) {
  await db().prepare('DELETE FROM questions WHERE id = ?').bind(id).run();
}
