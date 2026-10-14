-- 디스코드 역할을 로그인 없이도 최신으로 (12시간마다 refresh token 으로 다시 확인)
ALTER TABLE members ADD COLUMN discord_refresh TEXT;
ALTER TABLE members ADD COLUMN roles_at INTEGER;
