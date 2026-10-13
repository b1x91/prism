/**
 * 첫 실행 화면: 빛 한 줄이 프리즘(로고)에 들어가 스펙트럼으로 갈라진다.
 * 세션 확인이 끝나고 최소 시간이 지나면 사라진다. 동작 줄이기 설정이면 움직임 없이 짧게.
 */
const BANDS = [0, 1, 2, 3, 4, 5, 6];

export function Splash({ leaving, note }: { leaving: boolean; note: string }) {
  // 부채꼴: 보석 오른쪽(640,400)에서 화면 오른쪽 밖으로 7줄
  const top = 130, bottom = 690, step = (bottom - top) / 7;
  return (
    <div className={`splash ${leaving ? 'out' : ''}`} aria-hidden="true">
      <svg className="sp-svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="sp-beam" x1="0" x2="1"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".6" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor="#fff" /></linearGradient>
          <filter id="sp-blur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="18" /></filter>
          <filter id="sp-glow" x="-10%" y="-200%" width="120%" height="500%"><feGaussianBlur stdDeviation="4" /></filter>
          {/* 부채꼴은 보석에서부터 원이 커지며 드러난다 */}
          <clipPath id="sp-reveal"><circle className="sp-clip" cx="640" cy="400" r="0" /></clipPath>
        </defs>
        <g className="sp-fan" clipPath="url(#sp-reveal)">
          <g filter="url(#sp-blur)" opacity=".7">{BANDS.map((i) => <polygon key={i} points={`636,400 1260,${top + step * i} 1260,${top + step * (i + 1)}`} style={{ fill: `var(--spectrum-${i + 1})` }} />)}</g>
          {BANDS.map((i) => <polygon key={i} className="band" points={`640,400 1260,${top + step * i + 2} 1260,${top + step * (i + 1) - 2}`} style={{ fill: `var(--spectrum-${i + 1})`, animationDelay: `${1.15 + i * 0.05}s` }} />)}
        </g>
        <line className="sp-beam glow" x1="-20" y1="470" x2="570" y2="404" filter="url(#sp-glow)" />
        <line className="sp-beam" x1="-20" y1="470" x2="570" y2="404" />
      </svg>
      <div className="sp-gem"><span className="sp-halo" /><img src="/brand/prism-256.png" alt="" width={128} height={128} /></div>
      <div className="sp-word"><b>Prism</b><span>칼바람 아수라장 · 증바람 모임</span></div>
      <div className="sp-note"><span className="sp-dots"><i /><i /><i /></span>{note}</div>
    </div>
  );
}
