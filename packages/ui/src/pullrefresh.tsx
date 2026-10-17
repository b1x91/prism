/**
 * 당겨서 새로고침 (v3.67, 앱·웹 모든 페이지). 맨 위에서 더 당기면(손가락으로 끌어내리기 · 마우스 휠을 위로) 위에 표시가 내려오고,
 * 충분히 당긴 뒤 놓으면 받아 둔 데이터를 지우고(api.forget) 화면을 새로 불러온다 — 이때만 자리표시가 다시 보인다.
 * 맨 위에 막 도착한 휠은 무시한다 (위로 스크롤하다 맨 위에 닿은 관성으로 새로고침되지 않게).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';

const FULL = 72;
/** 맨 위에 머문 지 이만큼 지나야 휠 당기기를 센다 */
const SETTLE = 350;

type Scroller = HTMLElement | Window;
const topOf = (el: Scroller) => (el instanceof Window ? el.scrollY : el.scrollTop);

export function PullRefresh({ scroller, onRefresh, children }: { scroller: () => Scroller | null; onRefresh: () => Promise<void> | void; children: (key: number) => ReactNode }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const [n, setN] = useState(0);
  const st = useRef({ pull: 0, y0: -1, topAt: 0, idle: 0 as ReturnType<typeof setTimeout> | 0, busy: false });

  useEffect(() => {
    const el = scroller();
    if (!el) return;
    const s = st.current;
    const set = (v: number) => { s.pull = Math.max(0, Math.min(FULL * 1.4, v)); setPull(s.pull); };
    const fire = async () => {
      if (s.busy) return;
      s.busy = true; setBusy(true); set(FULL * 0.8);
      const t0 = Date.now();
      try { await onRefresh(); } catch { /* 화면이 다시 불러오며 오류를 보인다 */ }
      setN((k) => k + 1);
      // 너무 빨리 끝나도 표시가 한 번은 보이게
      setTimeout(() => { s.busy = false; setBusy(false); set(0); }, Math.max(0, 500 - (Date.now() - t0)));
    };
    const release = () => { if (s.busy) return; if (s.pull >= FULL) void fire(); else set(0); };
    const onScroll = () => { if (topOf(el) > 0) { s.topAt = 0; if (!s.busy && s.pull) set(0); } else if (!s.topAt) s.topAt = Date.now(); };
    const onWheel = (e: WheelEvent) => {
      if (s.busy || e.deltaY >= 0 || topOf(el) > 0) { if (e.deltaY > 0 && s.pull && !s.busy) set(0); return; }
      if (!s.topAt) { s.topAt = Date.now(); return; }
      if (Date.now() - s.topAt < SETTLE) return;
      set(s.pull + Math.min(40, -e.deltaY) * 0.35);
      clearTimeout(s.idle);
      s.idle = setTimeout(release, 220);
    };
    const onStart = (e: TouchEvent) => { s.y0 = topOf(el) <= 0 && !s.busy ? e.touches[0].clientY : -1; };
    const onMove = (e: TouchEvent) => { if (s.y0 < 0) return; const dy = e.touches[0].clientY - s.y0; if (dy > 0 && topOf(el) <= 0) set(dy * 0.5); else if (s.pull) set(0); };
    const onEnd = () => { if (s.y0 >= 0) { s.y0 = -1; release(); } };
    s.topAt = topOf(el) <= 0 ? Date.now() : 0;
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel as EventListener, { passive: true });
    el.addEventListener('touchstart', onStart as EventListener, { passive: true });
    el.addEventListener('touchmove', onMove as EventListener, { passive: true });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      clearTimeout(s.idle);
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel as EventListener);
      el.removeEventListener('touchstart', onStart as EventListener);
      el.removeEventListener('touchmove', onMove as EventListener);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [scroller, onRefresh]);

  const ready = pull >= FULL;
  return (
    <>
      <div className={`ptr ${pull || busy ? 'on' : ''} ${ready && !busy ? 'ready' : ''} ${busy ? 'busy' : ''}`} style={{ ['--ptr' as string]: `${Math.min(1, pull / FULL)}` }} aria-live="polite">
        <span className="ptr-pill"><Icon name={busy ? 'refresh' : 'arrowDown'} /><span>{busy ? '새로 불러오는 중' : ready ? '놓으면 새로고침' : '당겨서 새로고침'}</span></span>
      </div>
      {children(n)}
    </>
  );
}
