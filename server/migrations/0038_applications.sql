-- 가입 신청 (CLAUDE.md v3.148): 초대 링크 → 소개·규칙 → 신청 → 면접방(오픈카톡) → 운영진 2인 확정 → 톡방·디스코드 초대 → 로그인하면 자동 승인
CREATE TABLE IF NOT EXISTS applications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  num         INTEGER NOT NULL UNIQUE,          -- 면접 번호 (P-427 의 427)
  token       TEXT NOT NULL UNIQUE,             -- 신청자 상태 페이지 열쇠 (/apply/:token)
  riot_id     TEXT NOT NULL,                    -- 이름#태그 (신청자가 적은 그대로)
  riot_key    TEXT NOT NULL UNIQUE,             -- 중복 확인용 (소문자·공백 없음)
  kakao       TEXT NOT NULL,                    -- 카카오톡 오픈프로필 이름
  times       TEXT NOT NULL DEFAULT '[]',       -- 주로 접속하는 시간 ['day','evening','night','dawn']
  note        TEXT,                             -- 한마디 (선택)
  invite_code TEXT,                             -- 연 초대 링크 번호
  inviter     TEXT,                             -- 초대한 회원 ID (승인된 회원일 때만)
  status      TEXT NOT NULL DEFAULT 'new',      -- new · interview · confirmed · invited · joined · hold · rejected
  signs       TEXT NOT NULL DEFAULT '[]',       -- 확정을 누른 운영진 ID
  sent_kakao  INTEGER NOT NULL DEFAULT 0,       -- 톡방 초대 보냄
  sent_discord INTEGER NOT NULL DEFAULT 0,      -- 디스코드 초대 보냄
  memo        TEXT,                             -- 운영진 메모
  log         TEXT NOT NULL DEFAULT '[]',       -- [{at, by, act}] 누가 언제 무엇을
  member_id   TEXT,                             -- 가입해 이어진 회원
  ip_hash     TEXT,                             -- 같은 곳에서 쏟아지는 신청을 막으려고 (원래 주소는 남기지 않는다)
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS applications_status ON applications(status, updated_at);
CREATE INDEX IF NOT EXISTS applications_code ON applications(invite_code, created_at);
