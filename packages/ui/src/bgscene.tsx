/**
 * 상점 '배경' 장면 (CLAUDE.md v3.34). 머리 뒤·랭킹 줄에 깔린다.
 * 노을 협곡 · 용암 균열 · 수정 동굴은 SVG 로 그린 장면(겹 능선·바위 질감·결정 면), 나머지는 CSS.
 * 그림 파일 없이 코드로만 그리고, 움직임은 CSS(동작 줄이기 존중)로만 준다.
 */
import { useId, type ReactNode } from 'react';

/** 납작한 칸(랭킹 줄)에서 보여 줄 띠: 장면마다 가장 그럴듯한 높이 */
const ROW_VIEW: Record<string, string> = { 'bg-dusk': '0 330 1600 120', 'bg-crystal': '0 250 1600 200', 'bg-magma': '0 380 1600 160' };

const SVG_SCENES: Record<string, (k: string, view?: string) => ReactNode> = {
  'bg-dusk': dusk,
  'bg-magma': magma,
  'bg-crystal': crystal,
};

/** row: 랭킹 줄처럼 아주 납작한 칸 */
export function BgScene({ id, row }: { id: string; row?: boolean }) {
  const k = useId().replace(/[^a-zA-Z0-9]/g, '');
  const svg = SVG_SCENES[id];
  if (svg) return <span className={`bgx ${id} svg`} aria-hidden="true">{svg(k, row ? ROW_VIEW[id] : undefined)}</span>;
  return <span className={`bgx ${id}`} aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</span>;
}

const box = (view: string | undefined, fit: string) => ({ viewBox: view ?? '0 0 1600 600', width: '100%', height: '100%', preserveAspectRatio: view ? 'xMidYMid slice' : fit });

