-- 디스코드 서버 별명을 롤 게임 이름에 맞춘다 (CLAUDE.md v3.131). 마지막으로 봇이 맞춘 별명 — 같으면 다시 부르지 않는다
ALTER TABLE members ADD COLUMN discord_nick TEXT;
