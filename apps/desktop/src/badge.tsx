/**
 * 게임 화면 오른쪽 위 구석의 작은 프리즘 (v3.19). 자동 인식이 이 게임 화면을 보고 있다는 표시.
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
  return <div className={`ov-badge ${found ? 'found' : ''}`}><img src="/brand/prism-64.png" alt="" /></div>;
}

lockdown();
createRoot(document.getElementById('root')!).render(<StrictMode><Badge /></StrictMode>);
