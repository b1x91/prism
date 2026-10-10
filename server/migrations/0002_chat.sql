-- 채팅 접속용 1회용 티켓 (60초). 메시지 자체는 Durable Object 저장소에 있다
CREATE TABLE chat_tickets (
  ticket_hash  TEXT PRIMARY KEY,
  member_id    TEXT NOT NULL,
  expires_at   INTEGER NOT NULL
);
