/**
 * 운영 › 대시보드 (CLAUDE.md v3.160, 시안 B2 '밝은 무대'). 앱·웹 공용.
 *  - 위 고리 넷: 활동률 · 모임 판 비율 · 온보딩 · 앱 쓰는 멤버
 *  - 주별 판과 활동 멤버: 막대(전체 판 = 모임 판 + 그 밖의 판)를 물결 모양으로 자르고, 이번 주는 같은 크기에 청록.
 *    마우스를 올리면 활동 멤버 선이 물결 윗변을 따라 그려지고(같은 곡선), 떼면 천천히 사라진다. 최고·최저 칩만 늘 보인다
 *  - 언제 모이나요: 최근 9주 날짜 열지도(GitHub 식, 오늘 = 안쪽 고리) + 시간대 띠 + 숫자 셋
 *  - 잘하고 있는 멤버: 다섯 기준(활동량 · 참여도 · 꾸준함 · 어울림 · 성적)이 쌓인 막대, 근거 숫자
 *  - 온보딩 현황: 단계 카드에 물이 비율만큼 차오른다(양에 따라 색), 카드끼리 줄 높이를 함께 써 설명이 같은 곳에서 시작
 * 그래프는 SVG 를 실제 크기로 그린다(늘이지 않음). 처음 열 때 한 번 막대가 자라고 칸이 떠오른다. 동작 줄이기 존중.
 */
import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ONBOARD_STEPS, PICK_INFO, PICK_POINTS, PICK_TIERS, PICK_TIER_KO, pickTier, onboardNote, onboardTips, shortNick, type PickKey, type StaffOverview } from '@prism/core';
import { Empty, MemberFace, useSkins } from './basics';
import { motionOff } from './motion';

const md = (t: number) => { const d = new Date(t + 9 * 3_600_000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
const fmt = (n: number) => n.toLocaleString('ko-KR');

/** 그릇의 실제 크기 (SVG 를 늘이지 않고 그 크기로 그린다) */
function useSize<T extends HTMLElement>(): [RefObject<T | null>, number, number] {
  const ref = useRef<T>(null);
  const [s, setS] = useState<[number, number]>([0, 0]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = (w: number, h: number) => setS((p) => (p[0] === w && p[1] === h ? p : [w, h]));
    const ro = new ResizeObserver(([e]) => set(Math.round(e.contentRect.width), Math.round(e.contentRect.height)));
    ro.observe(el);
    const r = el.getBoundingClientRect();
    set(Math.round(r.width), Math.round(r.height));
    return () => ro.disconnect();
  }, []);
  return [ref, s[0], s[1]];
}

/** 눈금이 깔끔하게 떨어지는 최댓값 */
function niceTop(v: number, ticks = 3) {
  const raw = Math.max(v, ticks) / ticks;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
  return { top: step * ticks, step };
}

/** 점들을 지나는 부드러운 선 (모노톤 — 값 사이에서 넘치지 않는다). 구간마다 ' C…' 하나 */
function smooth(pts: [number, number][]) {
  if (pts.length < 2) return '';
  const n = pts.length, d: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  let s = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = (x1 - x0) / 3;
    s += ` C${(x0 + h).toFixed(1)},${(y0 + m[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - m[i + 1] * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return s;
}

/** **굵게** 표시만 읽는다 */
const bold = (t: string) => t.split(/\*\*(.+?)\*\*/g).map((x, i) => (i % 2 ? <b key={i}>{x}</b> : x));

// ───────── 고리 넷 ─────────

function Ring({ label, v, sub, note }: { label: string; v: number | null; sub: string; note?: ReactNode }) {
  const r = 26, C = 2 * Math.PI * r, p = v == null ? 0 : Math.max(0, Math.min(1, v));
  return (
    <div className="sv-ring">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--sv-track)" strokeWidth="7" />
        <circle className="sv-ring-arc" cx="32" cy="32" r={r} fill="none" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${C * p} ${C}`} transform="rotate(-90 32 32)" />
      </svg>
      <div><span className="l">{label}</span><b className="n">{v == null ? '–' : `${Math.round(p * 100)}%`}</b><span className="d">{sub}{note}</span></div>
    </div>
  );
}

