// 자리표시(스켈레톤) 겹침·뭉침·넘침 점검 (CLAUDE.md v3.78)
// 서버 응답을 멈춘 채 앱·웹 모든 화면에서 .sk 의 위치를 재서: 서로 겹침 · 틈 4px 미만으로 붙음 · 카드/칸 밖으로 넘침을 찾는다.
// 실행: 로컬 서버(8787)·dev-bridge(5199)·앱(5180)·웹(5173)을 켠 뒤 node scripts/qa/skeleton.mjs <출력 폴더> [app|web]
import { chromium } from 'playwright-core';
const [,, SP, only] = process.argv;
const ALLOW = /^\/(api\/me$|api\/me\/presence|links|api\/app\/token|auth)/;
const APP = ['/', '/champions', '/champions/157', '/augments', '/augments/1001', '/dex', '/missions', '/ranking', '/crew', '/me', '/members/other1', '/shop', '/settings'];
const WEB = ['/', '/champions', '/champions/157', '/augments', '/augments/1001', '/compare', '/dex', '/missions', '/ranking', '/crew', '/me', '/members/other1', '/shop', '/p/me1'];
const detect = () => {
  const els = [...document.querySelectorAll('.sk')].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]'); });
  const R = els.map((e) => ({ e, r: e.getBoundingClientRect() }));
  const out = [];
  const name = (e) => { const p = e.parentElement; return `${(p?.className || p?.tagName || '').toString().slice(0, 40)} > .${[...e.classList].join('.')}`; };
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
    const a = R[i].r, b = R[j].r;
    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ox > 1 && oy > 1) { out.push({ t: '겹침', a: name(R[i].e), b: name(R[j].e), y: Math.round(Math.max(a.top, b.top)), x: Math.round(Math.max(a.left, b.left)) }); continue; }
    // 위아래로 틈 없이 붙음 (가로로 충분히 겹치는데 세로 틈이 2px 미만)
    const minW = Math.min(a.width, b.width), minH = Math.min(a.height, b.height);
    if (ox > minW * 0.5 && oy > -4 && oy <= 1) out.push({ t: '위아래 붙음', a: name(R[i].e), b: name(R[j].e), y: Math.round(Math.max(a.top, b.top)), x: Math.round(Math.max(a.left, b.left)) });
    else if (oy > minH * 0.5 && ox > -4 && ox <= 1) out.push({ t: '옆으로 붙음', a: name(R[i].e), b: name(R[j].e), y: Math.round(Math.max(a.top, b.top)), x: Math.round(Math.max(a.left, b.left)) });
  }
  // 칸 밖으로 넘침: 가장 가까운 카드·창·칸의 테두리를 넘는 뼈대
  for (const { e, r } of R) {
    const box = e.parentElement?.closest('.card, .md, .pl-side, .pl-tile, .shop-card, .msn-card, .pd-tile, .lb-card, .fpk-modal, section');
    if (!box) continue; const b = box.getBoundingClientRect();
    if (r.right > b.right + 1 || r.left < b.left - 1) out.push({ t: '칸 밖으로 넘침', a: name(e), b: (box.className || '').toString().slice(0, 40), y: Math.round(r.top), x: Math.round(r.right - b.right) });
  }
  return { count: R.length, issues: out };
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const report = {};
for (const [kind, w, scheme] of [['app', 1280, 'dark'], ['app', 760, 'light'], ['web', 1280, 'light'], ['web', 390, 'dark']]) {
  if (only && only !== kind) continue;
  const ctx = await b.newContext({ viewport: { width: w, height: 2000 }, colorScheme: scheme });
  const p = await ctx.newPage();
  let hold = false;
  if (kind === 'app') {
    await p.route('http://127.0.0.1:5199/api', async (route) => { const body = JSON.parse(route.request().postData() || '{}'); if (hold && !ALLOW.test(body.path || '')) { await new Promise((r) => setTimeout(r, 30000)); } route.continue().catch(() => {}); });
    await p.goto('http://127.0.0.1:5180/#/'); await p.waitForTimeout(2500);
    await p.getByRole('button', { name: '디스코드로 로그인' }).click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(6000);
    for (const t of ['나중에', '나중에']) await p.getByText(t).first().click({ timeout: 1200 }).catch(() => {});
  } else {
    await p.route(/localhost:8787\/(api|public)\//, async (route) => { const path = new URL(route.request().url()).pathname; if (hold && !ALLOW.test(path)) { await new Promise((r) => setTimeout(r, 30000)); } route.continue().catch(() => {}); });
    await p.goto(`http://localhost:8787/auth/dev?id=426955675592163329&name=Haze&redirect=${encodeURIComponent('http://127.0.0.1:5173/auth/done')}`); await p.waitForTimeout(4000);
    for (const t of ['나중에', '나중에']) await p.getByText(t).first().click({ timeout: 1200 }).catch(() => {});
  }
  hold = true;
  for (const r of kind === 'app' ? APP : WEB) {
    const url = kind === 'app' ? `http://127.0.0.1:5180/#${r}` : `http://127.0.0.1:5173${r}`;
    await p.goto(url).catch(() => {}); await p.waitForTimeout(2200);
    for (const t of ['나중에']) await p.getByText(t).first().click({ timeout: 600 }).catch(() => {});
    const res = await p.evaluate(detect).catch((e) => ({ count: -1, issues: [{ t: String(e).slice(0, 80) }] }));
    const tag = `${kind}-${w}-${scheme}${r.replace(/\//g, '_')}`;
    report[tag] = res;
    if (res.count > 0) await p.screenshot({ path: `${SP}/${tag}.png`, fullPage: false });
    console.log(tag, 'sk', res.count, 'issues', res.issues.length);
  }
  await ctx.close();
}
await b.close();
import('fs').then((fs) => fs.writeFileSync(`${SP}/report.json`, JSON.stringify(report, null, 1)));
