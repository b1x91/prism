/**
 * CI 전용: 회원 서버 주소를 출력한다.
 * 1) 저장소 Variables PRISM_SERVER_URL 이 있으면 그 값 (도메인을 붙인 뒤)
 * 2) 없으면 Cloudflare 계정의 workers.dev 서브도메인으로 https://prism.<서브도메인>.workers.dev
 * 3) 둘 다 없으면 빈 값 (웹·앱은 모임 기능 없이 가이드만 동작)
 */
const fixed = (process.env.PRISM_SERVER_URL ?? '').trim().replace(/\/$/, '');
if (fixed) { console.log(fixed); process.exit(0); }
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env;
if (!token || !account) { console.log(''); process.exit(0); }
try {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/subdomain`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  const d = await r.json();
  const sub = d?.result?.subdomain;
  if (!sub) throw new Error(JSON.stringify(d?.errors ?? d));
  // 서버가 실제로 떠 있을 때만 쓴다 (아직 배포 전이면 빈 값)
  const url = `https://prism.${sub}.workers.dev`;
  const ok = await fetch(url, { signal: AbortSignal.timeout(15000) }).then((x) => x.ok).catch(() => false);
  console.log(ok ? url : '');
  if (!ok) console.error(`서버(${url})가 아직 응답하지 않아 비워 둡니다.`);
} catch (e) {
  console.error('서버 주소를 찾지 못했습니다:', e instanceof Error ? e.message : e);
  console.log('');
}
