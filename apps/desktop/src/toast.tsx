/**
 * 화면 오른쪽 아래 작은 알림 (v3.40). 트레이 '업데이트 확인'처럼 창을 열지 않고 결과를 알릴 때.
 * Rust(toast.rs)가 위치·보이기·숨기기를 맡고, 여기서는 그리기와 들어오고 나가는 움직임만. 누르면 닫힌다
 * (할 일이 있는 알림은 Rust 가 닫으면서 그 일을 한다 — '준비 완료' 는 업데이트 적용, '업데이트 완료' 는 앱 열기).
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@prism/ui/styles.css';
import './overlay.css';
import { Gem, Icon } from '@prism/ui';
import { bridge, type ToastMsg } from './bridge';
import { lockdown } from './lockdown';

function Toast() {
  const [t, setT] = useState<ToastMsg | null>(null);
  const [out, setOut] = useState(false);
  useEffect(() => {
    let offs: (() => void)[] = [];
    bridge.toastGet().then((x) => x && setT(x)).catch(() => {});
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<ToastMsg>('toast', (e) => { setOut(false); setT(e.payload); }).then((f) => offs.push(f));
      listen('toast-out', () => setOut(true)).then((f) => offs.push(f));
    }).catch(() => {});
    return () => { offs.forEach((f) => f()); offs = []; };
  }, []);
  if (!t) return null;
  return (
    <button type="button" key={t.at} className={`tst k-${t.kind} ${out ? 'out' : ''}`} onClick={() => void bridge.toastClose()} aria-live="polite">
      <span className="tst-ic">{t.kind === 'busy' ? <i className="tst-spin" /> : t.kind === 'ok' ? <Icon name="check" /> : t.kind === 'warn' ? <b>!</b> : <Gem size={20} src="/brand/prism-32.png" />}</span>
      <span className="tst-tx"><b>{t.title}</b><small>{t.body}</small></span>
    </button>
  );
}

lockdown();
createRoot(document.getElementById('root')!).render(<StrictMode><Toast /></StrictMode>);
