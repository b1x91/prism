-- 소식 피드 (CLAUDE.md v3.111): 운영진 공지·이벤트 + 저절로 생기는 소식(앱 새 버전·증강 패치·새 시즌)
CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,              -- notice · event · update · patch · season
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  data TEXT,                       -- JSON (패치: 증강 번호, 업데이트: 버전 등)
  pinned INTEGER NOT NULL DEFAULT 0,
  author TEXT,                     -- 쓴 운영진 (자동 소식은 NULL)
  auto_key TEXT,                   -- 자동 소식은 한 번만 (app:태그 · patch:버전 · season:키)
  created_at INTEGER NOT NULL,
  edited_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS news_auto ON news (auto_key);
CREATE INDEX IF NOT EXISTS news_created ON news (created_at);
CREATE TABLE IF NOT EXISTS news_hearts (
  news_id INTEGER NOT NULL,
  member_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (news_id, member_id)
);
-- 어디까지 읽었는지 (메뉴의 빨간 점)
ALTER TABLE members ADD COLUMN news_read_at INTEGER NOT NULL DEFAULT 0;
