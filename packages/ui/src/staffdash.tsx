/**
 * 운영 대시보드 B안 '주간 리포트' (CLAUDE.md v3.159). 숫자를 읽는 운영진을 위한 밝은 보고서.
 *  - 처리할 일 한 줄 (승인 대기 · 정회원 심사 · 가입 신청 · 문의)
 *  - 기간(이번 주 · 4주 · 8주) 숫자 넷 + 8주 흐름선. 이번 주는 지난주 '같은 때까지'와 비교한다 (이틀째인 이번 주를 지난주 전체와 견주지 않게)
 *  - 주별 판(모임 판·그 밖) 막대 + 활동 멤버 선, 이번 주는 지금 속도로 본 예상을 점선으로
 *  - 언제 모이나요 (최근 4주, 요일 × 시간대) · 새 멤버 정착 (가입 → 정회원)
 * 그래프는 SVG 를 실제 폭으로 그린다(늘이지 않음) — 글자·선 굵기가 폭에 따라 뭉개지지 않게.
 */
import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { josa, pct, shortNick, type StaffMembers, type StaffOverview, type StaffSpan } from '@prism/core';
import { Empty, MemberFace, Seg, useSkins } from './basics';
import { Icon, type IconName } from './icons';
import { useKept } from './kept';

type Period = 'week' | 'w4' | 'w8';
const PERIOD_LABEL: Record<Period, string> = { week: '이번 주', w4: '4주', w8: '8주' };
const PREV_LABEL: Record<Period, string> = { week: '지난주 같은 때', w4: '앞 4주', w8: '앞 8주' };
const WEEK = 7 * 86_400_000;
const md = (t: number) => { const d = new Date(t + 9 * 3_600_000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };

/** 그릇의 실제 폭 (SVG 를 늘이지 않고 그 폭으로 그린다) */
function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** 눈금이 깔끔하게 떨어지는 최댓값 (1·2·2.5·5 × 10^k 의 4칸) */
function niceTop(v: number, ticks = 4) {
  const raw = Math.max(v, ticks) / ticks;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
  return { top: step * ticks, step };
}

/** 점들을 지나는 부드러운 선 (모노톤 — 값 사이에서 넘치지 않는다) */
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

// ───────── 처리할 일 ─────────

export function TodoStrip({ data, onMembers, onJoin, onInquiry }: { data: StaffMembers; onMembers?: () => void; onJoin?: () => void; onInquiry?: () => void }) {
  const pending = data.members.filter((m) => m.pending).length, review = data.members.filter((m) => m.review).length;
  const apps = data.applications ? data.applications.new + data.applications.confirmed : 0;
  const items: { n: number; label: string; go?: () => void }[] = [
    { n: pending, label: '승인 대기', go: onMembers },
    { n: review, label: '정회원 심사', go: onMembers },
    ...(data.applications ? [{ n: apps, label: '가입 신청', go: onJoin }] : []),
    ...(data.inquiries != null ? [{ n: data.inquiries, label: '문의', go: onInquiry }] : []),
  ];
  const total = items.reduce((a, x) => a + x.n, 0);
  return (
    <nav className={`sd-todo ${total ? 'hot' : ''}`} aria-label="처리할 일">
      <b className="sd-todo-t">{total ? <><Icon name="bell" />처리할 일 {total}</> : <><Icon name="check" />처리할 일이 없어요</>}</b>
      <span className="sd-todo-l">
        {items.map((x) => (
          <button key={x.label} type="button" className={`sd-ti ${x.n ? 'on' : ''}`} disabled={!x.go} onClick={x.go}>
            <span className="sd-tn">{x.n}</span>{x.label}
          </button>
        ))}
      </span>
      <span className="sd-todo-a">
        {onJoin && <button type="button" className="btn sm" onClick={onJoin}><Icon name="gift" />가입 신청</button>}
        {onMembers && <button type="button" className={`btn sm ${pending + review ? 'primary' : ''}`} onClick={onMembers}><Icon name="users" />멤버 관리</button>}
      </span>
    </nav>
  );
}

// ───────── 숫자 넷 ─────────

function Spark({ vals, color }: { vals: number[]; color: string }) {
  const id = useId().replace(/:/g, '');
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = 40, pad = 4;
  const max = Math.max(1, ...vals), min = Math.min(...vals, 0);
  const pts: [number, number][] = vals.map((v, i) => [pad + (i * (w - pad * 2)) / Math.max(1, vals.length - 1), h - 4 - ((v - min) / (max - min || 1)) * (h - 12)]);
  const line = w ? smooth(pts) : '';
  const end = pts[pts.length - 1];
  return (
    <div className="sd-spark" ref={ref} aria-hidden="true">
      {w > 0 && <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <defs><linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".22" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        <path d={`${line} L${end[0]},${h} L${pts[0][0]},${h} Z`} fill={`url(#g${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" />
        <circle cx={end[0]} cy={end[1]} r="6" fill={color} opacity=".16" />
        <circle cx={end[0]} cy={end[1]} r="3" fill={color} stroke="var(--surface)" strokeWidth="1.5" />
      </svg>}
    </div>
  );
}

function Change({ now, prev, label }: { now: number; prev: number; label: string }) {
  const d = now - prev;
  if (!d) return <span className="sd-chg">{josa(label, '과/와')} 같아요</span>;
  const rate = prev ? Math.round((d / prev) * 100) : null;
  return (
    <span className="sd-chg">
      <em className={d > 0 ? 'up' : 'down'}><Icon name={d > 0 ? 'arrowUp' : 'arrowDown'} />{Math.abs(d)}{rate != null && Math.abs(rate) < 1000 ? <small>{Math.abs(rate)}%</small> : null}</em>
      <span>{label} {prev}</span>
    </span>
  );
}

function Kpis({ o, period }: { o: StaffOverview; period: Period }) {
  const p = o.periods?.[period];
  const span: StaffSpan = p?.now ?? { active: o.kpi.active, games: o.weeks[o.weeks.length - 1].games, crew: o.kpi.crew, joined: o.kpi.joinedWeek };
  const prev: StaffSpan | null = p?.prev ?? null;
  const tiles: { key: keyof StaffSpan | 'members'; icon: IconName; label: string; value: number; sub: ReactNode; vals: number[]; color: string }[] = [
    { key: 'active', icon: 'spark', label: '활동 멤버', value: span.active, sub: prev ? <Change now={span.active} prev={prev.active} label={PREV_LABEL[period]} /> : null, vals: o.weeks.map((w) => w.active), color: 'var(--accent)' },
    { key: 'crew', icon: 'swords', label: '모임 판', value: span.crew, sub: prev ? <Change now={span.crew} prev={prev.crew} label={PREV_LABEL[period]} /> : null, vals: o.weeks.map((w) => w.crew), color: 'var(--accent)' },
    { key: 'games', icon: 'game', label: '전체 판', value: span.games, sub: prev ? <Change now={span.games} prev={prev.games} label={PREV_LABEL[period]} /> : null, vals: o.weeks.map((w) => w.games), color: 'var(--accent)' },
    { key: 'members', icon: 'users', label: '멤버', value: o.kpi.members, sub: <span className="sd-chg">{span.joined ? <><em className="up"><Icon name="plus" />{span.joined}</em><span>{PERIOD_LABEL[period]} 가입</span></> : <span>{PERIOD_LABEL[period]} 새 가입 없음</span>}</span>, vals: o.memberWeeks ?? o.weeks.map(() => o.kpi.members), color: 'var(--accent)' },
  ];
  return (
    <section className="sd-kpis" aria-label={`${PERIOD_LABEL[period]} 숫자`}>
      {tiles.map((t) => (
        <div key={t.key} className="sd-kpi">
          <span className="sd-kl"><Icon name={t.icon} />{t.label}</span>
          <b className="sd-kv">{t.value.toLocaleString()}</b>
          {t.sub}
          <Spark vals={t.vals} color={t.color} />
        </div>
      ))}
    </section>
  );
}

// ───────── 주별 판 + 활동 멤버 ─────────

function WeekCombo({ o }: { o: StaffOverview }) {
  const weeks = o.weeks;
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const narrow = W > 0 && W < 520;
  const H = narrow ? 220 : 260, top = 16, bottom = 28, left = narrow ? 28 : 36, right = narrow ? 28 : 36;
  const into = o.weekInto ?? 0;
  const last = weeks[weeks.length - 1];
  // 이번 주가 이틀 넘게 지났으면 지금 속도로 본 예상 (판 수만, 7일 기준). 주 초반의 튀는 예상은 그리지 않는다 — 지난 주들 최고의 1.6배까지만
  const pastMax = Math.max(1, ...weeks.slice(0, -1).map((w) => w.games));
  const rawProj = into > 2 * 86_400_000 && last.games > 0 ? Math.round(last.games / (into / WEEK)) : null;
  const proj = rawProj != null && rawProj <= pastMax * 1.6 ? rawProj : null;
  const gMax = niceTop(Math.max(...weeks.map((w) => w.games), proj ?? 0));
  const aMax = niceTop(Math.max(...weeks.map((w) => w.active)));
  const iw = Math.max(0, W - left - right), ih = H - top - bottom;
  const col = iw / weeks.length, bw = Math.min(40, col * 0.5);
  const y = (v: number) => top + ih - (v / gMax.top) * ih;
  const ya = (v: number) => top + ih - (v / aMax.top) * ih;
  const cx = (i: number) => left + col * i + col / 2;
  const linePts: [number, number][] = weeks.map((w, i) => [cx(i), ya(w.active)]);
  const total = weeks.reduce((a, w) => a + w.games, 0);
  /** 위 모서리만 둥근 막대 */
  const bar = (x: number, y0: number, y1: number, r: number) => {
    const h = y1 - y0;
    if (h <= 0) return '';
    const rr = Math.min(r, h, bw / 2);
    return `M${x},${y1} V${y0 + rr} Q${x},${y0} ${x + rr},${y0} H${x + bw - rr} Q${x + bw},${y0} ${x + bw},${y0 + rr} V${y1} Z`;
  };
  const h = hover != null ? weeks[hover] : null;
  return (
    <section className="card pad sd-card sd-combo">
      <div className="sd-head"><h2>주별 판과 활동 멤버</h2><span className="meta">최근 8주 · {total.toLocaleString()}판</span></div>
      <div className="sd-legend">
        <span><i className="sw crew" />모임 판</span><span><i className="sw solo" />그 밖의 판</span><span><i className="sw line" />활동 멤버</span>
        {proj != null && proj > last.games && <span><i className="sw proj" />이번 주 예상</span>}
      </div>
      <div className="sd-plot" ref={ref} onMouseLeave={() => setHover(null)}>
        {W > 0 && <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`최근 8주 ${weeks.map((w, i) => `${i === weeks.length - 1 ? '이번 주' : md(w.start)} ${w.games}판 활동 ${w.active}명`).join(', ')}`}>
          <defs>
            <pattern id="sdHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--sd-solo)" opacity=".35" /><line x1="0" y1="0" x2="0" y2="6" stroke="var(--accent)" strokeWidth="1.4" opacity=".55" /></pattern>
          </defs>
          {Array.from({ length: 5 }, (_, i) => {
            const v = gMax.step * i, yy = y(v);
            return <g key={i}>
              <line x1={left} x2={W - right} y1={yy} y2={yy} stroke="var(--line)" strokeDasharray={i ? '2 4' : undefined} />
              <text x={left - 8} y={yy + 4} textAnchor="end" className="sd-ax">{v}</text>
              <text x={W - right + 8} y={yy + 4} textAnchor="start" className="sd-ax a">{Math.round(aMax.step * i)}</text>
            </g>;
          })}
          {hover != null && <rect x={left + col * hover + 2} y={top - 6} width={col - 4} height={ih + 6} rx="8" fill="var(--surface-2)" />}
          {weeks.map((w, i) => {
            const x = cx(i) - bw / 2, isLast = i === weeks.length - 1;
            return <g key={w.start}>
              {isLast && proj != null && proj > w.games && <path d={bar(x, y(proj), y(w.games), 6)} fill="url(#sdHatch)" stroke="var(--accent)" strokeOpacity=".55" strokeDasharray="3 3" />}
              <path d={bar(x, y(w.games), y(w.crew), w.crew > 0 ? 6 : 6)} fill="var(--sd-solo)" />
              <path d={bar(x, y(w.crew), y(0), w.games > w.crew ? 0 : 6)} fill="var(--accent)" />
              {(isLast || col >= 52 || (weeks.length - 1 - i) % 2 === 0) && <text x={cx(i)} y={H - 8} textAnchor="middle" className={`sd-ax x ${isLast ? 'now' : ''}`}>{isLast ? '이번 주' : md(w.start)}</text>}
            </g>;
          })}
          <path d={smooth(linePts)} fill="none" stroke="var(--sd-line)" strokeWidth="2.25" strokeLinecap="round" />
          {linePts.map(([px, py], i) => <circle key={i} cx={px} cy={py} r={i === hover || i === weeks.length - 1 ? 4.5 : 3} fill="var(--surface)" stroke="var(--sd-line)" strokeWidth="2" />)}
          {weeks.map((_, i) => <rect key={i} x={left + col * i} y={top - 6} width={col} height={ih + bottom} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${i === weeks.length - 1 ? '이번 주' : md(weeks[i].start)} 주`} />)}
        </svg>}
        {h && hover != null && (
          <div className={`sd-tip ${hover > weeks.length / 2 ? 'l' : ''}`} style={{ left: cx(hover) }} role="tooltip">
            <b>{hover === weeks.length - 1 ? '이번 주' : `${md(h.start)} 주`}</b>
            <span><i className="sw crew" />모임 판 <em>{h.crew}</em></span>
            <span><i className="sw solo" />그 밖의 판 <em>{h.games - h.crew}</em></span>
            <span><i className="sw line" />활동 멤버 <em>{h.active}명</em></span>
            {hover === weeks.length - 1 && proj != null && proj > h.games && <span className="sub">이 속도면 약 {proj}판</span>}
            {h.games > 0 && <span className="sub">모임 판 비율 {Math.round((h.crew / h.games) * 100)}%</span>}
          </div>
        )}
      </div>
    </section>
  );
}