function Rings({ o }: { o: StaffOverview }) {
  const r = o.rings;
  if (!r) return null;
  const d = r.active - r.activePrev;
  return (
    <section className="card sv-card sv-rings" aria-label="이번 주 고리">
      <Ring label="활동률" v={r.base ? r.active / r.base : null} sub={`${r.active} / ${r.base}명`} note={d ? <> · <em className={d > 0 ? 'up' : 'down'}>{d > 0 ? '+' : ''}{d}</em> 지난주 같은 때보다</> : null} />
      <Ring label="모임 판 비율" v={r.games ? r.crew / r.games : null} sub={`${r.crew} / ${r.games}판`} note={r.crewPrevRate != null ? ` · 지난주 같은 때 ${r.crewPrevRate}%` : null} />
      <Ring label="온보딩" v={r.joined ? r.settled / r.joined : null} sub={`${r.settled} / ${r.joined}명 · 최근 4주 가입`} />
      <Ring label="앱 쓰는 멤버" v={r.total ? r.app / r.total : null} sub={`${r.app} / ${r.total}명 · 롤 연결 ${r.linked}`} />
    </section>
  );
}

// ───────── 주별 판과 활동 멤버 ─────────

function WaveCombo({ o }: { o: StaffOverview }) {
  const weeks = o.weeks;
  const id = useId().replace(/:/g, '');
  const [ref, W, Hbox] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  // 선: off(숨김) → on(그려짐) → leave(서서히 사라짐) → off
  const [phase, setPhase] = useState<'off' | 'on' | 'leave'>('off');
  const leaveT = useRef(0);
  const lineRef = useRef<SVGPathElement>(null);
  const [len, setLen] = useState(0);
  const H = Math.max(280, Hbox), L = 40, R = 16, T = 64, B = 28;
  const n = weeks.length, last = n - 1;
  const g = niceTop(Math.max(1, ...weeks.map((w) => w.games)), 3);
  const iw = Math.max(0, W - L - R), ih = H - T - B, col = iw / n, bw = Math.min(20, col * 0.32);
  const y = (v: number) => T + ih - (v / g.top) * ih;
  const cx = (i: number) => L + col * i + col / 2;
  const pts: [number, number][] = weeks.map((w, i) => [cx(i), y(w.games)]);
  // 물결 면은 양 끝 막대 바깥까지 반 칸씩 평평하게 이어 같은 곡선으로 — 가운데에서 끝내면 끝 막대의 절반이 잘린다
  const ext = col / 2;
  const wave = W ? smooth([[pts[0][0] - ext, pts[0][1]], ...pts, [pts[last][0] + ext, pts[last][1]]]) : '';
  const area = W ? `${wave} L${pts[last][0] + ext},${y(0)} L${pts[0][0] - ext},${y(0)} Z` : '';
  // 선은 물결 윗변과 같은 곡선에서 잘라 쓴다 (구간 0 = 왼쪽 연장, 1…n-1 = 주 사이, n = 오른쪽 연장)
  const seg = wave.split(' C').slice(1);
  const mainD = W ? `M${pts[0][0]},${pts[0][1]}${seg.slice(1, last).map((c) => ` C${c}`).join('')}` : '';
  const dashD = W && n > 1 ? `M${pts[last - 1][0]},${pts[last - 1][1]} C${seg[last]}` : '';
  useLayoutEffect(() => { if (lineRef.current) setLen(lineRef.current.getTotalLength()); }, [mainD]);
  const act = weeks.map((w, i) => [w.active, i]).filter(([a]) => a > 0);
  const hi = act.length ? act.reduce((m, x) => (x[0] > m[0] ? x : m))[1] : -1;
  const lo = act.length > 1 ? act.reduce((m, x) => (x[0] < m[0] ? x : m))[1] : -1;
  const total = weeks.reduce((a, w) => a + w.games, 0);
  const lastW = weeks[last];
  const enter = () => { clearTimeout(leaveT.current); setPhase('on'); };
  const leave = () => { setHover(null); setPhase('leave'); leaveT.current = window.setTimeout(() => setPhase('off'), 650); };
  const reduce = motionOff();
  const lineStyle = (p: typeof phase) => ({ strokeDasharray: len || undefined, strokeDashoffset: p === 'off' && !reduce ? len : 0, transition: p === 'on' && !reduce ? 'stroke-dashoffset .9s cubic-bezier(.65,0,.35,1)' : 'none' });
  const h = hover != null ? weeks[hover] : null;
  return (
    <section className="card sv-card sv-grow">
      <div className="sv-head"><h2>주별 판과 활동 멤버</h2><span className="meta">최근 {n}주 · {fmt(total)}판</span></div>
      {lastW && <p className="sv-lede"><b>이번 주 {fmt(lastW.games)}판 · 활동 멤버 {lastW.active}명</b>{lastW.games ? ` (모임 판 ${Math.round((lastW.crew / lastW.games) * 100)}%)` : ''}, 이번 주는 진행 중이라 청록이에요.</p>}
      <div className="sv-legend"><span><i className="k" style={{ background: 'var(--accent)' }} />모임 판</span><span><i className="k" style={{ background: 'var(--sv-soft)' }} />그 밖의 판</span><span><i className="k" style={{ background: 'var(--sv-now)' }} />이번 주 (진행 중)</span><span><i className="k ring" />활동 멤버 (최고·최저, 나머지는 마우스를 올리면)</span></div>
      <div className={`sv-plot fill ${phase}`} ref={ref} onPointerEnter={enter} onPointerLeave={leave}>
        {W > 0 && <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`최근 ${n}주 ${weeks.map((w, i) => `${i === last ? '이번 주' : md(w.start)} ${w.games}판 활동 ${w.active}명`).join(', ')}`}>
          <defs>
            <linearGradient id={`a${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".2" /><stop offset=".7" stopColor="var(--accent)" stopOpacity=".04" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient>
            <clipPath id={`k${id}`}><path d={area} /></clipPath>
          </defs>
          {Array.from({ length: Math.round(g.top / g.step) + 1 }, (_, i) => {
            const v = g.step * i;
            return <g key={i}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={i ? 'var(--sv-grid)' : 'var(--line-2)'} /><text x={L - 8} y={y(v) + 4} textAnchor="end" className="sv-ax">{fmt(v)}</text></g>;
          })}
          <rect className="sv-band" x={hover != null ? L + col * hover + 2 : 0} y={T - 36} width={Math.max(0, col - 4)} height={ih + 36} rx="12" opacity={hover != null ? 1 : 0} />
          <path className="sv-fade" d={area} fill={`url(#a${id})`} />
          <g clipPath={`url(#k${id})`}>
            {weeks.map((w, i) => {
              const x = cx(i) - bw / 2, isLast = i === last, top = y(w.games) - 24;
              return <g key={w.start} className="sv-grow-y" style={{ animationDelay: `${120 + i * 55}ms` }}>
                {w.crew > 0 && <rect x={x} y={y(w.crew)} width={bw} height={y(0) - y(w.crew)} fill={isLast ? 'var(--sv-now)' : 'var(--accent)'} />}
                {w.games > w.crew && <rect x={x} y={top} width={bw} height={Math.max(0, y(w.crew) - top - (w.crew ? 2 : 0))} fill={isLast ? 'var(--sv-now-soft)' : 'var(--sv-soft)'} />}
              </g>;
            })}
          </g>
          {lastW && <text x={cx(last)} y={y(lastW.games) - 18} textAnchor="middle" className="sv-ax b">진행 중</text>}
          <g className="sv-line">
            <path ref={lineRef} d={mainD} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" opacity=".9" style={lineStyle(phase === 'leave' ? 'on' : phase)} />
            <path d={dashD} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" className="sv-dash" />
            {pts.map(([px, py], i) => weeks[i].games > 0 && <circle key={i} className="sv-dot" style={{ transitionDelay: phase === 'on' && !reduce ? `${i * 90}ms` : '0ms' }} cx={px} cy={py} r={i === last ? 4.5 : 3.5} fill={i === last ? 'var(--surface)' : 'var(--accent)'} stroke={i === last ? 'var(--accent)' : 'var(--surface)'} strokeWidth="2" />)}
          </g>
          {weeks.map((w, i) => {
            if (!w.active) return null;
            const tag = i === hi ? '최고' : i === lo ? '최저' : null;
            // 칩 폭 = 왼쪽(꼬리표 또는 점) + 숫자·'명' 글자 폭 + 오른쪽 여백 (숫자 한 자 9px, '명' 16px — 14px 굵은 글자)
            const [px, py] = pts[i], bw2 = tag ? 34 : 0, numW = String(w.active).length * 9 + 16, pw = (tag ? bw2 + 12 : 22) + numW + 8, ph = 30;
            const qy = py - ph - 12 - (i === last ? 14 : 0), x0 = Math.min(Math.max(px - pw / 2, L), W - R - pw);
            return <g key={w.start} className={`sv-pill ${tag ? 'sv-fade fixed' : ''}`} opacity={tag || hover === i ? 1 : 0}>
              <rect x={x0} y={qy} width={pw} height={ph} rx="15" fill="var(--surface)" stroke={tag ? 'var(--accent)' : 'var(--line-2)'} strokeWidth={tag ? 1.5 : 1} />
              {tag ? <><rect x={x0 + 4} y={qy + 4} width={bw2} height={ph - 8} rx="11" fill={i === hi ? 'var(--accent)' : 'var(--text-2)'} /><text x={x0 + 4 + bw2 / 2} y={qy + 19} textAnchor="middle" className="sv-pt" fill="#fff">{tag}</text></>
                : <circle cx={x0 + 13} cy={qy + ph / 2} r="3.5" fill="var(--accent)" />}
              <text x={x0 + (tag ? bw2 + 12 : 22)} y={qy + 20} className="sv-pv">{w.active}명</text>
            </g>;
          })}
          {weeks.map((w, i) => (i === last || col >= 52 || (last - i) % 2 === 0) && <text key={w.start} x={cx(i)} y={H - 8} textAnchor="middle" className={`sv-ax ${i === last ? 'now' : ''}`}>{i === last ? '이번 주' : md(w.start)}</text>)}
          {weeks.map((w, i) => <rect key={w.start} x={L + col * i} y={0} width={col} height={H} fill="transparent" tabIndex={0} aria-label={`${i === last ? '이번 주' : `${md(w.start)} 주`}`} onPointerEnter={() => setHover(i)} onFocus={() => { setHover(i); enter(); }} onBlur={leave} />)}
        </svg>}
        {h && hover != null && (
          <div className={`sv-tip ${hover > n / 2 ? 'l' : ''}`} style={{ left: cx(hover), top: Math.min(pts[hover][1] + 18, H - 132) }} role="tooltip">
            <b>{hover === last ? '이번 주 (진행 중)' : `${md(h.start)} 주`}</b>
            <span><i style={{ background: hover === last ? 'var(--sv-now)' : 'var(--accent)' }} />모임 판 <em>{fmt(h.crew)}</em></span>
            <span><i style={{ background: hover === last ? 'var(--sv-now-soft)' : 'var(--sv-soft)' }} />그 밖의 판 <em>{fmt(h.games - h.crew)}</em></span>
            <span><i style={{ background: 'var(--text-2)' }} />활동 멤버 <em>{h.active}명</em></span>
          </div>
        )}
      </div>
    </section>
  );
}

// ───────── 언제 모이나요 ─────────

const DOW = ['월', '화', '수', '목', '금', '토', '일'];
const dowOf = (d: number) => (d + 3) % 7; // 한국 날짜 번호 → 월 0 … 일 6 (1970-01-01 은 목요일)

function Calendar({ o }: { o: StaffOverview }) {
  const [ref, W] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ x: number; y: number; t: string } | null>(null);
  const daily = o.daily ?? [], today = o.today ?? 0, N = 9;
  const first = today - (daily.length - 1);
  const at = (d: number) => (d < first || d > today ? null : daily[d - first]);
  const mon = today - dowOf(today) - (N - 1) * 7;
  const max = Math.max(1, ...daily);
  const lvOf = (v: number) => (v <= 0 ? 0 : v <= max * 0.15 ? 1 : v <= max * 0.4 ? 2 : v <= max * 0.7 ? 3 : 4);
  const dateOf = (d: number) => { const x = new Date(d * 86_400_000); return { m: x.getUTCMonth() + 1, day: x.getUTCDate() }; };
  const left = 28, cw = W ? Math.min(28, (W - left - 16 - (N - 1) * 4) / N) : 0, gap = 4, ch = Math.min(cw, 24), top = 20;
  const H = top + 7 * (ch + gap) + 28;
  // 숫자 셋: 가장 많이 모인 요일 · 시간대 · 이번 주 모인 날 · 연속으로 모인 날
  const dowSum = Array(7).fill(0) as number[];
  for (let d = first; d <= today; d++) dowSum[dowOf(d)] += at(d) ?? 0;
  const bestDow = dowSum.indexOf(Math.max(...dowSum));
  const hours = o.hours ?? [];
  const bestH = hours.length ? hours.indexOf(Math.max(...hours)) : -1;
  const slotKo = (h: number) => (h < 6 ? '새벽' : h < 12 ? '오전' : h < 18 ? '낮' : '밤');
  const weekDays = Array.from({ length: dowOf(today) + 1 }, (_, i) => at(today - dowOf(today) + i) ?? 0);
  let streak = 0;
  for (let d = (at(today) ?? 0) > 0 ? today : today - 1; d >= first && (at(d) ?? 0) > 0; d--) streak++;
  const hmax = Math.max(1, ...hours);
  return (
    <section className="card sv-card">
      <div className="sv-head"><h2>언제 모이나요</h2><span className="meta">최근 {N}주 · 하루 판 수</span></div>
      <div className="sv-plot" ref={ref} style={{ marginTop: 16 }} onPointerLeave={() => setHover(null)}>
        {W > 0 && daily.length > 0 && <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="날짜별 판 수 열지도">
          {[0, 2, 4, 6].map((r) => <text key={r} x={left - 8} y={top + r * (ch + gap) + ch / 2 + 4} textAnchor="end" className="sv-ax">{DOW[r]}</text>)}
          {Array.from({ length: N }, (_, c) => {
            const d0 = mon + c * 7, a = dateOf(d0), prev = dateOf(d0 - 7);
            return (c === 0 || a.m !== prev.m) && <text key={c} x={left + c * (cw + gap)} y={top - 8} className="sv-ax">{a.m}월</text>;
          })}
          {Array.from({ length: N * 7 }, (_, k) => {
            const c = Math.floor(k / 7), r = k % 7, d = mon + c * 7 + r, v = at(d), x = left + c * (cw + gap), yy = top + r * (ch + gap);
            const future = d > today, isToday = d === today, dd = dateOf(d);
            return <g key={k}>
              <rect x={x} y={yy} width={cw} height={ch} rx="4" fill={future ? 'var(--sv-future)' : `var(--sv-h${lvOf(v ?? 0)})`}
                onPointerEnter={() => setHover({ x: x + cw / 2, y: yy, t: `${dd.m}/${dd.day} ${DOW[r]} · ${future ? '아직' : `${v ?? 0}판`}` })} />
              {isToday && <><rect x={x + 1.5} y={yy + 1.5} width={cw - 3} height={ch - 3} rx="3" fill="none" stroke="var(--surface)" strokeWidth="1.5" pointerEvents="none" /><circle cx={x + cw / 2} cy={yy + ch / 2} r="2" fill="var(--surface)" pointerEvents="none" /></>}
            </g>;
          })}
          {(() => {
            const ly = top + 7 * (ch + gap) + 8, ls = 12;
            const sx = W - 28 - 5 * (ls + 3);
            return <g>
              <rect x={left} y={ly} width={ls} height={ls} rx="3" fill="var(--sv-h3)" /><rect x={left + 1.5} y={ly + 1.5} width={ls - 3} height={ls - 3} rx="2" fill="none" stroke="var(--surface)" strokeWidth="1.2" />
              <text x={left + ls + 6} y={ly + 10} className="sv-ax">오늘</text>
              <text x={sx - 6} y={ly + 10} textAnchor="end" className="sv-ax">적음</text>
              {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={sx + i * (ls + 3)} y={ly} width={ls} height={ls} rx="3" fill={`var(--sv-h${i})`} />)}
              <text x={sx + 5 * (ls + 3) + 3} y={ly + 10} className="sv-ax">많음</text>
            </g>;
          })()}
        </svg>}
        {hover && <div className="sv-tip mini" style={{ left: hover.x, top: hover.y - 8 }} role="tooltip">{hover.t}</div>}
      </div>
      {hours.length === 24 && <div className="sv-hours" aria-label="시간대별 판 수 (최근 4주)">
        <span className="meta">시간대 (최근 4주)</span>
        <div className="sv-hstrip">{hours.map((v, h) => <i key={h} title={`${h}시 · ${v}판`} style={{ background: `var(--sv-h${v ? Math.max(1, Math.round((v / hmax) * 4)) : 0})` }} />)}</div>
        <div className="sv-hlab"><span>0시</span><span>6시</span><span>12시</span><span>18시</span></div>
      </div>}
      <div className="sv-side">
        <div><span>가장 많은 날</span><b>{DOW[bestDow]}요일{bestH >= 0 && <small>{slotKo(bestH)} {bestH % 12 || 12}시~</small>}</b></div>
        <div><span>이번 주 모인 날</span><b>{weekDays.filter((v) => v > 0).length}<small>/ {weekDays.length}일</small></b></div>
        <div><span>연속으로 모인 날</span><b>{streak}<small>일째</small></b></div>
      </div>
    </section>
  );
}

