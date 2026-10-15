-- 공유 링크 짧은 번호 (CLAUDE.md v3.34): przm.web.app/p/123
-- 공개를 처음 켤 때 100~999 중 비어 있는 번호를 하나 준다 (모임 100명 규모)
ALTER TABLE members ADD COLUMN share_code INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS members_share_code ON members (share_code);
