-- 멤버 근황 '지금' (v3.74): 앱이 알리는 롤 단계와 그때의 챔프
ALTER TABLE members ADD COLUMN app_phase TEXT NOT NULL DEFAULT '';   -- '' | 'lobby' | 'select' | 'game'
ALTER TABLE members ADD COLUMN app_champ INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN app_phase_at INTEGER NOT NULL DEFAULT 0; -- 그 단계가 시작된 시각
