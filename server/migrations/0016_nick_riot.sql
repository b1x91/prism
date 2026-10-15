-- 표시 이름 = 롤 계정 이름 (CLAUDE.md v3.35). 본인이 바꿀 수 없고, 연결·수집 때 riot_id 로 맞춘다
UPDATE members SET nick = riot_id WHERE riot_id IS NOT NULL AND riot_id LIKE '%#%';
