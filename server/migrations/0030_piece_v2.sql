-- 피스 기준 바꾸기 (CLAUDE.md v3.120): 회원마다 처음 한 번, 예전 기준 합(legacy)과 새 기준 합(fresh)을 같은 순간에 적어 둔다.
-- 잔액 = legacy + (지금 새 기준 합 − fresh) − 쓴 것. 바꾸는 순간 아무의 피스도 줄지 않게.
CREATE TABLE IF NOT EXISTS piece_snapshot (
  member_id TEXT PRIMARY KEY,
  legacy INTEGER NOT NULL,
  fresh INTEGER NOT NULL,
  at INTEGER NOT NULL
);
