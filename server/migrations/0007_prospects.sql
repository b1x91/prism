-- 포텐 멤버 (사용자 결정 2026-10-14, CLAUDE.md v3.10): 회원과 같은 팀으로 여러 판, 또는 사용자 설정·내전 판을 함께한 비회원의 판.
-- 회원 전용 화면에만 쓰고 공개층에는 내지 않는다. 그 사람이 가입해 롤 계정을 연결하면 participants 로 옮기고 지운다.
CREATE TABLE prospect_games (
  puuid         TEXT NOT NULL,
  game_id       INTEGER NOT NULL,
  riot_id       TEXT,
  champion_id   INTEGER NOT NULL,
  team_id       INTEGER NOT NULL,
  win           INTEGER NOT NULL,
  kills         INTEGER NOT NULL,
  deaths        INTEGER NOT NULL,
  assists       INTEGER NOT NULL,
  dmg_champ     INTEGER,
  dmg_taken     INTEGER,
  gold          INTEGER,
  items         TEXT,
  augments      TEXT,
  played_at     INTEGER NOT NULL,
  custom        INTEGER NOT NULL,      -- 사용자 설정(내전 포함) 판이면 1
  with_members  INTEGER NOT NULL,      -- 같은 팀에 있던 회원 수
  crew_count    INTEGER NOT NULL,      -- 그 판의 회원 수
  PRIMARY KEY (puuid, game_id)
);
CREATE INDEX prospect_games_puuid ON prospect_games(puuid, played_at);