// ───────── 언제 모이나요 ─────────

const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const SLOTS: [string, string][] = [['오전', '6~12시'], ['낮', '12~18시'], ['저녁', '18~21시'], ['밤', '21~24시'], ['새벽', '0~6시']];

function Heat({ heat }: { heat: number[][] }) {
  const max = Math.max(0, ...heat.flat());
  const total = heat.flat().reduce((a, b) => a + b, 0);
  const cells = heat.flatMap((r, s) => r.map((n, d) => ({ n, s, d }))).sort((a, b) => b.n - a.n);
  const best = cells[0];
  const second = cells[1];
  return (
    <section className="card pad sd-card">
      <div className="sd-head"><h2>언제 모이나요</h2><span className="meta">최근 4주 · {total}판</span></div>
      {total ? <>
        <div className="sd-heat" role="table" aria-label="요일과 시간대별 판 수">
          <span />
          {DAYS.map((d, i) => <span key={d} className={`sd-hd ${i >= 5 ? 'we' : ''}`} role="columnheader">{d}</span>)}
          {heat.map((row, s) => <Row key={s} s={s} row={row} max={max} best={best} />)}
        </div>
        <div className="sd-scale" aria-hidden="true"><span>적음</span><i /><span>많음</span></div>
        <p className="sd-note"><b>{DAYS[best.d]}요일 {SLOTS[best.s][0]}</b>({SLOTS[best.s][1]})에 가장 많이 모여요{second && second.n > 0 ? <> · 다음은 {DAYS[second.d]}요일 {SLOTS[second.s][0]}</> : null}.</p>
      </> : <Empty>최근 4주에 기록된 판이 없어요.</Empty>}
    </section>
  );
}
function Row({ s, row, max, best }: { s: number; row: number[]; max: number; best: { n: number; s: number; d: number } }) {
  return (
    <>
      <span className="sd-hr" role="rowheader">{SLOTS[s][0]}<small>{SLOTS[s][1]}</small></span>
      {row.map((n, d) => {
        // 0 은 바탕, 그 위는 루트 비율로 (적은 칸도 구분되게)
        const k = n ? 0.14 + 0.86 * Math.sqrt(n / (max || 1)) : 0;
        const isBest = n > 0 && s === best.s && d === best.d;
        return <span key={d} role="cell" className={`sd-hc ${n ? '' : 'z'} ${isBest ? 'best' : ''} ${k > 0.62 ? 'dark' : ''}`} style={n ? { background: `color-mix(in srgb, var(--accent) ${Math.round(k * 100)}%, var(--surface-2))` } : undefined} title={`${DAYS[d]}요일 ${SLOTS[s][0]} (${SLOTS[s][1]}) · ${n}판`}>{n || ''}</span>;
      })}
    </>
  );
}

