-- 시즌 랭킹 보상 (CLAUDE.md v3.188): 시즌이 끝나면 1~3위에게 순위별 프로필 테두리. until 까지(다음 시즌 마감) 쓴다
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
  until INTEGER NOT NULL,
  PRIMARY KEY (season, rank)
);
CREATE INDEX IF NOT EXISTS season_rewards_member ON season_rewards (member_id, until);
