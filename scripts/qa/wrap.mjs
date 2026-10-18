// 글자 줄바꿈 점검 (CLAUDE.md v3.81)
// 앱·웹 모든 화면을 여러 폭으로 열고, 글이 들어 있는 칸마다 글자 위치를 재서
//  - 단어 쪼개짐: 띄어쓰기 없이 붙은 글자(예: '2개', '챔프를')가 줄 끝과 다음 줄 첫머리로 갈라짐
//  - 외톨이 줄: 두 줄 이상인데 마지막 줄에 1~2글자만 남음
// 을 찾는다. 일부러 두 줄로 나눈 칸(도감 번호/이름 .dx)은 뺀다. 실행: 로컬 서버(8787)·dev-bridge(5199)·앱(5180)·웹(5173)을 켠 뒤
//   node scripts/qa/wrap.mjs <출력 폴더> [app|web]
import { chromium } from 'playwright-core';
import fs from 'fs';

const [,, OUT = '.', only] = process.argv;
fs.mkdirSync(OUT, { recursive: true });
const APP = ['/', '/champions', '/champions/157', '/augments', '/augments/1001', '/dex', '/missions', '/ranking', '/crew', '/me', '/members/other1', '/shop', '/settings'];
const WEB = ['/', '/champions', '/champions/157', '/augments', '/augments/1001', '/compare', '/dex', '/missions', '/ranking', '/crew', '/me', '/members/other1', '/shop', '/p/me1', '/privacy'];

const detect = () => {
  const blockOf = (n) => { let e = n.parentElement; while (e && getComputedStyle(e).display.startsWith('inline')) e = e.parentElement; return e; };
  const groups = new Map();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    if (!t.textContent.trim()) continue;
    const b = blockOf(t); if (!b) continue;
    const cs = getComputedStyle(b);
    if (cs.visibility === 'hidden' || b.closest('[aria-hidden="true"], .sk, svg, script, style, .tipbox, .dx')) continue;
    (groups.get(b) ?? groups.set(b, []).get(b)).push(t);
  }
  const out = [];
  const r = document.createRange();
  for (const [b, texts] of groups) {
    // 칸 나눔(grid·flex) 안에서 서로 다른 칸에 놓인 글은 일부러 나눈 줄이다 (예: 도감 번호 / 이름)
    const disp = getComputedStyle(b).display;
    if (/grid|flex/.test(disp) && new Set(texts.map((t) => t.parentElement)).size > 1) continue;
    const box = b.getBoundingClientRect();
    if (box.width < 2 || box.height < 2 || box.bottom < 0) continue;
    const chars = [];
    for (const t of texts) {
      const s = t.textContent;
      if (s.length > 400) break;
      for (let i = 0; i < s.length; i++) {
        r.setStart(t, i); r.setEnd(t, i + 1);
        const rc = r.getClientRects()[0];
        // 칸 밖으로 잘려 안 보이는 글자(두 줄 말줄임 등)는 세지 않는다
        if (!rc || rc.width === 0 || rc.top + rc.height / 2 > box.bottom || rc.left + rc.width / 2 > box.right) { chars.push({ c: s[i], top: null }); continue; }
        chars.push({ c: s[i], top: Math.round(rc.top), h: rc.height });
      }
      chars.push({ c: ' ', top: null }); // 글 조각 사이는 띄어 쓴 것으로 본다
    }
    // 같은 줄로 묶기: 글자 가운데 높이가 그 줄의 위·아래 안에 들면 같은 줄 (큰 숫자 옆 작은 단위도 한 줄)
    const seen = chars.filter((x) => x.top !== null && x.c.trim()).map((x) => ({ y: x.top + x.h / 2, top: x.top, bottom: x.top + x.h })).sort((a, b) => a.y - b.y);
    const lines = [];
    for (const g of seen) { const l = lines[lines.length - 1]; if (l && g.y <= l.bottom) { l.bottom = Math.max(l.bottom, g.bottom); continue; } lines.push({ top: g.top, bottom: g.bottom }); }
    if (lines.length < 2) continue;
    const lineOf = (tp, h) => { const y = tp + h / 2; let k = 0; for (let i = 0; i < lines.length; i++) if (y >= lines[i].top) k = i; return k; };
    const text = chars.map((x) => x.c).join('').replace(/\s+/g, ' ').trim().slice(0, 60);
    const where = `${(b.className || b.tagName).toString().split(' ').slice(0, 2).join('.')}`;
    // 단어 쪼개짐
    let prev = null;
    for (const x of chars) {
      if (!x.c.trim() || x.top === null) { prev = null; continue; }
      if (prev && lineOf(x.top, x.h) > lineOf(prev.top, prev.h) && /[가-힣A-Za-z0-9]/.test(prev.c) && /[가-힣A-Za-z0-9]/.test(x.c)) { out.push({ t: '단어 쪼개짐', where, text, at: `${prev.c}|${x.c}` }); break; }
      prev = x;
    }
    // 외톨이 줄
    const last = lines.length - 1;
    const lastChars = chars.filter((x) => x.top !== null && x.c.trim() && lineOf(x.top, x.h) === last).map((x) => x.c).join('');
    if (lastChars.length > 0 && lastChars.length <= 2) out.push({ t: '외톨이 줄', where, text, at: lastChars });
  }
  return out;
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const report = {};
let total = 0;
for (const [kind, w] of [['app', 1280], ['app', 1000], ['app', 760], ['web', 1280], ['web', 820], ['web', 390], ['web', 360]]) {
  if (only && only !== kind) continue;
  const ctx = await b.newContext({ viewport: { width: w, height: 1400 }, colorScheme: 'dark' });
  const p = await ctx.newPage();
  if (kind === 'app') {
    await p.goto('http://127.0.0.1:5180/#/'); await p.waitForTimeout(2500);
    await p.getByRole('button', { name: '디스코드로 로그인' }).click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(6000);
  } else {
    await p.goto(`http://localhost:8787/auth/dev?id=426955675592163329&name=Haze&redirect=${encodeURIComponent('http://127.0.0.1:5173/auth/done')}`); await p.waitForTimeout(4000);
  }
  for (const r of kind === 'app' ? APP : WEB) {
    await p.goto(kind === 'app' ? `http://127.0.0.1:5180/#${r}` : `http://127.0.0.1:5173${r}`).catch(() => {});
    await p.waitForTimeout(3500);
    for (const t of ['나중에', '나중에']) await p.getByText(t).first().click({ timeout: 500 }).catch(() => {});
    const res = await p.evaluate(detect).catch((e) => [{ t: 'error', text: String(e).slice(0, 80) }]);
    const tag = `${kind}-${w}${r.replace(/\//g, '_')}`;
    report[tag] = res; total += res.length;
    if (res.length) console.log(tag, res.length);
  }
  await ctx.close();
}
await b.close();
fs.writeFileSync(`${OUT}/wrap-report.json`, JSON.stringify(report, null, 1));
console.log('total', total);
