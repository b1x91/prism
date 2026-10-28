-- 소식 하트 기본값 (CLAUDE.md v3.113): 누가 누른 것도 아닌 기본 수 1~5. 실제 하트(news_hearts)와 따로 두어 회원의 '내가 누름'에는 섞이지 않는다.
ALTER TABLE news ADD COLUMN seed_hearts INTEGER NOT NULL DEFAULT 0;
UPDATE news SET seed_hearts = (abs(random()) % 5) + 1;
