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
  // 게임 화면 오른쪽 위 모서리에 딱 붙는 프리즘 삼각형 (직각이 모서리). 면 셋 + 빛 모서리
  return (
    <svg className={`ov-corner ${found ? 'found' : ''}`} viewBox="0 0 28 28" aria-hidden="true">
      <defs>
        <linearGradient id="pc-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7b8cff" /><stop offset="1" stopColor="#b26bff" /></linearGradient>
        <linearGradient id="pc-b" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4fe0c8" /><stop offset="1" stopColor="#4a8cff" /></linearGradient>
        <linearGradient id="pc-c" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ff7ab8" /><stop offset="1" stopColor="#ffd36e" /></linearGradient>
      </defs>
      <path d="M0 0H28V28Z" fill="url(#pc-a)" />
      <path d="M12 0H28V16Z" fill="url(#pc-b)" />
      <path d="M20 0H28V8Z" fill="url(#pc-c)" />
      <path d="M0 0L28 28" stroke="rgba(255,255,255,.75)" strokeWidth="1.2" />
      <path d="M12 0L28 16M20 0L28 8" stroke="rgba(255,255,255,.45)" strokeWidth=".8" />
    </svg>
  );
}

lockdown();
createRoot(document.getElementById('root')!).render(<StrictMode><Badge /></StrictMode>);
