-- 한 판의 활약 기록 (도감 역할 챌린지: 펜타킬·피해량 1위·받은 피해 1위·군중 제어 1위·아군 회복+보호막 등). JSON
-- 수집 때 10명 전체를 보고 만든 원본. 몇 번 이뤘는지는 core/challenges.ts 규칙으로 늘 다시 센다
ALTER TABLE participants ADD COLUMN feats TEXT;
