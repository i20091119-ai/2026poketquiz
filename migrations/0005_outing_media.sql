-- 나들이 체험보고서의 사진(보호자가 올림)과 그림(아이가 그림). 아이 기록(game_state)과 따로 보관합니다.
-- id: 짐작할 수 없는 긴 번호, player: family / sim, kind: photo / drawing, data: 줄인 그림(base64), mime: image/jpeg 등
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  player TEXT NOT NULL,
  kind TEXT NOT NULL,
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
