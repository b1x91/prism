-- 운영 › 상점관리 (CLAUDE.md v3.185): 상품 조회 수. 구매 확인 창을 연 것을 회원·상품·날짜(한국)마다 한 번 센다.
CREATE TABLE IF NOT EXISTS shop_views (
  item_id    TEXT NOT NULL,
  member_id  TEXT NOT NULL,
  day        TEXT NOT NULL,
  at         INTEGER NOT NULL,
  PRIMARY KEY (item_id, member_id, day)
);
CREATE INDEX IF NOT EXISTS shop_views_at ON shop_views (at);
CREATE INDEX IF NOT EXISTS shop_owned_at ON shop_owned (bought_at);
