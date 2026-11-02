/**
 * 당겨서 새로고침 (v3.67, 앱·웹 모든 페이지). 맨 위에서 더 당기면(손가락으로 끌어내리기 · 마우스 휠을 위로) 위에 표시가 내려오고,
 * 충분히 당긴 뒤 놓으면 받아 둔 데이터를 지우고(api.forget) 화면을 새로 불러온다 — 이때만 자리표시가 다시 보인다.
 * PC 휠: 맨 위에 자리 잡은 뒤 휠이 한 번 쉬었다가 다시 위로 굴려야 시작한다 (트랙패드 관성·위로 스크롤하다 닿은 것으로 새로고침되지 않게).
 * 안쪽 스크롤 칸이 위로 더 갈 수 있으면 그 칸이 먼저, Ctrl+휠(확대)·가로 휠·이 화면 밖(창·드롭다운)은 세지 않는다.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';

const FULL = 72;
/** 맨 위에 머문 지 이만큼 지나야 휠 당기기를 센다 */
const SETTLE = 350;
/** 휠이 이만큼 쉬었다가 다시 시작해야 새 당기기로 본다 — 트랙패드 관성(16ms마다 이어짐)으로 시작되지 않게 */
const GAP = 180;
/** 당기는 중 휠이 이만큼 멈추면: 다 찼으면 새로고침, 덜 찼으면 되돌림 (마우스 휠을 천천히 굴려도 이어지게) */
const HOLD_READY = 240;
const HOLD_SHORT = 480;

type Scroller = HTMLElement | Window;
const topOf = (el: Scroller) => (el instanceof Window ? el.scrollY : el.scrollTop);
/** 휠 한 번의 세로 이동을 픽셀로 (줄·쪽 단위로 오는 브라우저도) */
const pxOf = (e: WheelEvent) => e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1);

/** target 에서 host 까지 올라가며 위로 더 스크롤할 수 있는 칸이 있는지 — 있으면 그 칸이 스크롤한다 */
function innerCanScrollUp(target: EventTarget | null, host: Element | null): boolean {
  for (let n = target instanceof Element ? target : null; n && n !== host && n !== document.documentElement; n = n.parentElement) {
    if (n.scrollTop > 0 && n.scrollHeight > n.clientHeight + 1) {
      const oy = getComputedStyle(n).overflowY;
      if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') return true;
    }
  }
  return false;
}

export function PullRefresh({ scroller, onRefresh, children }: { scroller: () => Scroller | null; onRefresh: () => Promise<void> | void; children: (key: number) => ReactNode }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const [wheel, setWheel] = useState(false);
  const [n, setN] = useState(0);
  const bar = useRef<HTMLDivElement>(null);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;
  const st = useRef({ pull: 0, y0: -1, topAt: 0, lastWheel: 0, pulling: false, idle: 0 as ReturnType<typeof setTimeout> | 0, busy: false });

  useEffect(() => {
    const el = scroller();
    if (!el) return;
    const s = st.current;
    // 이 화면 안에서 일어난 입력만 (웹은 창 전체가 스크롤러라 창(모달)·드롭다운이 body 에 붙어 있어도 걸러야 한다)
    const host = () => bar.current?.parentElement ?? null;
    const inside = (t: EventTarget | null) => { const h = host(); return !h || (t instanceof Node && h.contains(t)); };
    const set = (v: number) => { s.pull = Math.max(0, Math.min(FULL * 1.4, v)); setPull(s.pull); };
    const stop = () => { s.pulling = false; set(0); };
    const fire = async () => {
      if (s.busy) return;
      s.busy = true; s.pulling = false; setBusy(true); set(FULL * 0.8);
      const t0 = Date.now();
      try { await cb.current(); } catch { /* 화면이 다시 불러오며 오류를 보인다 */ }
      setN((k) => k + 1);
      // 너무 빨리 끝나도 표시가 한 번은 보이게
      setTimeout(() => { s.busy = false; setBusy(false); set(0); }, Math.max(0, 500 - (Date.now() - t0)));
    };
    const release = () => { if (s.busy) return; if (s.pull >= FULL) void fire(); else stop(); };
    const onScroll = () => { if (topOf(el) > 0) { s.topAt = 0; if (!s.busy && s.pull) stop(); } else if (!s.topAt) s.topAt = Date.now(); };
    const onWheel = (e: WheelEvent) => {
      const now = Date.now();
      const gap = now - s.lastWheel;
      s.lastWheel = now;
      if (s.busy || e.ctrlKey || e.metaKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const dy = pxOf(e);
      if (dy > 0 || topOf(el) > 0) { if (dy > 0 && s.pull) { clearTimeout(s.idle); stop(); } return; }
      if (dy === 0 || !inside(e.target) || innerCanScrollUp(e.target, host())) return;
      if (!s.pulling) {
        // 새로 시작하려면: 맨 위에 자리 잡은 뒤 + 휠이 한 번 쉬었다가 (관성으로 맨 위에 닿은 것은 세지 않는다)
        if (!s.topAt) { s.topAt = now; return; }
        if (now - s.topAt < SETTLE || gap < GAP) return;
        s.pulling = true; setWheel(true);
      }
      set(s.pull + Math.min(60, -dy) * 0.35);
      clearTimeout(s.idle);
      s.idle = setTimeout(release, s.pull >= FULL ? HOLD_READY : HOLD_SHORT);
    };
    const onStart = (e: TouchEvent) => { s.y0 = topOf(el) <= 0 && !s.busy && inside(e.target) && !innerCanScrollUp(e.target, host()) ? e.touches[0].clientY : -1; if (s.y0 >= 0) setWheel(false); };
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
  }, [scroller]);

  const ready = pull >= FULL;
  return (
    <>
      <div ref={bar} className={`ptr ${wheel ? 'wheel' : ''} ${pull || busy ? 'on' : ''} ${ready && !busy ? 'ready' : ''} ${busy ? 'busy' : ''}`} style={{ ['--ptr' as string]: `${Math.min(1, pull / FULL)}` }} aria-live="polite">
        <span className="ptr-pill"><Icon name={busy ? 'refresh' : 'arrowDown'} /><span>{busy ? '새로 불러오는 중' : ready ? '놓으면 새로고침' : '당겨서 새로고침'}</span></span>
      </div>
      {children(n)}
    </>
  );
}
