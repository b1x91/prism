-- 문의 첨부 사진 (v3.141): 문의 하나에 최대 5장. 화면이 긴 변 1600px 로 줄여 보낸 그림을 그대로 (장당 1.2MB 이하)
CREATE TABLE IF NOT EXISTS inquiry_files (
  inquiry_id INTEGER NOT NULL,
  n INTEGER NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  size INTEGER NOT NULL,
  PRIMARY KEY (inquiry_id, n)
);