// ───────── 새 멤버 정착 ─────────

function Funnel({ f }: { f: NonNullable<StaffOverview['funnel']> }) {
  const steps: [string, number][] = [['가입', f.joined], ['롤 계정 연결', f.linked], ['앱 설치', f.app], ['첫 판', f.played], ['모임 판 3판', f.crew3], ['정회원', f.regular]];
  const base = f.joined || 1;
  let worst = { i: -1, drop: 0 };
  steps.forEach(([, n], i) => { if (i && steps[i - 1][1] - n > worst.drop) worst = { i, drop: steps[i - 1][1] - n }; });
  return (
    <section className="card pad sd-card">
      <div className="sd-head"><h2>새 멤버 정착</h2><span className="meta">최근 4주 가입 {f.joined}명</span></div>
      {f.joined ? <>
        <ol className="sd-funnel">
          {steps.map(([label, n], i) => {
            const drop = i ? steps[i - 1][1] - n : 0;
            return (
              <li key={label} className={i === worst.i ? 'worst' : ''}>
                <span className="sd-fl">{label}{drop > 0 && <span className="sd-fd">−{drop}</span>}</span>
                <span className="sd-fb"><i style={{ width: `${Math.max(n ? 4 : 0, (n / base) * 100)}%` }} /></span>
                <span className="sd-fn"><b>{n}</b><small>{Math.round((n / base) * 100)}%</small></span>
              </li>
            );
          })}
        </ol>
        {worst.i > 0 && <p className="sd-note">가장 많이 멈추는 곳은 <b>{steps[worst.i][0]}</b>이에요 ({steps[worst.i - 1][0]}에서 {worst.drop}명).</p>}
      </> : <Empty>최근 4주에 새로 가입한 멤버가 없어요.</Empty>}
    </section>
  );
}

