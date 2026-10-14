-- 내전 개최 확정 (방장이 "진행합니다"). 10명이 넘으면 대기자로 받는다 (참가 순서 11번째부터)
ALTER TABLE scrims ADD COLUMN confirmed_at INTEGER;
