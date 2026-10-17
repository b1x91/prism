// 화면 전역 대비 점검: 아이콘(svg)·글자의 색과 실제 바탕색(반투명 겹침·그라디언트 포함)의 대비를 잰다
import { chromium } from 'playwright-core';
import fs from 'fs';
// 쓰는 법: 서버(8787)·앱 화면(5180, dev-bridge)·웹(5173)을 켠 뒤 node scripts/qa/contrast.mjs <결과 폴더> app|web
// 결과는 대비가 낮은 순. 그림 위·글자 그라디언트는 잴 수 없어 낮게 나올 수 있다 — 반드시 그 자리를 찍어 눈으로 확인한다
const [,, SP, which] = process.argv;
const APP = 'http://127.0.0.1:5180', WEB = 'http://127.0.0.1:5173';
const appRoutes = ['/', '/champions', '/champions/222', '/augments', '/augments/1001', '/dex', '/missions', '/ranking', '/crew', '/shop', '/me', '/members/dev-2', '/settings'];
const webRoutes = ['/', '/guide', '/compare', '/champions', '/champions/222', '/augments', '/augments/1001', '/dex', '/missions', '/ranking', '/crew', '/shop', '/me', '/privacy'];
const scan = () => {
  const parse = (s) => {
    const out = [];
    for (const m of s.matchAll(/rgba?\(([^)]+)\)|color\(srgb ([^)]+)\)/g)) {
      if (m[1]) { const v = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); out.push([v[0], v[1], v[2], v[3] ?? 1]); }
      else { const v = m[2].split(/[\s\/]+/).filter(Boolean).map(Number); out.push([v[0] * 255, v[1] * 255, v[2] * 255, v[3] ?? 1]); }
    }
    return out;
  };
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const blend = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
  // 바탕 후보들(그라디언트면 색 여럿). 그림 위면 null
  const bgsOf = (el) => {
    const layers = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage.includes('url(')) return null;
      if (e.querySelector(':scope > img.bg, :scope > img.splash')) return null;
      const g = cs.backgroundImage !== 'none' ? parse(cs.backgroundImage) : [];
      const c = parse(cs.backgroundColor)[0];
      if (g.length) { layers.push({ g, c }); if (g.every((x) => x[3] > 0.9)) break; }
      else if (c && c[3] > 0) { layers.push({ c }); if (c[3] > 0.95) break; }
    }
    const root = parse(getComputedStyle(document.body).backgroundColor)[0] ?? [255, 255, 255, 1];
    let bases = [[...root.slice(0, 3), 1]];
    for (const L of layers.reverse()) {
      if (L.c && L.c[3] > 0) bases = bases.map((b) => blend(L.c, b));
      if (L.g) bases = L.g.flatMap((gc) => bases.map((b) => blend(gc, b)));
    }
    return bases;
  };
  const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.3; };
  const sig = (el) => { const p = []; for (let e = el, i = 0; e && i < 4; e = e.parentElement, i++) p.unshift(e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : '')); return p.join('>'); };
  const out = [];
  for (const svg of document.querySelectorAll('svg')) {
    if (!vis(svg)) continue;
    const bgs = bgsOf(svg); if (!bgs) continue;
    const cols = [];
    for (const n of svg.querySelectorAll('path,circle,rect,polygon,line,polyline,ellipse')) {
      const cs = getComputedStyle(n);
      for (const k of ['fill', 'stroke']) { const v = cs[k]; if (v && v !== 'none' && !v.startsWith('url')) { const c = parse(v)[0]; if (c && Number(cs.opacity) * c[3] > 0.2) cols.push(c); } }
    }
    if (!cols.length) continue;
    // 아이콘에서 가장 잘 보이는 색 기준 — 그 색조차 바탕에 묻히면 문제
    const best = Math.min(...bgs.map((b) => Math.max(...cols.map((c) => ratio(blend(c, b), b)))));
    if (best < 1.6) out.push({ kind: 'icon', sig: sig(svg), ratio: +best.toFixed(2), text: (svg.parentElement?.textContent ?? '').trim().slice(0, 30) });
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let t; (t = walker.nextNode());) {
    const el = t.parentElement; if (!el || seen.has(el) || !t.textContent.trim()) continue; seen.add(el);
    if (!vis(el) || el.closest('svg')) continue;
    const bgs = bgsOf(el); if (!bgs) continue;
    const c = parse(getComputedStyle(el).color)[0]; if (!c) continue;
    const r = Math.min(...bgs.map((b) => ratio(blend(c, b), b)));
    if (r < 2.2) out.push({ kind: 'text', sig: sig(el), ratio: +r.toFixed(2), text: t.textContent.trim().slice(0, 30) });
  }
  return out;
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const res = {};
for (const dark of [true, false]) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 }, colorScheme: dark ? 'dark' : 'light' });
  const p = await ctx.newPage();
  const base = which === 'web' ? WEB : APP;
  if (which === 'web') { await p.goto(`http://localhost:8787/auth/dev?id=426955675592163329&name=Haze&redirect=${encodeURIComponent(WEB + '/auth/done')}`); await p.waitForTimeout(4000); }
  else { await p.goto(APP + '/#/'); await p.waitForTimeout(2500); await p.getByRole('button', { name: '디스코드로 로그인' }).click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(6000); }
  for (const t of ['나중에', '나중에']) await p.getByText(t).first().click({ timeout: 1200 }).catch(() => {});
  for (const r of which === 'web' ? webRoutes : appRoutes) {
    await p.goto(which === 'web' ? base + r : base + '/#' + r); await p.waitForTimeout(3500);
    for (const t of ['나중에']) await p.getByText(t).first().click({ timeout: 500 }).catch(() => {});
    // 아래쪽 화면까지
    const items = [];
    const H = await p.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < Math.min(H, 6000); y += 900) { await p.evaluate((yy) => window.scrollTo(0, yy), y); await p.waitForTimeout(250); items.push(...await p.evaluate(scan)); }
    for (const it of items) { const k = `${dark ? 'dark' : 'light'} ${it.kind} ${it.sig}`; const e = res[k] ??= { ...it, theme: dark ? 'dark' : 'light', routes: new Set() }; e.routes.add(r); e.ratio = Math.min(e.ratio, it.ratio); }
  }
  await ctx.close();
}
await b.close();
const list = Object.values(res).map((e) => ({ ...e, routes: [...e.routes].join(' ') })).sort((a, b) => a.ratio - b.ratio);
fs.writeFileSync(`${SP}/contrast-${which}.json`, JSON.stringify(list, null, 1));
for (const e of list) console.log(`${e.ratio}\t${e.theme}\t${e.kind}\t${e.sig}\t"${e.text}"\t${e.routes}`);