// ───────── 잘하고 있는 멤버 ─────────

function StarTable({ stars, onOpen }: { stars: StaffOverview['stars']; onOpen?: (id: string) => void }) {
  const skins = useSkins();
  const best = Math.max(1, ...stars.map((m) => m.score));
  return (
    <section className="card pad sd-card">
      <div className="sd-head"><h2>잘하고 있는 멤버</h2><span className="meta">최근 2주 · 5판 이상 · Prism 점수 순</span></div>
      {stars.length ? <div className="sd-tbl" role="table">
        <div className="sd-tr head" role="row"><span>멤버</span><span>판</span><span>승률</span><span>모임 판</span><span>점수</span></div>
        {stars.map((m, i) => {
          const wr = m.n ? m.w / m.n : 0;
          return (
            <button key={m.id} type="button" className="sd-tr" role="row" onClick={() => onOpen?.(m.id)}>
              <span className="sd-who"><i className={`sd-rk r${i + 1}`}>{i + 1}</i><MemberFace nick={m.nick} skin={m.skin} champion={m.main} size={32} skins={skins} /><b>{shortNick(m.nick)}</b></span>
              <span className="num">{m.n}</span>
              <span className="sd-wr"><span className="num">{pct(m.w, m.n)}</span><i aria-hidden="true"><i style={{ width: `${wr * 100}%` }} className={wr >= 0.5 ? 'up' : 'down'} /><em /></i></span>
              <span className="num">{m.crew}</span>
              <span className="sd-sc"><b className="num">{m.score}</b><i aria-hidden="true"><i style={{ width: `${(m.score / best) * 100}%` }} /></i></span>
            </button>
          );
        })}
      </div> : <Empty>최근 2주에 5판 넘게 한 멤버가 아직 없어요.</Empty>}
    </section>
  );
}

