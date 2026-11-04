#!/usr/bin/env bash
# 계정마다 랭킹 줄 · 계정마다 꾸밈 시뮬레이션 (CLAUDE.md v3.161)
#
# 운영 DB 와 따로 빈 D1 을 새로 만들어:
#   1) 모든 마이그레이션을 적용하고 0044 '전' 모습의 가상 데이터(회원 35명 · 판 300여 개)를 넣은 뒤
#   2) 0044 의 채우기(UPDATE)만 다시 돌려 예전 판에 계정이 맞게 채워지는지 보고
#   3) 로컬 서버(8788)를 띄워 랭킹 · 장착 · 메인 바꾸기 · 계정 빼기 · 새 판 기록 · 준회원 제한을 API 로 확인한다.
#
# 사용: bash scripts/qa/account-rank/sim.sh   (실패한 항목이 있으면 끝 코드 1)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
SERVER="$ROOT/server"
TMP="$(mktemp -d)"
DB="$TMP/db"
PORT=8788
WR_PID=""
VARS_BAK=""

cleanup() {
  [ -n "$WR_PID" ] && kill "$WR_PID" 2>/dev/null || true
  pkill -f "wrangler dev --port $PORT" 2>/dev/null || true
  # 원래 .dev.vars 를 되돌린다 (없었으면 지운다)
  if [ -n "$VARS_BAK" ]; then mv "$VARS_BAK" "$SERVER/.dev.vars"; else rm -f "$SERVER/.dev.vars"; fi
  rm -rf "$TMP"
}
trap cleanup EXIT

cd "$SERVER"
if [ -f .dev.vars ]; then VARS_BAK="$TMP/dev.vars.bak"; cp .dev.vars "$VARS_BAK"; fi
sed 's#^WEB_ORIGINS=.*#WEB_ORIGINS=http://localhost:5173,http://127.0.0.1:5173#' .dev.vars.example > .dev.vars

d1() { npx wrangler d1 "$@" --local --persist-to "$DB" > /dev/null 2>&1; }

echo "· 마이그레이션 적용"
d1 migrations apply DB
echo "· 가상 데이터 넣기"
python3 "$HERE/gen.py" "$TMP/seed.sql" > /dev/null
d1 execute DB --file "$TMP/seed.sql"
echo "· 0044 채우기 다시 돌리기 (ALTER · INDEX 줄은 빼고)"
grep -vE '^(ALTER TABLE|CREATE INDEX)' "$SERVER/migrations/0044_account_rank.sql" > "$TMP/backfill.sql"
d1 execute DB --file "$TMP/backfill.sql"

echo "· 로컬 서버 띄우기 (:$PORT)"
npx wrangler dev --port "$PORT" --local --persist-to "$DB" > "$TMP/wrangler.log" 2>&1 &
WR_PID=$!
for _ in $(seq 1 90); do curl -s -o /dev/null "localhost:$PORT/app/latest" && break; sleep 1; done

echo
SIM_DB="$DB" SIM_SERVER="$SERVER" node "$HERE/run.mjs"
