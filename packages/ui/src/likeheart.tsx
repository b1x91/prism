// Lucian UX/UI Prompt #022 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#022
/**
 * 좋아요 하트 터짐 (CLAUDE.md v3.38). 챔프·증강의 '좋아요'(내 챔프·내 증강) 버튼.
 * 하트가 움츠렸다가 빨갛게 차오르며 크게 뛰고, 둘레로 고리와 작은 점들이 터진다.
 * 좋아요 수가 한 칸 굴러 올라가고, 다시 누르면 조용히 원래대로 돌아간다.
 * 원본(112px 버튼)의 모양·시간·곡선을 그대로 두고 크기만 --k 배율로 줄인다 (styles.css .u022).
 */
import { useEffect, useId, useRef, useState } from 'react';

const HEART = 'M26 45S5 33 5 18.5C5 11.6 10.4 7 16.4 7c4.3 0 7.6 2.3 9.6 5.6C28 9.3 31.3 7 35.6 7 41.6 7 47 11.6 47 18.5 47 33 26 45 26 45z';
const DOTS: [number, string, string][] = [
  [0, '#FF4D6D', '#FFB26B'], [51, '#8B6CFF', '#FF7A93'], [103, '#FFB547', '#22C3A6'], [154, '#FF4D6D', '#8B6CFF'],
  [206, '#22C3A6', '#FFB547'], [257, '#FF7A93', '#3D8BFF'], [309, '#3D8BFF', '#FF4D6D'],
];

/** 작은 하트 그림 (목록 칸의 표시용) */
export function HeartIcon({ size = 14 }: { size?: number }) {
  return <svg className="heart-ic" width={size} height={size} viewBox="0 0 52 52" aria-hidden="true"><path d={HEART} fill="currentColor" /></svg>;
}

/** 숫자가 한 칸 굴러 바뀐다 (늘면 위로, 줄면 아래로) */
function Roll({ n }: { n: number }) {
  const [view, setView] = useState({ cur: n, prev: null as number | null, up: true, k: 0 });
  const last = useRef(n);
  useEffect(() => {
    if (n === last.current) return;
    setView((v) => ({ cur: n, prev: last.current, up: n > last.current, k: v.k + 1 }));
    last.current = n;
  }, [n]);
  return (
    <span className="u022-roll" aria-live="polite">
      <span key={`c${view.k}`} className={view.prev === null ? '' : view.up ? 'in-up' : 'in-down'}>{view.cur}</span>
      {view.prev !== null && <span key={`p${view.k}`} className={view.up ? 'out-up' : 'out-down'} aria-hidden="true">{view.prev}</span>}
    </span>
  );
}

export function HeartBurst({ on, count, label, size = 'md', onToggle }: {
  on: boolean; count?: number | null; label: string; size?: 'sm' | 'md'; onToggle: () => void;
}) {
  const gid = `u022-g-${useId().replace(/:/g, '')}`;
  const [pop, setPop] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  const click = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setPop(false); clearTimeout(t.current);
    // 좋아요를 누를 때만 터진다. 취소는 조용히 돌아간다 (동작 줄이기면 터지지 않는다)
    if (!on && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      requestAnimationFrame(() => { setPop(true); t.current = setTimeout(() => setPop(false), 900); });
    }
    onToggle();
  };
  return (
    <span className={`u022 ${size === 'sm' ? 'u022-sm' : ''} ${on ? 'is-on' : ''} ${pop ? 'is-pop' : ''}`}>
      <button className="u022-btn" type="button" aria-pressed={on} aria-label={label} title={label} onClick={click}>
        <span className="u022-ring" aria-hidden="true" />
        {DOTS.map(([a, c, c2]) => <span key={a} className="u022-dot" style={{ '--a': `${a}deg`, '--c': c, '--c2': c2 } as React.CSSProperties} aria-hidden="true"><i /><i /></span>)}
        <span className="u022-heart" aria-hidden="true">
          <svg viewBox="0 0 52 52">
            <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FF7A93" /><stop offset="1" stopColor="#F0264D" /></linearGradient></defs>
            <path className="u022-f" d={HEART} style={{ fill: `url(#${gid})` }} />
            <path className="u022-o" d={HEART} style={on ? { stroke: 'transparent' } : undefined} />
          </svg>
        </span>
      </button>
      {count != null && <span className="u022-meta"><Roll n={count} /></span>}
    </span>
  );
}
