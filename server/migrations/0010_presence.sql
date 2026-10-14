-- 접속 상태 점 (웹 / 앱 / 게임 / 앱+게임). 앱·웹이 60초마다 알린다
ALTER TABLE members ADD COLUMN web_seen_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN app_seen_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN app_lol INTEGER NOT NULL DEFAULT 0;   -- 앱이 본 롤 클라이언트 켜짐
ALTER TABLE members ADD COLUMN app_open INTEGER NOT NULL DEFAULT 0;  -- 앱 창이 떠 있음 (0 = 트레이)
