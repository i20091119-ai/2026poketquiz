-- 활동 기록: 아이가 한 행동을 시간 순서대로 남깁니다 ("아이 기록 내보내기"의 재료).
-- player: family(아이 기록) / sim(시험용). 시험용은 아예 쓰지 않지만 열을 남겨 둡니다.
-- at: 저장 시각(UTC), date: 게임 날짜(한국), kind: 종류(answer·stat·pokemon…), data: 내용(JSON)
-- ukey: 있으면 같은 (player, kind, ukey) 한 줄만 두고 덮어씀 (하루 활동 요약)
CREATE TABLE IF NOT EXISTS activity_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  player TEXT NOT NULL,
  at TEXT NOT NULL,
  date TEXT NOT NULL,
  kind TEXT NOT NULL,
  ukey TEXT,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_player ON activity_log (player, seq);
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_ukey ON activity_log (player, kind, ukey) WHERE ukey IS NOT NULL;
