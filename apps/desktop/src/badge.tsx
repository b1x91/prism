/**
 * 게임 화면 오른쪽 위 모서리의 프리즘 삼각형 (v3.19, v3.25). 자동 인식이 이 게임 화면을 보고 있다는 표시.
 * Rust 가 게임 창이 맨 앞일 때만 띄운다. 증강 카드를 알아본 동안은 더 밝게 빛난다.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@prism/ui/styles.css';
import './overlay.css';
import { bridge } from './bridge';
import { lockdown } from './lockdown';

function Badge() {
  const [found, setFound] = useState(false);
  useEffect(() => {
    let on = true;
    const load = () => bridge.visionGet().then((v) => on && setFound(v.report.stage === 'found')).catch(() => {});
    load();
    const t = setInterval(load, 700);
    return () => { on = false; clearInterval(t); };
  }, []);
  // 게임 화면 오른쪽 위 모서리에 딱 붙는 프리즘 삼각형: 로고 보석을 모서리에서 잘라 낸 모양.
  // 가운데 밝은 청록 면(테이블) + 둘레 세 면(자홍·주황·초록) + 흰 반짝임. 어떤 게임 화면 위에서도 보이게 바깥 빗변에 어두운 테두리
  return (
    <svg className={`ov-corner ${found ? 'found' : ''}`} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="pc-top" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5b3cff" /><stop offset=".5" stopColor="#c03cff" /><stop offset="1" stopColor="#ff3d8b" /></linearGradient>
        <linearGradient id="pc-right" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff5a3d" /><stop offset=".5" stopColor="#ff9f1a" /><stop offset="1" stopColor="#ffd84a" /></linearGradient>
        <linearGradient id="pc-hyp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2a5cff" /><stop offset=".55" stopColor="#12b5ff" /><stop offset="1" stopColor="#22e08f" /></linearGradient>
        <linearGradient id="pc-depth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".28" /></linearGradient>
        <radialGradient id="pc-table" cx=".72" cy=".28" r=".85"><stop offset="0" stopColor="#e6fbff" /><stop offset=".35" stopColor="#5ce1ff" /><stop offset="1" stopColor="#1e6bff" /></radialGradient>
        <linearGradient id="pc-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".85" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      <path d="M0 0H32V32Z" fill="#0b0f22" />
      <path d="M1.5 0H32L23.5 4.5H10.5Z" fill="url(#pc-top)" />
      <path d="M32 0V30.5L27.5 21.5V8.5Z" fill="url(#pc-right)" />
      <path d="M1.5 0L10.5 4.5 27.5 21.5 32 30.5Z" fill="url(#pc-hyp)" />
      <path d="M10.5 4.5H27.5V21.5Z" fill="url(#pc-table)" />
      {/* 면의 깊이: 테이블 쪽으로 살짝 어둡게 */}
      <path d="M1.5 0H32L23.5 4.5H10.5Z" fill="url(#pc-depth)" />
      <path d="M1.5 0L10.5 4.5 27.5 21.5 32 30.5Z" fill="#000" opacity=".12" />
      <path d="M10.5 4.5H27.5V21.5Z" fill="none" stroke="rgba(6,20,60,.45)" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M10.5 4.5H27.5V21.5Z M32 0L27.5 4.5" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth=".55" strokeLinejoin="round" />
      <path d="M16 4.5 27.5 4.5 27.5 16Z" fill="url(#pc-sheen)" opacity=".5" />
      {/* 반짝임: 네 갈래 별빛 */}
      <path d="M24.6 5.4 25.2 7.6 27.4 8.2 25.2 8.8 24.6 11 24 8.8 21.8 8.2 24 7.6Z" fill="#fff" />
      <path d="M0.6 0 31.4 30.8" stroke="rgba(8,10,24,.75)" strokeWidth="1.2" />
      {found && <path className="sweep" d="M10.5 4.5H27.5V21.5Z" fill="url(#pc-sheen)" />}
    </svg>
  );
}

lockdown();
createRoot(document.getElementById('root')!).render(<StrictMode><Badge /></StrictMode>);
