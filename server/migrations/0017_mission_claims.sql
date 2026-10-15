-- 미션 보상 받기 (CLAUDE.md v3.38). 깬 미션은 '받기'를 눌러야 피스가 들어온다.
-- reward 는 받을 때의 기본 보상(피스 배율을 곱하기 전). 받기 도입 전에 깬 미션은 여기 없이 자동으로 받은 것으로 본다 (core CLAIM_SINCE).
CREATE TABLE IF NOT EXISTS mission_claims (
  member_id  TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  reward     INTEGER NOT NULL,
  at         INTEGER NOT NULL,
  PRIMARY KEY (member_id, mission_id)
);
