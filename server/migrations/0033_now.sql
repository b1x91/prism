-- NOW (v3.126): 롤 아수라장 로비를 앱이 읽어 '지금 모이는 팟'으로. 비회원은 수(size)만, puuid 는 남기지 않는다.
CREATE TABLE IF NOT EXISTS now_lobbies (
  id TEXT PRIMARY KEY,            -- 롤 클라이언트의 로비(파티) ID
  leader_id TEXT,                 -- 방장이 Prism 회원이면 그 회원
  reporter_id TEXT NOT NULL,      -- 마지막으로 알려 준 회원 (그 회원의 앱이 읽었다)
  members TEXT NOT NULL DEFAULT '[]', -- 로비에 있는 Prism 회원 ID (JSON)
  size INTEGER NOT NULL DEFAULT 1,    -- 로비 전체 인원 (비회원 포함)
  phase TEXT NOT NULL DEFAULT 'lobby', -- lobby | queue | game
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- 빈자리 + : 방장에게 알림 (10분 안에 들어오지 않으면 사라진다)
CREATE TABLE IF NOT EXISTS now_requests (
  lobby_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  notified_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (lobby_id, member_id)
);
-- 로비를 NOW에 자동으로 올리기 (기본 켜짐)
ALTER TABLE members ADD COLUMN now_auto INTEGER NOT NULL DEFAULT 1;
