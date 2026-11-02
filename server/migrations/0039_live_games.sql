-- 회원 페이지 '지금 게임 중' 상세 (CLAUDE.md v3.149): 게임 중 회원 앱이 1분마다 알리는 그 판의 10명 (챔프·레벨·KDA·아이템·증강).
-- 비회원은 이름(태그 없이)만, puuid 는 남기지 않는다. 게임이 끝나면 지우고, 5분 소식이 없으면 쓰지 않는다.
CREATE TABLE IF NOT EXISTS live_games (
  member_id  TEXT PRIMARY KEY,           -- 알린 회원
  game_key   TEXT NOT NULL,
  queue      INTEGER NOT NULL DEFAULT 0,
  players    TEXT NOT NULL,              -- [{n, id?, c, t, lv, k, d, a, it[], au[]}]
  members    TEXT NOT NULL DEFAULT '[]', -- 그 판의 회원 ID (다른 회원 페이지에서 찾으려고)
  game_time  INTEGER NOT NULL DEFAULT 0, -- 게임 안 시각(초)
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS live_games_updated ON live_games(updated_at);
