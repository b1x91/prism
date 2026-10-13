/**
 * 첫 화면 연출: 검색창에서 나온 흰 빛이 보석(프리즘)을 지나 일곱 빛깔로 갈라진다.
 * 위치는 실제 검색창·보석 자리를 재서 그린다 (화면 크기가 바뀌면 다시 잰다).
 * 스펙트럼은 브랜드 순간에만 쓴다 (CLAUDE.md 1.5). 동작 줄이기 설정이면 움직임을 끈다 (CSS).
 */
import { useEffect, useState, type RefObject } from 'react';

type Geo = { w: number; h: number; sx: number; sy: number; gx: number; gy: number; r: number; fromEdge: boolean };
const COLORS = [1, 2, 3, 4, 5, 6, 7].map((i) => `var(--spectrum-${i})`);

function measure(box: HTMLElement, anchor: HTMLElement | null, gem: HTMLElement): Geo {
  const b = box.getBoundingClientRect(), g = gem.getBoundingClientRect();
  const gx = g.left + g.width / 2 - b.left, gy = g.top + g.height / 2 - b.top, r = g.width / 2;
  const a = anchor?.getBoundingClientRect();
  // 검색창이 보석 왼쪽에 있을 때만 검색창에서 빛을 낸다 (좁은 화면에서는 왼쪽 끝에서)
  if (a && a.width && a.right - b.left < gx - r * 1.5) return { w: b.width, h: b.height, sx: a.right - b.left, sy: a.top + a.height / 2 - b.top, gx, gy, r, fromEdge: false };
  return { w: b.width, h: b.height, sx: -20, sy: gy + r * 0.9, gx, gy, r, fromEdge: true };
}

