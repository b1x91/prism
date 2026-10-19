// 늦게 온 내용이 화면을 밀어내는지(레이아웃 이동) 점검 (CLAUDE.md v3.93)
// 서버 응답마다 서로 다른 지연(주소마다 고정, 0.15~1.6초)을 걸고 앱·웹 모든 화면을 처음부터 열어
// 브라우저의 layout-shift 기록을 모은다. 사용자가 누르지 않았는데 이미 보이던 것이 움직이면 문제.
// 실행: 로컬 서버(8787)·dev-bridge(5199)·앱(5180)·웹(5173)을 켠 뒤 node scripts/qa/shift.mjs <출력 폴더> [app|web]
import { chromium } from 'playwright-core';
import fs from 'fs';
const [,, SP, only, onlyRoute] = process.argv;
const APP = ['/', '/champions', '/champions/157', '/augments', '/augments/1001', '/dex', '/missions', '/ranking', '/crew', '/me', '/members/other1', '/shop', '/settings'];
const WEB = ['/', '/champions', '/champions/157', '/augments', '/augments/1001', '/compare', '/dex', '/missions', '/ranking', '/crew', '/me', '/members/other1', '/shop', '/p/me1'];
const delayOf = (path) => { let h = 0; for (const c of path) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 150 + (h % 6) * 290; };
const observe = () => {
  window.__shifts = [];
  const name = (n) => { if (!n || !n.tagName) return '?'; const parts = []; let e = n; for (let i = 0; e && i < 3; i++, e = e.parentElement) parts.unshift((e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : e.tagName.toLowerCase())); return parts.join(' > '); };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (e.hadRecentInput) continue; window.__shifts.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), src: (e.sources || []).map((s) => ({ n: name(s.node), dy: Math.round(s.currentRect.y - s.previousRect.y), dh: Math.round(s.currentRect.height - s.previousRect.height) })) }); } }).observe({ type: 'layout-shift', buffered: true });
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const report = {};
for (const [kind, w, scheme] of [['app', 1280, 'dark'], ['app', 760, 'light'], ['web', 1280, 'light'], ['web', 390, 'dark']]) {
  if (only && only !== kind) continue;
  const ctx = await b.newContext({ viewport: { width: w, height: 1000 }, colorScheme: scheme });
  await ctx.addInitScript(observe);
  const p = await ctx.newPage();
  let slow = false;
  if (kind === 'app') {
    await p.route('http://127.0.0.1:5199/api', async (route) => { const body = JSON.parse(route.request().postData() || '{}'); if (slow && body.path) await new Promise((r) => setTimeout(r, delayOf(body.path))); route.continue().catch(() => {}); });
    await p.goto('http://127.0.0.1:5180/#/'); await p.waitForTimeout(2500);
    await p.getByRole('button', { name: '디스코드로 로그인' }).click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(6000);
  } else {
    await p.route(/localhost:8787\/(api|public)\//, async (route) => { const path = new URL(route.request().url()).pathname; if (slow) await new Promise((r) => setTimeout(r, delayOf(path))); route.continue().catch(() => {}); });
    await p.goto(`http://localhost:8787/auth/dev?id=me1&name=하제&redirect=${encodeURIComponent('http://127.0.0.1:5173/auth/done')}`); await p.waitForTimeout(4000);
  }
  for (const t of ['나중에', '나중에']) await p.getByText(t).first().click({ timeout: 1200 }).catch(() => {});
  slow = true;
  for (const r of kind === 'app' ? APP : WEB) {
    if (onlyRoute && onlyRoute !== r) continue;
    const url = kind === 'app' ? `http://127.0.0.1:5180/#${r}` : `http://127.0.0.1:5173${r}`;
    await p.goto('about:blank'); await p.goto(url).catch(() => {}); await p.waitForTimeout(6000);
    const s = await p.evaluate(() => window.__shifts).catch(() => []);
    const tag = `${kind}-${w}-${scheme}${r.replace(/\//g, '_')}`;
    const cls = s.reduce((a, e) => a + e.v, 0);
    report[tag] = { cls: +cls.toFixed(4), shifts: s.filter((e) => e.v >= 0.001) };
    console.log(tag, 'CLS', cls.toFixed(4), s.filter((e) => e.v >= 0.001).map((e) => `${e.t}ms ${e.v} ${e.src.map((x) => `${x.n}(dy${x.dy},dh${x.dh})`).join(' | ')}`).join('\n   '));
  }
  await ctx.close();
}
await b.close();
fs.writeFileSync(`${SP}/shift-report.json`, JSON.stringify(report, null, 1));
