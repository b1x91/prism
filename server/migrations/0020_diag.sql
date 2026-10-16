-- 앱 자동 진단 (v3.64): 게임 위 작은 창이 한 판 내내 안 뜬 판의 인식 기록. 화면 그림은 없다. 관리자만 본다
CREATE TABLE IF NOT EXISTS diag (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS diag_at ON diag (at DESC);
CREATE INDEX IF NOT EXISTS diag_member ON diag (member_id, at DESC);
