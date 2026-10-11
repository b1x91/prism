# 공개 사이트 배포 (Firebase Hosting → prism.web.app)

공개 사이트는 정적 파일만 올린다 (증강 가이드·증강 도감·모임 소개). 회원 기능 서버는 Cloudflare(`docs/deploy-cloudflare.md`).
Firebase 는 **Hosting 만** 쓰므로 무료 요금제(Spark)로 된다.

## 처음 한 번 (Firebase 콘솔)
1. https://console.firebase.google.com → 프로젝트 추가 (이름 자유, 예: `prism-crew`). Google 애널리틱스는 꺼도 된다
2. 왼쪽 메뉴 **Hosting** → 시작하기 (CLI 안내 화면은 건너뛰어도 된다)
3. Hosting 화면 아래 **다른 사이트 추가** → 사이트 ID `prism` 입력 → 주소가 `prism.web.app` 이 된다
   - `prism` 이 이미 쓰이고 있다고 나오면 다른 ID 를 정하고 `firebase.json` 의 `"site"` 를 그 값으로 바꾼다

## 방법 A. 내 PC 에서 바로 올리기 (PowerShell)
```powershell
cd prism
git pull
npm install
npm run site:build
npx firebase-tools login
npx firebase-tools deploy --only hosting --project <프로젝트 ID>
```
끝나면 https://prism.web.app 에서 보인다.

## 방법 B. GitHub 에서 자동 배포
1. Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → **새 비공개 키 생성** → JSON 파일 저장
2. GitHub 저장소 → Settings → Secrets and variables → Actions
   - Secrets 에 `FIREBASE_SERVICE_ACCOUNT` = JSON 파일 내용 전체
   - Variables 에 `FIREBASE_PROJECT_ID` = 프로젝트 ID
3. Actions 탭 → deploy-site → Run workflow (브랜치 선택). 이후 main 에 사이트 변경이 들어오면 자동 배포

## 바꿀 수 있는 것
- 디스코드·카카오톡 주소: `site/src/config.ts` (비어 있으면 버튼이 숨는다)
- 패치가 나오면 `npm run data:mayhem` → `npm run site:build` → 배포
