-- #PRSM 태그 보상 (CLAUDE.md v3.116): 롤 닉네임 태그를 #PRSM 으로 바꾼 회원에게 한 번만 5,000 피스.
-- 받은 뒤 태그를 바꿔도 줄지 않는다 (확정 기록).
CREATE TABLE IF NOT EXISTS tag_rewards (
  member_id TEXT PRIMARY KEY,
  riot_id TEXT NOT NULL,
  at INTEGER NOT NULL
);
