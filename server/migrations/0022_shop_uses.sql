-- 상점 이용권·선물·랜덤박스·명장면 (CLAUDE.md v3.99).
-- 꾸밈이 아닌 데 쓴 피스 (인사이트권·도감 돋보기·미션 다시 뽑기·선물·랜덤박스). 잔액 = 번 피스 − 산 꾸밈 − 여기 합
CREATE TABLE IF NOT EXISTS piece_spend (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  TEXT NOT NULL,
  kind       TEXT NOT NULL,   -- insight · lens · reroll · gift · box · frame
  ref        TEXT NOT NULL,   -- 무엇에 (insight: 리포트 종류 · lens: c:챔프/a:증강 · reroll: 주:미션 · gift: 받는 사람:상품 · box: 나온 상품)
  price      INTEGER NOT NULL,
  at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS piece_spend_member ON piece_spend (member_id, kind);
-- 받은 꾸밈의 출처 (선물한 사람·한마디, 랜덤박스)
ALTER TABLE shop_owned ADD COLUMN source TEXT;
ALTER TABLE shop_owned ADD COLUMN from_id TEXT;
ALTER TABLE shop_owned ADD COLUMN note TEXT;
-- 명장면: 쿼드라·펜타킬 판의 처치 순서 (앱이 롤 클라이언트의 판 흐름에서 읽어 보낸다, 회원 본인 것만)
CREATE TABLE IF NOT EXISTS highlights (
  game_id    INTEGER NOT NULL,
  member_id  TEXT NOT NULL,
  kills      TEXT NOT NULL,   -- JSON [{t: ms, v: 상대 챔프, x, y, a: 도운 아군 수}]
  at         INTEGER NOT NULL,
  PRIMARY KEY (game_id, member_id)
);
-- 회원 페이지에 고정한 명장면 (명장면 액자를 가진 회원)
ALTER TABLE members ADD COLUMN pinned_game INTEGER;
