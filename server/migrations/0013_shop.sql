-- 피스·상점 (CLAUDE.md v3.24). 번 피스는 기록에서 늘 다시 계산하고, 여기에는 계산할 수 없는 것만 남긴다.
-- 매일 첫 접속 (하루 한 번, 날짜 = 한국 시간)
CREATE TABLE IF NOT EXISTS piece_daily (
  member_id  TEXT NOT NULL,
  day        TEXT NOT NULL,
  PRIMARY KEY (member_id, day)
);
-- 산 꾸밈 (산 값을 함께 남긴다: 값이 바뀌어도 쓴 피스는 그대로)
CREATE TABLE IF NOT EXISTS shop_owned (
  member_id  TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  price      INTEGER NOT NULL,
  bought_at  INTEGER NOT NULL,
  PRIMARY KEY (member_id, item_id)
);
-- 장착한 꾸밈(JSON)과 공개 링크 켬
ALTER TABLE members ADD COLUMN deco TEXT;
ALTER TABLE members ADD COLUMN share_on INTEGER NOT NULL DEFAULT 0;
