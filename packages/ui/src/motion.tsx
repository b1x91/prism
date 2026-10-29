/**
 * 상호작용 전환 (CLAUDE.md v3.121). 누른 뒤 '처리 중 → 완료 → 자연스럽게 빠지기'를 한 흐름으로.
 * 예전엔 처리 중 표시가 서버 목록을 다시 받기 전에 풀려, 원래 단추로 돌아갔다가 항목이 툭 사라졌다.
 * - useResolve: 처리 → 완료 표시(0.7초) → 흐려지며 빠짐 → 남은 항목이 미끄러져 자리를 메움(useFlip) → 새 목록. 새 목록이 올 때까지 빠진 항목은 다시 보이지 않는다.
 * - ActBtn: 세 상태 글자를 같은 칸에 겹쳐 두어 폭이 흔들리지 않고 글자만 겹쳐 바뀐다.
 * - collapseOut: 하나만 빠지는 카드·줄은 높이를 접으며 사라진다.
 * 동작 줄이기면 모두 바로.
 */
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';

export const motionOff = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, motionOff() ? 0 : ms));
const EASE = 'cubic-bezier(.16, 1, .3, 1)';

export type ActState = 'busy' | 'done' | 'out' | undefined;

/** 목록 항목 처리 흐름. reload 는 새 목록을 다 받은 뒤 끝나는 약속을 돌려줘야 한다 (useLoad 의 reload). */
export function useResolve(reload: () => unknown) {
  const [st, setSt] = useState<Record<string, ActState>>({});
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const put = (id: string, v: ActState) => setSt((s) => { const n = { ...s }; if (v) n[id] = v; else delete n[id]; return n; });
  /** leave: false 면 항목이 남는다(값만 바뀜) — 새 목록을 받을 때까지 처리 중으로 둔다 */
  const run = useCallback(async (id: string, f: () => Promise<unknown>, leave = true) => {
    put(id, 'busy');
    try { await f(); } catch (e) { put(id, undefined); throw e; }
    if (!leave) { try { await reload(); } finally { put(id, undefined); } return; }
    put(id, 'done'); await pause(700);
    put(id, 'out'); await pause(240);
    setGone((g) => new Set(g).add(id));
    try { await reload(); } finally {
      put(id, undefined);
      setGone((g) => { const n = new Set(g); n.delete(id); return n; });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- put 은 setState 만 쓴다
  }, [reload]);
  return { state: (id: string) => st[id], gone: (id: string) => gone.has(id), run };
}

/** 항목 클래스: 완료(옅은 초록) · 빠지는 중(흐려지며 살짝 줄어듦) */
export const actCls = (s: ActState) => `mo-item ${s === 'done' ? 'mo-done' : s === 'out' ? 'mo-done mo-out' : ''}`;

/**
 * 담는 칸의 자식(data-flip="키")이 빠지거나 끼면 나머지가 원래 자리에서 새 자리로 미끄러진다.
 * 칸 높이가 줄면 그것도 부드럽게. keys 는 지금 보이는 키를 이은 문자열.
 */
export function useFlip<T extends HTMLElement>(keys: string) {
  const ref = useRef<T>(null);
  const prev = useRef<{ pos: Map<string, [number, number]>; h: number } | null>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) { prev.current = null; return; }
    const b = box.getBoundingClientRect();
    const kids = [...box.children].filter((k): k is HTMLElement => k instanceof HTMLElement && Boolean(k.dataset.flip));
    const pos = new Map(kids.map((k) => { const r = k.getBoundingClientRect(); return [k.dataset.flip!, [r.left - b.left, r.top - b.top] as [number, number]]; }));
    const was = prev.current;
    if (was && !motionOff()) {
      for (const k of kids) {
        const a = was.pos.get(k.dataset.flip!), n = pos.get(k.dataset.flip!)!;
        if (!a) { k.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE }); continue; }
        const dx = a[0] - n[0], dy = a[1] - n[1];
        if (dx || dy) k.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 440, easing: EASE });
      }
      if (b.height < was.h - 1) box.animate([{ height: `${was.h}px` }, { height: `${b.height}px` }], { duration: 440, easing: EASE });
    }
    prev.current = { pos, h: b.height };
  }, [keys]);
  return ref;
}

/** 하나만 빠지는 카드·줄: 높이를 접으며 사라진다 (끝나면 약속이 풀림) */
export function collapseOut(el: HTMLElement | null, ms = 360): Promise<void> {
  if (!el || motionOff()) return Promise.resolve();
  const cs = getComputedStyle(el);
  el.style.overflow = 'hidden';
  const a = el.animate([
    { height: `${el.offsetHeight}px`, opacity: 1, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, marginBottom: cs.marginBottom },
    { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px' },
  ], { duration: ms, easing: EASE, fill: 'forwards' });
  return a.finished.then(() => undefined, () => undefined);
}

/** 처리 단추: 기본 → 처리 중(도는 표시) → 완료(초록 + 체크). 세 글자를 겹쳐 두어 폭이 그대로다. */
export function ActBtn({ state, label, busy = '처리 중', done = '완료', className = 'btn primary', disabled, onClick }: {
  state: ActState; label: ReactNode; busy?: ReactNode; done?: ReactNode; className?: string; disabled?: boolean; onClick: () => void;
}) {
  const ph = state === 'out' ? 'done' : state ?? 'idle';
  return (
    <button type="button" className={`${className} act-btn ${ph}`} disabled={disabled || Boolean(state)} aria-busy={ph === 'busy'} onClick={onClick}>
      <span className="act-stack" aria-live="polite">
        <span className={ph === 'idle' ? 'on' : ''} aria-hidden={ph !== 'idle'}>{label}</span>
        <span className={ph === 'busy' ? 'on' : ''} aria-hidden={ph !== 'busy'}><i className="act-spin" aria-hidden="true" />{busy}</span>
        <span className={ph === 'done' ? 'on' : ''} aria-hidden={ph !== 'done'}><Icon name="check" />{done}</span>
      </span>
    </button>
  );
}
