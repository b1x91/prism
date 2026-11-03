-- 운영자(블랙 · Haze, ADMIN_DISCORD_IDS 첫 번째)에게 10만 피스 (2026-11-03 사용자 요청).
-- 잔액 = 번 피스 − 산 꾸밈 − piece_spend 합 이므로, 음수 기록 하나로 더한다 (kind 'grant', 다른 계산은 이 종류를 보지 않는다).
INSERT INTO piece_spend (member_id, kind, ref, price, at)
SELECT '426955675592163329', 'grant', 'admin:2026-11-03', -100000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM piece_spend WHERE member_id = '426955675592163329' AND kind = 'grant' AND ref = 'admin:2026-11-03');
