-- 실시간 채팅을 걷어내고 '한 줄 생각'(방명록)으로 바꾼다. 모임의 대화는 디스코드·카카오톡에서 한다.
DROP TABLE IF EXISTS chat_tickets;

CREATE TABLE notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);
CREATE INDEX notes_recent ON notes(created_at);
