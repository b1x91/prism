-- v3.178: 보상(피스·도감·미션·도전·칭호·장인)은 앱이 켜져 있던 동안 한 판만.
-- 앱을 끈 채 한 판은 기록·랭킹·회원 페이지에는 그대로 들어가지만 보상에는 세지 않는다.
-- 이 마이그레이션이 적용된 순간 이전의 판은 예전처럼 모두 센다 (모은 피스·도감이 줄지 않게).
ALTER TABLE participants ADD COLUMN live INTEGER NOT NULL DEFAULT 0;

-- 앱이 '게임 중'을 알린 시각 (접속 알림, 30초 단위). 판이 기록될 때 그 판 시간 안에 있으면 live = 1
CREATE TABLE IF NOT EXISTS app_game_seen (
  member_id TEXT NOT NULL,
  at        INTEGER NOT NULL,
  PRIMARY KEY (member_id, at)
);

CREATE TABLE IF NOT EXISTS reward_cfg (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  since INTEGER NOT NULL
);
INSERT OR IGNORE INTO reward_cfg (id, since) VALUES (1, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

CREATE VIEW IF NOT EXISTS reward_participants AS
  SELECT p.* FROM participants p
  WHERE p.live = 1 OR p.played_at < (SELECT since FROM reward_cfg WHERE id = 1);

CREATE VIEW IF NOT EXISTS reward_participant_augments AS
  SELECT a.* FROM participant_augments a
  JOIN reward_participants p ON p.game_id = a.game_id AND p.member_id = a.member_id;
