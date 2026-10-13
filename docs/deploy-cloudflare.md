# 회원 서버 배포 (Cloudflare Workers + D1)

웹(przm.web.app)은 Firebase 에 올린 **정적 파일**이라 로그인·한 줄 생각·실전 승률 같은 회원 기능을 스스로 처리하지 못한다.
그 일을 하는 것이 회원 서버(Cloudflare, 무료 요금제)다. 처음 한 번 설정하면 이후에는 GitHub Actions 가 알아서 배포한다.

## 1. Cloudflare (약 5분)
1. https://dash.cloudflare.com 가입 (무료)
2. 왼쪽 메뉴 **Workers & Pages** 를 한 번 연다 → workers.dev 서브도메인을 정하라고 하면 원하는 이름으로 정한다 (서버 주소가 `https://prism.<서브도메인>.workers.dev` 가 된다)
3. **Account ID** 복사: 계정 홈 또는 Workers & Pages 화면 오른쪽에 있다
4. **API 토큰** 만들기: 오른쪽 위 프로필 → My Profile → API Tokens → Create Token
   - "Edit Cloudflare Workers" 템플릿 → Use template
   - Permissions 에 한 줄 추가: `Account` · `D1` · `Edit`
   - Account Resources: 내 계정 → Continue to summary → Create Token → 나온 값 복사 (한 번만 보인다)

## 2. 디스코드 앱 (약 5분)
1. https://discord.com/developers/applications → New Application (이름: Prism)
2. **OAuth2** 메뉴 → Client ID 복사, Client Secret → Reset Secret → 복사 (한 번만 보인다)
3. 디스코드 설정 → 고급 → **개발자 모드** 켜기 → Prism 서버 이름 우클릭 "서버 ID 복사" (= GUILD_ID), 내 프로필 우클릭 "사용자 ID 복사" (= 관리자 ID)
4. Client ID · 서버 ID · 관리자 ID 는 비밀이 아니다 → `server/wrangler.toml` 의 `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `ADMIN_DISCORD_IDS` 에 넣는다
   **Client Secret 은 파일에 쓰지 않는다** (다음 단계에서 GitHub 에만)

## 3. GitHub 에 비밀값 넣기
저장소 → Settings → Secrets and variables → Actions → **New repository secret** 세 개:
| 이름 | 값 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 1-4 의 토큰 |
| `CLOUDFLARE_ACCOUNT_ID` | 1-3 의 Account ID |
| `DISCORD_CLIENT_SECRET` | 2-2 의 Client Secret |

## 4. 배포
1. 저장소 → Actions → **deploy-server** → Run workflow
   - 데이터베이스(D1)가 없으면 만들고, 표를 만들고, 서버를 올리고, 디스코드 비밀값을 넣는다
2. 끝난 실행을 열면 Summary 에 **서버 주소**와 **Redirect 주소**가 나온다
3. 디스코드 개발자 포털 → OAuth2 → **Redirects** → Add Redirect → 그 Redirect 주소 붙여넣기 → Save
4. Actions → **deploy-site** 를 한 번 더 돌리면 웹이 서버 주소를 찾아 로그인 버튼이 켜진다 (Windows 앱은 다음 버전부터 자동으로 서버를 바라본다)

이후에는 `server/` 가 바뀐 커밋이 올라오면 자동 배포된다.

### 나중에 도메인을 붙이면 (예: api.przm.gg)
- `server/wrangler.toml` 의 `PUBLIC_URL` 에 그 주소, 저장소 Variables `PRISM_SERVER_URL` 에도 같은 주소
- 디스코드 Redirects 에 `https://api.przm.gg/auth/discord/callback` 추가
- 비워 두면 workers.dev 주소를 그대로 쓴다

## 로컬 개발
```powershell
copy server\.dev.vars.example server\.dev.vars        # DEV_LOGIN=1 : 디스코드 없이 가짜 로그인
npm run server:migrate:local
npm run server:dev                                   # http://127.0.0.1:8787
# 다른 창에서 (웹)
$env:VITE_PRISM_SERVER="http://127.0.0.1:8787"; $env:VITE_PRISM_DEV_LOGIN="1"; npm run web:dev
# 앱은 apps/desktop/README.md 참고
```
`DEV_LOGIN=1` 은 개발용 스위치다. **배포 환경 vars 에는 절대 넣지 않는다.**

## 비용
Workers·D1 무료 요금제 한도 안에서 회원 100명 규모가 돌아갈 것으로 예상하지만, 한도 수치는 확인하지 않았다. 배포 후 Cloudflare 대시보드의 사용량으로 확인한다.
