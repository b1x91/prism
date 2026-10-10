-- Prism D1 스키마 v1
-- 원칙 (CLAUDE.md 2절): 원본(matches, participants, participant_augments)은 append-only.
-- 집계는 저장하지 않고 원본에서 SQL 로 계산한다. 비회원 참가자 데이터는 저장하지 않는다.

CREATE TABLE members (
  id              TEXT PRIMARY KEY,          -- 디스코드 사용자 ID
  discord_name    TEXT NOT NULL,
  discord_avatar  TEXT,
  nick            TEXT NOT NULL,             -- 사이트 표시명 (본인 편집)
  intro           TEXT NOT NULL DEFAULT '',
  tier            TEXT NOT NULL DEFAULT 'guest' CHECK (tier IN ('guest', 'member', 'admin')),
  riot_puuid      TEXT UNIQUE,
  riot_id         TEXT,                      -- "게임이름#태그"
  opt_in_at       INTEGER,                   -- 수집 동의 시각 (ms). NULL 이면 수집 안 함
  invited_by      TEXT,
  joined_at       INTEGER NOT NULL,
  last_seen_at    INTEGER NOT NULL,
  last_played_at  INTEGER
);

-- 앱 로그인 토큰. 원문은 저장하지 않고 SHA-256 만 저장한다.
CREATE TABLE app_tokens (
  token_hash    TEXT PRIMARY KEY,
  member_id     TEXT NOT NULL REFERENCES members(id),
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER NOT NULL
);

-- 디스코드 로그인 직후 앱에 넘기는 1회용 코드 (1분)
CREATE TABLE auth_codes (
  code_hash   TEXT PRIMARY KEY,
  member_id   TEXT NOT NULL,
  expires_at  INTEGER NOT NULL
);

-- OAuth state (10분)
CREATE TABLE oauth_states (
  state       TEXT PRIMARY KEY,
  redirect    TEXT NOT NULL,
  expires_at  INTEGER NOT NULL
);

-- 원본: 판. append-only
CREATE TABLE matches (
  game_id       INTEGER PRIMARY KEY,
  queue_id      INTEGER NOT NULL,
  played_at     INTEGER NOT NULL,
  duration      INTEGER NOT NULL,
  source        TEXT NOT NULL,
  collected_by  TEXT NOT NULL,              -- 보낸 회원 ID
  crew_count    INTEGER NOT NULL,
  team_totals   TEXT NOT NULL,              -- JSON {"100":{win,kills,damageToChampions?,...},"200":{...}}
  created_at    INTEGER NOT NULL
);
CREATE INDEX matches_played_at ON matches(played_at);

-- 원본: 회원 참가 기록. append-only. 회원만.
CREATE TABLE participants (
  game_id       INTEGER NOT NULL,
  member_id     TEXT NOT NULL,
  champion_id   INTEGER NOT NULL,
  team_id       INTEGER NOT NULL,
  win           INTEGER NOT NULL,
  kills         INTEGER NOT NULL,
  deaths        INTEGER NOT NULL,
  assists       INTEGER NOT NULL,
  dmg_champ     INTEGER,
  dmg_taken     INTEGER,
  gold          INTEGER,
  items         TEXT,                       -- JSON number[] | NULL
  augments      TEXT,                       -- JSON number[] | NULL
  share_deal    REAL,                       -- 팀 5명 수치가 모두 있을 때만
  share_tank    REAL,
  share_growth  REAL,
  kp            REAL,
  played_at     INTEGER NOT NULL,           -- 조회 편의용 사본
  crew_count    INTEGER NOT NULL,           -- 조회 편의용 사본
  PRIMARY KEY (game_id, member_id)
);
CREATE INDEX participants_member ON participants(member_id, played_at);
CREATE INDEX participants_champion ON participants(champion_id);

-- 원본: 증강 선택 (집계용 정규화). append-only
CREATE TABLE participant_augments (
  game_id      INTEGER NOT NULL,
  member_id    TEXT NOT NULL,
  augment_id   INTEGER NOT NULL,
  champion_id  INTEGER NOT NULL,
  win          INTEGER NOT NULL,
  PRIMARY KEY (game_id, member_id, augment_id)
);
CREATE INDEX participant_augments_champion ON participant_augments(champion_id, augment_id);

-- 회원 한 줄 팁 (챔피언 또는 챔피언+증강)
CREATE TABLE tips (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id    TEXT NOT NULL,
  champion_id  INTEGER NOT NULL,
  augment_id   INTEGER,
  text         TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
CREATE INDEX tips_champion ON tips(champion_id, deleted_at);

CREATE TABLE tip_likes (
  tip_id     INTEGER NOT NULL,
  member_id  TEXT NOT NULL,
  PRIMARY KEY (tip_id, member_id)
);
