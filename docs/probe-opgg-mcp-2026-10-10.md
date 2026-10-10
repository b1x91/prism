# op.gg MCP 검증 결과 (CLAUDE.md 7-2) — 2026-10-10

스크립트: `scripts/probe-opgg-mcp.ts` · 파서: `scripts/opgg-format.ts`

## 결론

**op.gg MCP는 아수라장(2400) 판을 돌려주지 않는다.** 7-2 규칙에 따라 1순위 탈락 → 7-3(미니PC)으로.

## 근거

| 계정 | 용도 | 결과 |
|---|---|---|
| `Haze#KR18` (사용자 제공, 아수라장만 하는 계정) | 1번 항목 판정 | 프로필은 정상 조회 (레벨 333, op.gg `updated_at` 2026-10-10T23:59+09:00). **전적 목록은 빈 배열 `[]`** — `lang`·대소문자·`limit` 바꿔도 동일 |
| `Hide on bush#KR1` (공개 프로 계정) | 응답 형식 확인 | 20판 정상 (`SOLORANKED` 18, `ARENA` 2) |

계정이 존재하고 op.gg가 당일 갱신까지 했는데 전적이 0판이므로, op.gg가 2400 판을 보유하지 않거나 MCP에서 제외하는 것으로 판단한다.
추정 원인: op.gg도 Riot match-v5를 쓰는데 match-v5가 2400을 막고 있다(CLAUDE.md 3절). **원인은 추정이며 op.gg 측 확인은 없다.**

## 항목별

| 항목 | 결과 |
|---|---|
| 도구 이름 | 문서의 `lol-summoner-renewal`/`lol-summoner-game-history`는 없음. 실제: `lol_list_summoner_matches`, `lol_get_summoner_game_detail`. 갱신(renewal) 도구 없음 |
| 1. 아수라장 판 | **없음** |
| 2. 필드 (일반 판 기준) | 챔피언·승패·KDA·아이템·챔피언 딜량·받은 딜·골드·PUUID 있음. **증강 없음** (증강이 있는 아레나 판에서도 없음). 목록은 본인 1명, 상세는 10명 |
| 3. 판 수 | 최대 20 (`limit` 5~20) |
| 4. 속도·제한 | 목록 3~8초, 상세 약 2.6초. 연속 5회 실패 0. 공식 한도 미확인 |
| 5. 약관·안내 | 서버 instructions 없음 |
| 기타 | 응답은 JSON이 아닌 압축 형식. 게임 ID는 Riot 숫자 ID가 아닌 op.gg 내부 문자열(`m_...`). 일부 도구 `outputSchema`가 MCP 규격 이탈(SDK 기본 검증 실패) |

## 실행 메모

이 클라우드 환경에서는 Node fetch가 프록시를 따르도록 `NODE_USE_ENV_PROXY=1`이 필요하다.
