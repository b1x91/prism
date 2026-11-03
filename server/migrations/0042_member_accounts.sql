-- 롤 계정 여러 개 연결 (v3.155): 회원마다 최대 5개, 메인은 members.riot_puuid (이름·디스코드 별명이 따른다)
CREATE TABLE IF NOT EXISTS member_accounts (
  puuid TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  riot_id TEXT,
  added_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_member_accounts_member ON member_accounts (member_id);
INSERT OR IGNORE INTO member_accounts (puuid, member_id, riot_id, added_at)
  SELECT riot_puuid, id, riot_id, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM members WHERE riot_puuid IS NOT NULL;