export function LightRefraction({ box, anchor, gem }: { box: RefObject<HTMLElement | null>; anchor: RefObject<HTMLElement | null>; gem: RefObject<HTMLElement | null> }) {
  const [geo, setGeo] = useState<Geo | null>(null);
  useEffect(() => {
    // 부모(첫 화면 section)의 ref 는 이 컴포넌트의 효과보다 늦게 붙으므로 한 프레임 뒤에 잰다
    let ro: ResizeObserver | null = null;
    const id = requestAnimationFrame(() => {
      const el = box.current, gm = gem.current;
      if (!el || !gm) return;
      const run = () => setGeo(measure(el, anchor.current, gm));
      run();
      ro = new ResizeObserver(run);
      ro.observe(el);
      if (anchor.current) ro.observe(anchor.current);
      document.fonts?.ready.then(run).catch(() => {});
    });
    return () => { cancelAnimationFrame(id); ro?.disconnect(); };
  }, [box, anchor, gem]);
  if (!geo) return null;

  const { w, h, sx, sy, gx, gy, r } = geo;
  // 들어오는 빛: 검색창 → 보석 왼쪽 면
  const ex = gx - r * 0.42, ey = gy + (sy - gy) * 0.18;
  // 나가는 빛: 보석 오른쪽 면에서 부채꼴로. 끝은 화면 오른쪽 밖
  const ox = gx + r * 0.38, oy = gy + r * 0.04;
  const far = w + 60;
  const reach = far - ox;
  const top = oy - Math.min(h * 0.62, reach * 0.62), bottom = oy + Math.min(h * 0.62, reach * 0.62);
  const step = (bottom - top) / 7;
  const bands = COLORS.map((c, i) => ({ c, y1: top + step * i, y2: top + step * (i + 1), mid: top + step * (i + 0.5), spread: 2.2 }));
  const sparks = Array.from({ length: 14 }, (_, i) => {
    const t = 0.18 + ((i * 37) % 70) / 100, b = bands[(i * 3) % 7];
    return { x: ox + reach * t, y: oy + (b.mid - oy) * t, d: (i % 5) * 0.7, s: 1.6 + (i % 3) };
  });
  const len = Math.hypot(ex - sx, ey - sy);

  return (
    <svg className="light" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        <filter id="lt-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14" /></filter>
        <filter id="lt-mid" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
        {bands.map((b, i) => (
          <linearGradient key={i} id={`lt-b${i}`} gradientUnits="userSpaceOnUse" x1={ox} y1={oy} x2={far} y2={b.mid}>
            <stop offset="0" style={{ stopColor: b.c, stopOpacity: .95 }} />
            <stop offset=".35" style={{ stopColor: b.c, stopOpacity: .55 }} />
            <stop offset="1" style={{ stopColor: b.c, stopOpacity: 0 }} />
          </linearGradient>
        ))}
        <linearGradient id="lt-in" gradientUnits="userSpaceOnUse" x1={sx} y1={sy} x2={ex} y2={ey}>
          <stop offset="0" style={{ stopColor: 'var(--beam)', stopOpacity: .15 }} />
          <stop offset=".25" style={{ stopColor: 'var(--beam)', stopOpacity: .9 }} />
          <stop offset="1" style={{ stopColor: 'var(--beam)', stopOpacity: 1 }} />
        </linearGradient>
        <radialGradient id="lt-bloom"><stop offset="0" style={{ stopColor: 'var(--beam)', stopOpacity: .55 }} /><stop offset=".45" style={{ stopColor: 'var(--spectrum-5)', stopOpacity: .18 }} /><stop offset="1" style={{ stopColor: 'var(--spectrum-7)', stopOpacity: 0 }} /></radialGradient>
        <radialGradient id="lt-flare"><stop offset="0" style={{ stopColor: 'var(--beam)', stopOpacity: .9 }} /><stop offset=".4" style={{ stopColor: 'var(--beam)', stopOpacity: .25 }} /><stop offset="1" style={{ stopColor: 'var(--beam)', stopOpacity: 0 }} /></radialGradient>
      </defs>

      {/* 나가는 빛: 넓게 번진 빛 → 띠 → 가는 심선 → 바깥으로 흐르는 빛 알갱이 */}
      <g className="fan">
        <g filter="url(#lt-soft)" className="fan-glow">
          {bands.map((b, i) => <polygon key={i} points={`${ox},${oy - b.spread} ${far},${b.y1} ${far},${b.y2} ${ox},${oy + b.spread}`} fill={`url(#lt-b${i})`} />)}
        </g>
        <g className="fan-band">
          {bands.map((b, i) => <polygon key={i} points={`${ox},${oy - 1} ${far},${b.y1 + step * 0.18} ${far},${b.y2 - step * 0.18} ${ox},${oy + 1}`} fill={`url(#lt-b${i})`} />)}
        </g>
        <g className="fan-core">
          {bands.map((b, i) => <line key={i} x1={ox} y1={oy} x2={far} y2={b.mid} stroke={`url(#lt-b${i})`} />)}
        </g>
        <g className="fan-flow">
          {bands.map((b, i) => <line key={i} x1={ox} y1={oy} x2={far} y2={b.mid} style={{ stroke: b.c, color: b.c, animationDelay: `${i * 0.23}s` }} />)}
        </g>
        <g className="sparks">
          {sparks.map((p, i) => <path key={i} d={`M${p.x} ${p.y - p.s * 2}L${p.x + p.s * 0.5} ${p.y - p.s * 0.5}L${p.x + p.s * 2} ${p.y}L${p.x + p.s * 0.5} ${p.y + p.s * 0.5}L${p.x} ${p.y + p.s * 2}L${p.x - p.s * 0.5} ${p.y + p.s * 0.5}L${p.x - p.s * 2} ${p.y}L${p.x - p.s * 0.5} ${p.y - p.s * 0.5}Z`} style={{ animationDelay: `${p.d}s` }} />)}
        </g>
      </g>

      {/* 들어오는 빛: 넓은 후광 → 중간 빛 → 흰 심선 → 보석으로 빨려 들어가는 빛 */}
      <g className="beam">
        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="url(#lt-in)" strokeWidth="26" filter="url(#lt-soft)" opacity=".55" />
        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="url(#lt-in)" strokeWidth="8" filter="url(#lt-mid)" opacity=".85" />
        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="url(#lt-in)" strokeWidth="3" className="beam-core" />
        <line x1={sx} y1={sy} x2={ex} y2={ey} className="beam-flow" style={{ ['--len' as string]: `${len}` }} />
        {!geo.fromEdge && <circle cx={sx} cy={sy} r="22" fill="url(#lt-flare)" className="flare" />}
      </g>
      <circle cx={gx} cy={gy} r={r * 1.9} fill="url(#lt-bloom)" className="bloom" />
    </svg>
  );
}