// ───────── 노을 협곡: 해 · 노을 구름 · 겹겹이 멀어지는 능선 · 양옆 협곡 절벽 ─────────
function dusk(k: string, view?: string) {
  return (
    <svg {...box(view, 'xMidYMax slice')}>
      <defs>
        <linearGradient id={`${k}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#150c2b" /><stop offset=".3" stopColor="#3d1840" /><stop offset=".52" stopColor="#8e2f4a" />
          <stop offset=".68" stopColor="#d9594a" /><stop offset=".8" stopColor="#f59a5b" /><stop offset=".9" stopColor="#ffd08a" />
        </linearGradient>
        <radialGradient id={`${k}g`} cx="1120" cy="410" r="520" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff3c9" stopOpacity=".95" /><stop offset=".12" stopColor="#ffd27f" stopOpacity=".75" />
          <stop offset=".4" stopColor="#ff8a4c" stopOpacity=".3" /><stop offset="1" stopColor="#ff6a3c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${k}c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b2a55" stopOpacity=".2" /><stop offset="1" stopColor="#ffb08a" stopOpacity=".75" />
        </linearGradient>
        <linearGradient id={`${k}r1`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b5546a" /><stop offset="1" stopColor="#8a3c5c" /></linearGradient>
        <linearGradient id={`${k}r2`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6e2a4e" /><stop offset="1" stopColor="#4c1c3e" /></linearGradient>
        <linearGradient id={`${k}r3`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a1532" /><stop offset="1" stopColor="#260d24" /></linearGradient>
        <linearGradient id={`${k}r4`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1c0a1b" /><stop offset="1" stopColor="#0d050e" /></linearGradient>
        <linearGradient id={`${k}h`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffb98a" stopOpacity="0" /><stop offset="1" stopColor="#ffb98a" stopOpacity=".35" /></linearGradient>
        <filter id={`${k}b`}><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      <rect width="1600" height="600" fill={`url(#${k}s)`} />
      <circle cx="1120" cy="410" r="520" fill={`url(#${k}g)`} />
      <circle className="dk-sun" cx="1120" cy="405" r="46" fill="#fff4d2" />
      {/* 노을 구름: 아래가 밝게 물든 가는 띠 */}
      <g filter={`url(#${k}b)`} fill={`url(#${k}c)`}>
        <path d="M640 250c60-18 160-22 250-10s170 6 230-6 150-8 190 6c-70 14-170 20-260 18s-170 8-240 6-120-4-170-14z" />
        <path d="M980 318c50-12 130-14 200-6s120 2 170-6c-40 16-110 22-180 20s-130 0-190-8z" opacity=".8" />
        <path d="M180 200c70-16 170-18 260-8s140 2 200-8c-50 18-140 26-230 24s-160 2-230-8z" opacity=".55" />
        <path d="M300 340c40-8 110-10 170-4s90 0 140-6c-30 12-90 18-150 16s-110-2-160-6z" opacity=".6" />
      </g>
      {/* 능선: 멀수록 밝고 붉게 (대기 원근) */}
      <path fill={`url(#${k}r1)`} d="M0 452c90-30 170-22 250-40s150-6 220 12 140-30 230-34 150 20 230 16 130-36 220-30 160 34 240 26 140-22 210-14V600H0z" />
      <rect y="420" width="1600" height="90" fill={`url(#${k}h)`} />
      <path fill={`url(#${k}r2)`} d="M0 488c70-10 140-40 230-36s120 30 200 28 150-44 250-40 120 34 210 36 160-30 250-26 170 26 260 20 120-10 200-4V600H0z" />
      <path fill={`url(#${k}r3)`} d="M0 530c110-6 200-34 320-28s180 26 290 22 200-24 320-20 190 22 300 18 230-14 370-8V600H0z" />
      {/* 협곡 양옆 절벽 */}
      <path fill={`url(#${k}r4)`} stroke="#ff9a5c" strokeOpacity=".35" strokeWidth="2" d="M0 180l40 14 22 40 38 18 16 60 44 36 10 70 46 48 30 80 54 54H0z" />
      <path fill={`url(#${k}r4)`} stroke="#ff9a5c" strokeOpacity=".45" strokeWidth="2" d="M1600 220l-52 20-18 46-46 26-12 58-50 40-8 64-52 44-28 70H1600z" />
      <path fill="#0a0409" d="M0 572c180-14 380-20 560-12s340 14 520 8 340-12 520-6V600H0z" />
      {/* 새 */}
      <g className="dk-birds" fill="none" stroke="#2a0f22" strokeWidth="3" strokeLinecap="round">
        <path d="M900 300q10-8 20 0q10-8 20 0" /><path d="M945 285q7-6 14 0q7-6 14 0" /><path d="M870 318q6-5 12 0q6-5 12 0" />
      </g>
    </svg>
  );
}

// ───────── 용암 균열: 식어 굳은 검은 바위 판들 사이로 달아오른 용암이 비친다 ─────────
function magma(k: string, view?: string) {
  return (
    <svg {...box(view, 'xMidYMid slice')}>
      <defs>
        <linearGradient id={`${k}lava`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c2260c" /><stop offset=".55" stopColor="#ff6a14" /><stop offset="1" stopColor="#ffc24a" />
        </linearGradient>
        <radialGradient id={`${k}hot`} cx=".64" cy=".95" r=".6">
          <stop offset="0" stopColor="#fff2b0" stopOpacity=".9" /><stop offset=".35" stopColor="#ffb340" stopOpacity=".55" /><stop offset="1" stopColor="#ff6a14" stopOpacity="0" />
        </radialGradient>
        {/* 바위 판: 모양은 판 그대로, 겉은 울퉁불퉁한 현무암 질감 */}
        <filter id={`${k}rock`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency=".018" numOctaves="4" seed="9" result="n" />
          <feDiffuseLighting in="n" surfaceScale="3.5" lightingColor="#7a5a50" result="lit"><feDistantLight azimuth="240" elevation="42" /></feDiffuseLighting>
          <feColorMatrix in="lit" type="matrix" values=".34 0 0 0 .02  0 .24 0 0 .01  0 0 .23 0 .01  0 0 0 1 0" result="tex" />
          <feComposite in="tex" in2="SourceAlpha" operator="in" />
        </filter>
        <filter id={`${k}soft`} x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="6" /></filter>
        <linearGradient id={`${k}smoke`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#060203" stopOpacity=".7" /><stop offset=".5" stopColor="#060203" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* 아래: 용암 */}
      <rect width="1600" height="600" fill={`url(#${k}lava)`} />
      <rect className="mg-heat" width="1600" height="600" fill={`url(#${k}hot)`} />
      {/* 바위 판 */}
      <g filter={`url(#${k}rock)`}>{PLATES.map((d, i) => <path key={i} d={d} fill="#000" stroke="#000" strokeWidth="2" strokeLinejoin="round" />)}</g>
      <g>{PLATES.map((d, i) => <path key={i} d={d} fill="#000" opacity={SHADE[i]} />)}</g>
      <g className="mg-glow" filter={`url(#${k}soft)`} fill="none" stroke="#ff6a14" strokeOpacity=".55" strokeWidth="7" style={{ mixBlendMode: 'screen' }}>{PLATES.map((d, i) => <path key={i} d={d} />)}</g>
      <g fill="none" stroke="#ffb347" strokeOpacity=".5" strokeWidth="1.2" strokeLinejoin="round">{PLATES.map((d, i) => <path key={i} d={d} />)}</g>
      {/* 굵은 용암 줄기 */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path className="mg-glow" d={RIVER} stroke="#ff5a10" strokeWidth="46" strokeOpacity=".5" filter={`url(#${k}soft)`} />
        <path d={RIVER} stroke="#e8430c" strokeWidth="16" />
        <path d={RIVER} stroke="#ffa53a" strokeWidth="9" />
        <path d={RIVER} stroke="#fff1b8" strokeWidth="3" />
      </g>
      <rect width="1600" height="600" fill={`url(#${k}smoke)`} />
      <g className="mg-embers" fill="#ffb648">
        {EMBERS.map(([x, y, r, d], i) => <circle key={i} cx={x} cy={y} r={r} style={{ animationDelay: `${d}s` }} />)}
      </g>
    </svg>
  );
}

/** 고정된 난수 (같은 모양이 나오게) */
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** 바위 판: 흔든 격자 꼭짓점을 이웃끼리 나눠 쓰는 다각형 → 판마다 중심 쪽으로 줄여 틈을 만든다 (아래로 갈수록 틈이 넓다) */
const PLATES: string[] = (() => {
  const r = rng(29), cols = 12, rows = 5, cw = 1720 / cols, rh = 680 / rows;
  const P = Array.from({ length: rows + 1 }, (_, j) => Array.from({ length: cols + 1 }, (_, i) => [
    -60 + i * cw + (i && i < cols ? (r() - 0.5) * cw * 0.85 : 0) + (j % 2 ? cw * 0.4 : 0),
    -40 + j * rh + (j && j < rows ? (r() - 0.5) * rh * 0.8 : 0),
  ]));
  const out: string[] = [];
  const poly = (pts: number[][], depthY: number) => {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    // 틈은 몇 픽셀만: 판 크기에 맞춰 줄이는 비율을 정한다 (아래로 갈수록 조금 넓게)
    const rad = pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length;
    const gap = 3.5 + Math.max(0, depthY / 600) * 6 + r() * 2;
    const k = Math.max(0.7, 1 - gap / rad);
    const q = pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
    const d = q.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
    out.push(d + 'Z');
  };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = P[j][i], b = P[j][i + 1], c = P[j + 1][i + 1], d = P[j + 1][i];
    const y = (a[1] + c[1]) / 2;
    const bend = (p: number[], q: number[]) => [(p[0] + q[0]) / 2 + (r() - 0.5) * cw * 0.25, (p[1] + q[1]) / 2 + (r() - 0.5) * rh * 0.25];
    if (r() < 0.2) { poly([a, b, c], y); poly([a, c, d], y); }
    else poly([a, bend(a, b), b, c, bend(c, d), d], y);
  }
  return out;
})();
const SHADE = PLATES.map((_, i) => ((i * 37) % 10) / 30);
/** 화면을 비스듬히 가르는 굵은 용암 줄기 */
const RIVER = (() => {
  const r = rng(41); let x = -40, y = 520, d = `M${x} ${y}`;
  while (x < 1640) { x += 60 + r() * 50; y += (r() - 0.62) * 70; y = Math.max(220, Math.min(600, y)); d += `L${x.toFixed(0)} ${y.toFixed(0)}`; }
  return d;
})();
const EMBERS: [number, number, number, number][] = [
  [180, 560, 3, 0], [420, 590, 2, 1.4], [610, 570, 3.5, 2.6], [760, 600, 2, .8], [940, 580, 3, 3.4],
  [1080, 600, 2.5, 1.9], [1230, 575, 3, 4.2], [1390, 595, 2, 2.2], [1500, 585, 3, .4], [300, 600, 2, 3.8],
];

// ───────── 수정 동굴: 위에서 드는 빛줄기 · 뒤(흐림)/앞(선명) 결정 무리 · 면마다 다른 밝기 · 반짝임 ─────────
type Cr = [x: number, base: number, w: number, h: number, rot: number];
const BACK: Cr[] = [[330, 640, 34, 260, -14], [400, 640, 26, 190, 8], [880, 640, 30, 230, -6], [1240, 640, 40, 300, 10], [1330, 640, 28, 200, -12], [1500, 640, 34, 280, 6]];
const FRONT: Cr[] = [
  [1060, 640, 58, 470, -4], [1150, 640, 46, 360, 12], [985, 640, 40, 300, -18], [1235, 640, 34, 250, 22], [1120, 640, 30, 210, 30],
  [1420, 640, 52, 420, -8], [1500, 640, 38, 300, 14], [1360, 640, 30, 220, -24],
  [140, 640, 46, 340, 10], [70, 640, 34, 240, -16], [220, 640, 30, 200, 24],
];
function crystalPath([x, base, w, h]: Cr) {
  const sh = base - h * 0.78, tip = base - h;
  return {
    left: `M${x - w} ${base}L${x - w} ${sh}L${x} ${tip}L${x + w * 0.12} ${base}Z`,
    right: `M${x + w * 0.12} ${base}L${x} ${tip}L${x + w} ${sh}L${x + w} ${base}Z`,
    capL: `M${x - w} ${sh}L${x} ${tip}L${x - w * 0.15} ${sh + h * 0.06}Z`,
    edge: `M${x} ${tip}L${x + w * 0.12} ${base}`,
  };
}
function crystalGroup(list: Cr[], k: string, front: boolean) {
  return list.map((c, i) => {
    const p = crystalPath(c);
    return (
      <g key={i} transform={`rotate(${c[4]} ${c[0]} ${c[1]})`}>
        <path d={p.left} fill={`url(#${k}${front ? 'fl' : 'bl'})`} />
        <path d={p.right} fill={`url(#${k}${front ? 'fr' : 'br'})`} />
        <path d={p.capL} fill="#eafcff" opacity={front ? 0.22 : 0.08} />
        {front && <path d={p.edge} stroke="#e8fbff" strokeOpacity=".85" strokeWidth="2" />}
        {front && <path d={`M${c[0] - c[2] * 0.55} ${c[1]}L${c[0] - c[2] * 0.55} ${c[1] - c[3] * 0.7}`} stroke="#bff3ff" strokeOpacity=".35" strokeWidth={c[2] * 0.18} strokeLinecap="round" />}
      </g>
    );
  });
}
function crystal(k: string, view?: string) {
  return (
    <svg {...box(view, 'xMidYMax slice')}>
      <defs>
        <linearGradient id={`${k}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#040817" /><stop offset=".55" stopColor="#0a1a3a" /><stop offset="1" stopColor="#10264a" />
        </linearGradient>
        <radialGradient id={`${k}lt`} cx=".66" cy="-.1" r=".9">
          <stop offset="0" stopColor="#9fe8ff" stopOpacity=".55" /><stop offset=".5" stopColor="#4a7cff" stopOpacity=".12" /><stop offset="1" stopColor="#4a7cff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${k}ray`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#bff3ff" stopOpacity=".32" /><stop offset="1" stopColor="#bff3ff" stopOpacity="0" /></linearGradient>
        <linearGradient id={`${k}fl`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c9f6ff" /><stop offset=".25" stopColor="#4fd6ff" /><stop offset=".7" stopColor="#2a6cf0" /><stop offset="1" stopColor="#3a1fa8" /></linearGradient>
        <linearGradient id={`${k}fr`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5cc8ff" /><stop offset=".35" stopColor="#1f7ee0" /><stop offset=".75" stopColor="#1d3aa8" /><stop offset="1" stopColor="#24105e" /></linearGradient>
        <linearGradient id={`${k}bl`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b08cff" /><stop offset="1" stopColor="#2a1a6e" /></linearGradient>
        <linearGradient id={`${k}br`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7a52e6" /><stop offset="1" stopColor="#190f45" /></linearGradient>
        <radialGradient id={`${k}aura`} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#38d6ff" stopOpacity=".55" /><stop offset=".6" stopColor="#5a4dff" stopOpacity=".18" /><stop offset="1" stopColor="#5a4dff" stopOpacity="0" /></radialGradient>
        <radialGradient id={`${k}floor`} cx=".7" cy="1" r=".55"><stop offset="0" stopColor="#6fe3ff" stopOpacity=".55" /><stop offset="1" stopColor="#6fe3ff" stopOpacity="0" /></radialGradient>
        <filter id={`${k}blur`}><feGaussianBlur stdDeviation="5" /></filter>
        <filter id={`${k}glow`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceGraphic" stdDeviation="10" result="g" /><feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <rect width="1600" height="600" fill={`url(#${k}bg)`} />
      <rect width="1600" height="600" fill={`url(#${k}lt)`} />
      <g className="cr-rays" fill={`url(#${k}ray)`}>
        <path d="M960 0h70l-150 600h-150z" /><path d="M1100 0h40l60 600h-120z" opacity=".7" /><path d="M1220 0h90l200 600h-170z" opacity=".5" />
      </g>
      <g filter={`url(#${k}blur)`} opacity=".75">{crystalGroup(BACK, k, false)}</g>
      <rect width="1600" height="600" fill={`url(#${k}floor)`} />
      <ellipse className="cr-aura" cx="1130" cy="430" rx="420" ry="300" fill={`url(#${k}aura)`} />
      <ellipse className="cr-aura" cx="150" cy="500" rx="240" ry="200" fill={`url(#${k}aura)`} />
      <g filter={`url(#${k}glow)`}>{crystalGroup(FRONT, k, true)}</g>
      <rect className="cr-sweep" x="-600" width="400" height="600" fill="#ffffff" opacity=".14" transform="skewX(-18)" />
      <g className="cr-spark" fill="#ffffff">
        {SPARKS.map(([x, y, r, d], i) => <path key={i} d={`M${x} ${y - r}L${x + r * 0.25} ${y - r * 0.25}L${x + r} ${y}L${x + r * 0.25} ${y + r * 0.25}L${x} ${y + r}L${x - r * 0.25} ${y + r * 0.25}L${x - r} ${y}L${x - r * 0.25} ${y - r * 0.25}Z`} style={{ animationDelay: `${d}s` }} />)}
      </g>
    </svg>
  );
}
const SPARKS: [number, number, number, number][] = [[1062, 200, 14, 0], [1418, 250, 11, 1.3], [1150, 300, 9, 2.4], [140, 330, 10, .7], [985, 360, 8, 3.1], [1500, 360, 9, 1.9], [760, 120, 6, 2.8], [520, 220, 5, .4]];
