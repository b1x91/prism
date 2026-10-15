-- 판마다 10명 전체 기록 (v3.44). 롤이 꺼져 있어도 판 상세에서 모두를 보여 주려고.
-- 비회원은 롤 이름(이름#태그)과 그 판 기록만 — puuid 는 남기지 않는다.
ALTER TABLE matches ADD COLUMN players TEXT;
