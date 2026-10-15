-- 내 챔프·내 증강 (CLAUDE.md v3.27): 회원이 좋아하는 것으로 표시한 챔프·증강
CREATE TABLE IF NOT EXISTS favorites (
  member_id TEXT NOT NULL,
  kind TEXT NOT NULL,          -- 'champ' | 'aug'
  item_id INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (member_id, kind, item_id)
);
