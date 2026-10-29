-- NOW 내전 (v3.127): 사용자 설정 로비(칼바람 나락)를 앱이 읽으면 '내전 중'으로. 팀마다 회원 ID 와 비회원 수
ALTER TABLE now_lobbies ADD COLUMN kind TEXT NOT NULL DEFAULT 'party'; -- party | scrim
ALTER TABLE now_lobbies ADD COLUMN teams TEXT;                          -- {"100":{"m":[id…],"n":5},"200":{…}}
