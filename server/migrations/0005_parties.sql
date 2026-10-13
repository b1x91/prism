-- 같이 할 판 모집 (CLAUDE.md 9-3). 시간 + 한 줄 메모, 자리 5개. 원탭 참여/빠지기.
CREATE TABLE parties (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  host_id       TEXT NOT NULL,
  start_at      INTEGER NOT NULL,
  note          TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  cancelled_at  INTEGER
);
CREATE INDEX parties_start ON parties(start_at);

CREATE TABLE party_slots (
  party_id   INTEGER NOT NULL,
  member_id  TEXT NOT NULL,
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (party_id, member_id)
);
CREATE INDEX party_slots_member ON party_slots(member_id);
