# Prism 서버 배포 (Cloudflare Workers + D1)

처음 한 번만 하면 된다. 이후에는 `main` 에 합쳐질 때 GitHub Actions 가 자동 배포한다.

## 1. 디스코드 앱 만들기
1. https://discord.com/developers/applications → New Application (이름: Prism)
2. **OAuth2** 메뉴
   - Client ID 복사
   - Client Secret → Reset Secret → 복사 (한 번만 보인다)
   - Redirects 에 추가: `https://prism.<내 workers 서브도메인>.workers.dev/auth/discord/callback`
     (서브도메인은 3단계 배포 후 확정된다. 먼저 배포하고 다시 와서 넣어도 된다)
3. 디스코드 앱 설정 → 고급 → 개발자 모드 켜기 → 서버 이름 우클릭 "ID 복사" = **GUILD_ID**, 내 프로필 우클릭 "ID 복사" = **관리자 ID**

## 2. `server/wrangler.toml` 채우기
```toml
[vars]
PUBLIC_URL = "https://prism.<서브도메인>.workers.dev"
DISCORD_CLIENT_ID = "<Client ID>"
DISCORD_GUILD_ID = "<GUILD_ID>"
ADMIN_DISCORD_IDS = "<관리자 ID>"
```
Client Secret 은 파일에 쓰지 않는다 (4단계).

## 3. Cloudflare 첫 배포 (PowerShell)
```powershell
npm install
npx wrangler login                                   # 브라우저로 Cloudflare 로그인
npx wrangler d1 create prism                         # 출력된 database_id 를 wrangler.toml 에 붙여넣기
npm run server:migrate                               # 테이블 생성
npx wrangler secret put DISCORD_CLIENT_SECRET --config server/wrangler.toml   # Client Secret 붙여넣기
npm run server:deploy                                # 배포. 출력되는 workers.dev 주소 확인
```
브라우저에서 `https://prism.<서브도메인>.workers.dev/` 를 열어 `{"name":"Prism","ok":true}` 가 보이면 성공.

## 4. 웹·앱이 서버를 바라보게
GitHub 저장소 → Settings → Secrets and variables → Actions → **Variables** 에 `PRISM_SERVER_URL` = Worker 주소.
- 웹(`deploy-site.yml`)과 Windows 앱(`build-desktop.yml`)이 빌드할 때 이 값을 넣는다
- 서버 `wrangler.toml` 의 `WEB_ORIGINS` 에 웹 주소(`https://przm.web.app`, 도메인을 사면 `https://przm.gg`)가 있어야 웹 로그인이 된다
- 디스코드 앱 OAuth2 Redirects 에는 서버 콜백 주소 하나만 있으면 된다 (웹·앱 모두 서버를 거친다)

## 5. 자동 배포 (GitHub Actions)
GitHub 저장소 → Settings → Secrets and variables → Actions 에 추가:
- `CLOUDFLARE_API_TOKEN`: Cloudflare 대시보드 → My Profile → API Tokens → "Edit Cloudflare Workers" 템플릿 + D1 편집 권한
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare 대시보드 오른쪽 사이드바의 Account ID

이후 `server/` 가 바뀐 커밋이 `main` 에 들어가면 `.github/workflows/deploy-server.yml` 이 마이그레이션과 배포를 한다.

## 로컬 개발
```powershell
copy server\.dev.vars.example server\.dev.vars
npm run server:migrate:local
npm run server:dev                                   # http://127.0.0.1:8787
# 다른 창에서 (웹)
$env:VITE_PRISM_SERVER="http://127.0.0.1:8787"; $env:VITE_PRISM_DEV_LOGIN="1"; npm run web:dev
# 앱은 apps/desktop/README.md 참고
```
`DEV_LOGIN=1` 은 디스코드 없이 로그인되는 개발용 스위치다. **배포 환경 vars 에는 절대 넣지 않는다.**

## 비용
Workers·D1 무료 요금제 한도 안에서 회원 100명 규모가 돌아갈 것으로 예상하지만, 한도 수치는 확인하지 않았다. 배포 후 Cloudflare 대시보드의 사용량으로 확인한다.
