-- 정회원은 카톡방에 있는 사람만 (CLAUDE.md v3.190, 2026-11-07 사용자 결정)
-- 운영진이 '카톡방 확인'을 눌러 둔 시각·누가. 이게 없으면 정회원·우수회원으로 올릴 수 없다.
ALTER TABLE members ADD COLUMN kakao_at INTEGER;
ALTER TABLE members ADD COLUMN kakao_by TEXT;
