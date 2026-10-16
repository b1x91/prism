-- 나를 소개해요 (v3.47): 좋아하는 역할·자주 접속하는 요일·시간대·MBTI (JSON), 멤버 환영 채널에 올린 때 (한 번만)
ALTER TABLE members ADD COLUMN about TEXT;
ALTER TABLE members ADD COLUMN about_posted_at INTEGER;
