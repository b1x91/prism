# 공개 사이트 배포 (Firebase Hosting → przm.web.app)

웹(`apps/web`)은 정적 파일만 올린다 (증강 가이드·3개 비교·증강 도감·모임). 회원 화면도 정적 파일이고, 회원 데이터는 로그인한 브라우저가 서버에서 직접 받는다. 회원 기능 서버는 Cloudflare(`docs/deploy-cloudflare.md`).
Firebase 는 **Hosting 만** 쓰므로 무료 요금제(Spark)로 된다.

## 처음 한 번 (Firebase 콘솔)
1. https://console.firebase.google.com → 프로젝트 추가 (이름 자유, 예: `prism-crew`). Google 애널리틱스는 꺼도 된다
2. 왼쪽 메뉴 **Hosting** → 시작하기 (CLI 안내 화면은 건너뛰어도 된다)
3. 사이트 ID `przm` 만들기 (주소 `przm.web.app`). 콘솔 대신 명령 한 줄로도 된다:
   `npx firebase-tools hosting:sites:create przm --project prism-90`
   - 참고: `prism` 은 다른 사람 프로젝트가 선점해 쓸 수 없다. "Site Not Found" 화면은 비어 있는 모든 주소에 똑같이 나오므로 사용 가능 여부의 근거가 아니다

## 방법 A. 내 PC 에서 바로 올리기 (PowerShell)
```powershell
cd prism
git pull
npm install
npm run web:build
npx firebase-tools login
npx firebase-tools deploy --only hosting --project prism-90
```
끝나면 https://przm.web.app 에서 보인다.

## 방법 B. GitHub 에서 자동 배포
1. Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → **새 비공개 키 생성** → JSON 파일 저장
2. GitHub 저장소 → Settings → Secrets and variables → Actions
   - Secrets 에 `FIREBASE_SERVICE_ACCOUNT` = JSON 파일 내용 전체
   - (선택) Variables 에 `FIREBASE_PROJECT_ID` — 비우면 `prism-90`
3. Actions 탭 → deploy-site → Run workflow. 이후 웹 변경이 올라오면 자동 배포 (비밀값이 없으면 실패하지 않고 건너뛴다)
4. 회원 서버를 배포했다면(`docs/deploy-cloudflare.md`) 서버 주소는 워크플로가 Cloudflare 에서 찾아 넣는다

## 바꿀 수 있는 것
- 디스코드·카카오톡 주소: 서버 `wrangler.toml` 의 `DISCORD_INVITE_URL`, `KAKAO_OPENCHAT_URL` (로그인 전 화면용 예비값은 저장소 Variables `DISCORD_INVITE_URL`, `KAKAO_OPENCHAT_URL`). 비어 있으면 버튼이 숨는다
- Windows 앱 받기 안내: 저장소 Variables `APP_DOWNLOAD_URL` (비어 있으면 안내가 숨는다)
- 패치가 나오면 `npm run data:mayhem` → 커밋 → main 에 합치면 자동 배포 (방법 A 라면 `npm run web:build` → 배포)
