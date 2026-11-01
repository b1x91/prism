-- 내전 팀 나누기 (프리즘 빛 갈래, CLAUDE.md v3.135). 방장(우수회원 이상)이 누르면 서버가 팀과 순서를 정하고
-- 모두의 화면이 같은 시각(start_at)에 같은 연출을 시작한다. 손님(비회원)은 '손님 N' 으로만 — 이름을 남기지 않는다.
CREATE TABLE IF NOT EXISTS scrim_draws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lobby_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  start_at INTEGER NOT NULL,
  people TEXT NOT NULL,      -- [{ key, id|null, team: 'blue'|'red', score }] 순서 = 빛이 지나가는 순서
  balanced INTEGER NOT NULL DEFAULT 1,
  confirmed_at INTEGER
);
CREATE INDEX IF NOT EXISTS scrim_draws_lobby ON scrim_draws (lobby_id, created_at);
