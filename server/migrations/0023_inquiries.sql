-- 문의하기 (CLAUDE.md v3.100): 앱·웹·디스코드 /문의 → 운영자 DM. 답장도 여기에 남는다.
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  source TEXT NOT NULL,          -- app | web | discord
  context TEXT,                  -- 짧은 상태 (JSON)
  diag TEXT,                     -- 앱 진단 (롤이 켜져 있을 때만, 운영자 DM 에 파일로)
  at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open | replied | done
  reply TEXT,
  replied_at INTEGER,
  admin_dm TEXT                  -- 운영자에게 보낸 DM "채널ID/메시지ID" (실패하면 NULL)
);
CREATE INDEX IF NOT EXISTS inquiries_member ON inquiries (member_id, at);
