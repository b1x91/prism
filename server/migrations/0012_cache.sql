-- 짧게 기억해 둘 외부 응답 (디스코드 위젯 등). 외부 호출이 잠깐 실패해도 마지막 정상값을 보여 주려고
CREATE TABLE IF NOT EXISTS ext_cache (
  k   TEXT PRIMARY KEY,
  v   TEXT NOT NULL,
  at  INTEGER NOT NULL
);
