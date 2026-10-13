-- 프로필 꾸미기: 대표 스킨 (스킨 ID, 챔피언 = floor(id/1000)). 해금 기준은 packages/core/src/skin-tiers.ts
ALTER TABLE members ADD COLUMN profile_skin INTEGER;