/** B안 대시보드 본문 */
export function ReportDash({ o, online, care, mix, onOpen }: { o: StaffOverview; online: number; care: ReactNode; mix: ReactNode; onOpen?: (id: string) => void }) {
  const [period, setPeriod] = useKept<Period>('staff-period', 'week');
  const ws = o.weeks[o.weeks.length - 1].start;
  const range = useMemo(() => {
    const from = period === 'week' ? ws : period === 'w4' ? ws - 3 * WEEK : ws - 7 * WEEK;
    return `${md(from)} ~ 오늘`;
  }, [period, ws]);
  return (
    <>
      <div className="sd-bar">
        <div className="sd-range"><span className="meta">{range} · {josa(PREV_LABEL[period], '과/와')} 비교</span><span className="sd-on"><i className="stf-live" aria-hidden="true" />지금 접속 <b>{online}</b></span></div>
        <Seg value={period} options={[['week', '이번 주'], ['w4', '4주'], ['w8', '8주']]} onChange={setPeriod} />
      </div>
      <Kpis o={o} period={period} />
      <div className="sd-row">
        <WeekCombo o={o} />
        {o.heat ? <Heat heat={o.heat} /> : mix}
      </div>
      <div className="sd-row">
        <StarTable stars={o.stars} onOpen={onOpen} />
        {o.funnel ? <Funnel f={o.funnel} /> : null}
      </div>
      <div className="sd-row even">
        {care}
        {o.heat ? mix : null}
      </div>
    </>
  );
}
