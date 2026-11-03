-- 롤 계정 여러 개 연결 (v3.155): 회원마다 최대 5개, 메인은 members.riot_puuid (이름·디스코드 별명이 따른다)
CREATE TABLE IF NOT EXISTS member_accounts (
  puuid TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  riot_id TEXT,
  added_at INTEGER NOT NULL,
  -- 이 시각 이후의 판만 내 기록으로 (부계정은 등록한 날부터, v3.155). 예전 연결·처음 연결한 계정은 0 = 처음부터
  since INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_member_accounts_member ON member_accounts (member_id);
INSERT OR IGNORE INTO member_accounts (puuid, member_id, riot_id, added_at, since)
  SELECT riot_puuid, id, riot_id, CAST(strftime('%s', 'now') AS INTEGER) * 1000, 0 FROM members WHERE riot_puuid IS NOT NULL;
