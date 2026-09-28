-- 포켓로그 게임 오버 판 저장 (부활권용). 기기 브라우저에만 있던 원본 "플레이 기록"을 서버에도 둡니다.
-- player: family(아이 기록) / sim(시험용), id: 판이 끝난 시각(원본 플레이 기록의 timestamp), data: 원본 판 저장(JSON)
CREATE TABLE IF NOT EXISTS battle_runs (
  player TEXT NOT NULL,
  id TEXT NOT NULL,
  wave INTEGER NOT NULL,
  victory INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revived_at TEXT,
  PRIMARY KEY (player, id)
);
