-- 시즌 랭킹 보상 (CLAUDE.md v3.188): 시즌이 끝나면 1~3위에게 챔피언 세트(꾸밈 + 시즌 칭호). 영원히 소장
CREATE TABLE IF NOT EXISTS season_rewards (
  season TEXT NOT NULL,
  rank INTEGER NOT NULL,
  member_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  nick TEXT,
  rating INTEGER NOT NULL,
  n INTEGER NOT NULL,
  w INTEGER NOT NULL,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (season, rank, item_id)
);
CREATE INDEX IF NOT EXISTS season_rewards_member ON season_rewards (member_id);