// ───────── 잘하고 있는 멤버 ─────────

function Picks({ o, onOpen }: { o: StaffOverview; onOpen?: (id: string) => void }) {
  const skins = useSkins();
  const [tip, setTip] = useState<{ x: number; y: number; t: string } | null>(null);
  const picks = o.picks ?? [];
  const ev = (p: (typeof picks)[number], k: PickKey) => (k === 'act' ? `${p.n}판` : k === 'crew' ? `${Math.round((p.crew / Math.max(1, p.n)) * 100)}% (${p.crew}판)` : k === 'days' ? `${p.days} / 14일` : k === 'mates' ? `${p.mates}명` : `${p.score}점`);
  return (
    <section className="card sv-card" onPointerLeave={() => setTip(null)}>
      <div className="sv-head"><h2>잘하고 있는 멤버</h2><span className="meta">최근 2주 · 다섯 가지 기준을 합친 활동 지수 (0~100)</span></div>
      <div className="sv-crit">{PICK_INFO.map((c) => <div key={c.key}><span className="t"><i className="k" style={{ background: c.color }} />{c.name}<em>{PICK_POINTS[c.key]}점</em></span><p>{c.desc}</p></div>)}</div>
      {picks.length ? <div className="sv-mtbl" role="table">
        <div className="sv-mr h" role="row"><span /><span>멤버</span><span>기준마다 받은 몫 (합 100)</span><span>지수</span></div>
        {picks.map((p, i) => {
          const top2 = [...PICK_INFO].sort((a, b) => p.pts[b.key] / PICK_POINTS[b.key] - p.pts[a.key] / PICK_POINTS[a.key]).slice(0, 2).map((c) => c.name);
          return (
            <div key={p.id} className="sv-mr" role="row" tabIndex={0} onClick={() => onOpen?.(p.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen?.(p.id); }}>
              <span className={`rk ${i === 0 ? 'r1' : ''}`}>{i + 1}</span>
              <span className="who"><MemberFace nick={p.nick} skin={p.skin} champion={p.main} size={36} skins={skins} /><span><b>{shortNick(p.nick)}</b><small>강점 · {top2.join('·')}</small></span></span>
              <span className="sb">
                <span className="sv-stack" aria-label={PICK_INFO.map((c) => `${c.name} ${p.pts[c.key]}점`).join(', ')}>
                  {PICK_INFO.map((c, j) => <i key={c.key} className="sv-grow-x" style={{ width: `${p.pts[c.key]}%`, background: c.color, animationDelay: `${150 + j * 40}ms` }}
                    onPointerEnter={(e) => { const r = (e.currentTarget.closest('.sv-card') as HTMLElement).getBoundingClientRect(), b = e.currentTarget.getBoundingClientRect(); setTip({ x: b.left - r.left + b.width / 2, y: b.top - r.top, t: `${c.name} ${p.pts[c.key]}점 · ${ev(p, c.key)}` }); }} />)}
                </span>
                <span className="sv-chips">{PICK_INFO.map((c) => <span key={c.key}><i className="k" style={{ background: c.color }} />{ev(p, c.key)}</span>)}</span>
              </span>
              <span className={`tot ${pickTier(p.total)}`} title={`활동 지수 ${p.total} · ${PICK_TIER_KO[pickTier(p.total)]} (${PICK_TIERS.low} 미만 낮음 · ${PICK_TIERS.high} 이상 높음)`}><b>{p.total}</b><small>{PICK_TIER_KO[pickTier(p.total)]}</small></span>
            </div>
          );
        })}
      </div> : <Empty>최근 2주에 5판 넘게 한 멤버가 아직 없어요.</Empty>}
      {tip && <div className="sv-tip mini" style={{ left: tip.x, top: tip.y - 8 }} role="tooltip">{tip.t}</div>}
    </section>
  );
}

