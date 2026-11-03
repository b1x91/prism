-- 소식 하트 기본 수는 이제 시간에 따라 하나씩 늘어난다 (v3.157, server/src/news.ts dripHearts).
-- 최근 하루 안에 올린 소식은 예전 방식으로 바로 붙은 기본 수를 지워, 새 방식대로 천천히 늘게 한다.
UPDATE news SET seed_hearts = 0 WHERE created_at > (CAST(strftime('%s', 'now') AS INTEGER) - 86400) * 1000;
