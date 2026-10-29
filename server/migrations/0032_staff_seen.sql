-- 운영 메뉴의 빨간 점 (v3.125): 이 운영진이 마지막으로 운영 화면을 열었을 때 보았던 '처리할 멤버'(승인 대기·정회원 심사) ID 목록 (JSON 배열)
ALTER TABLE members ADD COLUMN staff_seen TEXT;