// ───────── 온보딩 현황 ─────────

/** 양 → 물 색 (섞으면 탁해져 구간마다 또렷한 한 색): 95% 이상 초록 · 85% 이상 청록 · 75% 이상 남색 · 그 아래 주황 */
const waterOf = (pct: number) => (pct >= 95 ? 'var(--ok)' : pct >= 85 ? 'var(--sv-teal)' : pct >= 75 ? 'var(--accent)' : 'var(--warn)');
const WAVE = <svg className="sv-wave" viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden="true"><path d="M0,6 C35,0 65,0 100,5 S165,10 200,4 V10 H0 Z" /></svg>;

function Onboarding({ o, reviewWaiting }: { o: StaffOverview; reviewWaiting: number }) {
  const f = o.funnel;
  const tips = useMemo(() => (f ? onboardTips(f, reviewWaiting) : []), [f, reviewWaiting]);
  if (!f) return null;
  const base = f.joined || 1;
  const days: Partial<Record<string, number | null>> = { app: o.funnelDays?.app, played: o.funnelDays?.played };
  return (
    <section className="card sv-card">
      <div className="sv-head"><h2>온보딩 현황</h2><span className="meta">최근 4주 가입 {f.joined}명</span></div>
      {f.joined ? <>
        <div className="sv-steps">
          {ONBOARD_STEPS.map((s, i) => {
            const v = f[s.key], pct = Math.round((v / base) * 100), ok = pct >= s.goal;
            const prev = i ? f[ONBOARD_STEPS[i - 1].key] : null, conv = prev ? Math.round((v / prev) * 100) : null, t = days[s.key];
            return (
              <div key={s.key} className={`sv-st ${ok ? 'ok' : 'bad'}`} style={{ ['--i' as string]: i }}>
                <span className="tank" aria-hidden="true"><span className="water" style={{ height: `${pct}%`, ['--w' as string]: waterOf(pct) }}><span className="crest">{WAVE}</span></span></span>
                <span className="no">{i + 1}단계</span>
                <h4>{s.name}</h4>
                <span className="num"><b>{v}</b><span>명 · {pct}%</span></span>
                <span className="tg"><em className={ok ? 'ok' : 'no'}>{ok ? '✓ 목표 달성' : `목표까지 ${s.goal - pct}%p`}</em>{ok && <span>목표 {s.goal}%</span>}</span>
                <span className="time">{conv != null ? `앞 단계에서 ${conv}% 넘어옴${t != null ? ` · 가입 후 평균 ${t}일` : ''}` : `기준 ${f.joined}명`}</span>
                <span className="ins">{onboardNote(s.key, f)}</span>
              </div>
            );
          })}
        </div>
        {tips.length > 0 && <div className="sv-todo-box"><span className="ic">!</span><div><h4>이번 주 할 일</h4><ol>{tips.map((t, i) => <li key={i}>{bold(t)}</li>)}</ol><p className="src">위 단계 숫자로 규칙에 따라 만들어요. 목표에 가장 많이 못 미친 단계부터.</p></div></div>}
      </> : <Empty>최근 4주에 새로 가입한 멤버가 없어요.</Empty>}
    </section>
  );
}

/** 대시보드 본문 */
export function ReportDash({ o, reviewWaiting, onOpen }: { o: StaffOverview; reviewWaiting: number; onOpen?: (id: string) => void }) {
  return (
    <>
      <Rings o={o} />
      <div className="sv-row">
        <WaveCombo o={o} />
        {o.daily ? <Calendar o={o} /> : null}
      </div>
      <Picks o={o} onOpen={onOpen} />
      <Onboarding o={o} reviewWaiting={reviewWaiting} />
    </>
  );
}
