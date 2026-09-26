-- 아이의 게임 진행 (JSON 문서 하나, revision으로 동시 저장 충돌 방지)
CREATE TABLE game_state (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  document TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 부모 설정 (학년 등)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 주차별 문제은행. status: draft(검토 중) / published(아이에게 공개 중, 하나만) / archived(지난 은행)
CREATE TABLE question_banks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  grade TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  published_at TEXT
);

CREATE TABLE questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_id INTEGER NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  choices TEXT NOT NULL,
  answer INTEGER NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX questions_bank ON questions(bank_id, subject);
