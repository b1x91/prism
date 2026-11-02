-- 면접방 오픈카톡 (v3.148, 2026-11-03 사용자가 준 주소·비밀번호). 이후 바꾸는 것은 운영 › 가입 신청 › 면접방 설정에서
INSERT INTO ext_cache (k, v, at) VALUES ('interview-room', '{"url":"https://open.kakao.com/o/gvBdCkVi","pw":"0910"}', 1793700000000)
  ON CONFLICT (k) DO UPDATE SET v = excluded.v, at = excluded.at;
