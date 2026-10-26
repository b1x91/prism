# Microsoft Store 제출 내용 (PRISM 증바람, v3.103)

Partner Center 각 칸에 그대로 붙여 넣는다.

## 속성
- 카테고리: 유틸리티 및 도구 (또는 엔터테인먼트)
- 개인정보 처리방침: https://przm.web.app/privacy
- 웹사이트: https://przm.web.app
- 디스플레이 모드: PC·HoloLens 모두 해제
- 제품 선언: 모두 해제
- 시스템 요구 사항: 키보드·마우스 '최소 하드웨어'만 체크

## 연령별 등급 (설문)
- 앱 → 유틸리티/엔터테인먼트
- 사용자끼리 대화·콘텐츠 공유: 아니요 (앱 안 채팅 없음, 디스코드로 이동만)
- 위치 공유·디지털 상품 구매·폭력·도박: 아니요
- 개인 정보 수집: 예 (디스코드 계정, 게임 기록)

## Microsoft Store 목록 (한국어)

### 설명
```
PRISM은 리그 오브 레전드 '아수라장(증바람)'을 함께 즐기는 모임 Prism의 동반 앱입니다.

■ 챔프 선택 도우미
우리 팀 조합의 균형(앞라인·군중 제어·피해 유형)을 한눈에 보고, 대기석에서 바꾸면 좋은 챔프와 이번 판 작전을 알려 드려요.

■ 증강 가이드
지금 챔프에 잘 어울리는 증강을 등급별로 보여 드리고, 고민되는 증강 3개를 나란히 비교할 수 있어요.

■ 게임 중 증강 창
증강 카드가 뜨면 게임 화면 옆에 작은 창으로 어울림을 보여 드려요. 고르는 건 언제나 직접 하세요.

■ 내 기록과 도감
판이 끝나면 기록이 자동으로 쌓여요. 만난 챔프와 고른 증강을 도감으로 모으고, 미션과 랭킹으로 모임 친구들과 함께 즐겨요.

※ Prism 디스코드 서버 회원만 로그인할 수 있습니다.
※ 이 앱은 Riot Games가 보증하거나 후원하지 않습니다. League of Legends는 Riot Games, Inc.의 상표입니다.
```

### 짧은 설명
```
아수라장(증바람) 챔프 선택 도우미 · 증강 가이드 · 내 기록
```

### 제품 기능
```
챔프 선택 팀 조합 분석
챔프별 어울리는 증강 가이드
증강 3개 비교
게임 중 증강 어울림 창
판 기록 자동 저장과 도감
주간 미션과 모임 랭킹
```

### 검색어
```
리그 오브 레전드, 롤, 아수라장, 증바람, 증강, 칼바람, ARAM
```

### 스크린샷
- 최소 1장, 1366×768 이상 PNG (1920×1080 권장)

## 제출 옵션

### 제한된 기능 (runFullTrust) 사유
```
PRISM is a desktop companion app for League of Legends (ARAM: Mayhem mode). It requires runFullTrust because it (1) reads the locally running League client's local API (read-only) to show champion-select info and match history, (2) uses Windows' built-in OCR on a captured screen region to recognize augment choices during the game, (3) runs in the system tray and listens on a loopback port for Discord OAuth sign-in. It does not modify game files, memory, or input.
```

### 심사 담당자 참고 (Notes for certification)
```
Sign-in requires membership in our private Discord community. Without signing in, the app shows the sign-in screen only. Core features require a running League of Legends client on the same PC.
```
