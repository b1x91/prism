-- 승인 대기 조건 (CLAUDE.md v3.108): 디스코드 회원 역할이 없고 앱을 쓴 적이 있는 회원.
-- app_seen_at 은 앱을 끄면 0 으로 돌아가므로, 앱을 처음 쓴 때를 따로 남긴다 (한 번 정하면 바뀌지 않는다).
ALTER TABLE members ADD COLUMN app_first_at INTEGER NOT NULL DEFAULT 0;
-- 이미 앱을 쓴 회원: 지금 앱 접속 중이거나, 앱으로 판을 보낸 적이 있다
UPDATE members SET app_first_at = COALESCE(
  (SELECT MIN(g.played_at) FROM matches g WHERE g.collected_by = members.id),
  NULLIF(app_seen_at, 0), 0);
UPDATE members SET app_first_at = app_seen_at WHERE app_first_at = 0 AND app_seen_at > 0;
