-- 내전(우리끼리 5:5 사용자 설정 게임). 10자리, 팀 나누기, 결과는 기록된 사용자 설정 판에서 자동으로 찾는다.
-- 디스코드 역할: 로그인할 때마다 갱신. 내전을 열 수 있는 사람을 역할로 나눈다 (SCRIM_HOST_ROLES).
ALTER TABLE members ADD COLUMN discord_roles TEXT;

CREATE TABLE scrims (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  host_id       TEXT NOT NULL,
  start_at      INTEGER NOT NULL,
  note          TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  locked_at     INTEGER,            -- 팀 확정 시각
  cancelled_at  INTEGER
);
CREATE INDEX scrims_start ON scrims(start_at);

CREATE TABLE scrim_slots (
  scrim_id   INTEGER NOT NULL,
  member_id  TEXT NOT NULL,
  joined_at  INTEGER NOT NULL,
  team       INTEGER,               -- 1 = 블루, 2 = 레드, NULL = 아직
  PRIMARY KEY (scrim_id, member_id)
);
