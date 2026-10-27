-- 승인제 · 친구 초대 (CLAUDE.md v3.107)
-- 승인 대기 = 디스코드 회원 역할(준회원 이상)이 아직 없는 회원. 운영진이 승인하면 봇이 준회원 역할을 붙인다.
ALTER TABLE members ADD COLUMN approved_at INTEGER;   -- 승인한 때 (운영진 메뉴에서)
ALTER TABLE members ADD COLUMN approved_by TEXT;      -- 승인한 운영진
ALTER TABLE members ADD COLUMN invited_by TEXT;       -- 초대한 회원 (초대 링크 또는 승인할 때 운영진이 지정)
ALTER TABLE members ADD COLUMN invite_code TEXT;      -- 내 초대 링크 번호 (공유 링크 번호와 따로 — 초대가 공개 페이지를 켜지 않게)
CREATE UNIQUE INDEX IF NOT EXISTS members_invite_code ON members (invite_code);
-- 초대 보너스: 초대한 친구가 승인되는 순간 한 번 확정 (나중에 역할이 바뀌어도 줄지 않는다)
CREATE TABLE IF NOT EXISTS invite_rewards (
  invitee TEXT PRIMARY KEY,
  inviter TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS invite_rewards_inviter ON invite_rewards (inviter);
