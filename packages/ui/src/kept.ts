/**
 * 화면을 떠났다 돌아와도 그대로인 상태 (v3.102). 목록의 검색어·거르기 칩·정렬·탭처럼 사용자가 걸어 둔 것은
 * 상세로 갔다가 뒤로 와도, 메뉴를 옮겼다 와도 유지한다 — 왔다 갔다 비교하고, 실수로 뒤로 눌러도 다시 돌아오게.
 * 이번 실행(탭) 동안만 기억한다 (sessionStorage + 메모리). 앱·웹 공통.
 */
import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';

const mem = new Map<string, unknown>();
const KEY = (k: string) => `prism-kept:${k}`;

function read<T>(key: string, init: T): T {
  if (mem.has(key)) return mem.get(key) as T;
  try {
    const s = sessionStorage.getItem(KEY(key));
    if (s != null) { const v = JSON.parse(s) as T; mem.set(key, v); return v; }
  } catch { /* 저장 막힘 */ }
  return init;
}

/** useState 와 같게 쓰고, key 가 같으면 화면을 다시 열어도 마지막 값으로 시작한다 */
export function useKept<T>(key: string, init: T): [T, (v: SetStateAction<T>) => void] {
  const [v, setV] = useState<T>(() => read(key, init));
  const cur = useRef(v);
  cur.current = v;
  const set = useCallback((x: SetStateAction<T>) => {
    const next = typeof x === 'function' ? (x as (p: T) => T)(cur.current) : x;
    cur.current = next;
    mem.set(key, next);
    try { sessionStorage.setItem(KEY(key), JSON.stringify(next)); } catch { /* 저장 막힘 */ }
    setV(next);
  }, [key]);
  return [v, set];
}

/**
 * 뒤로 가면 그 화면을 보던 위치로 (v3.102). 화면마다(주소) 스크롤 위치를 기억해 두고,
 * 뒤로·앞으로(POP)로 돌아왔을 때만 되돌린다. 새로 들어가면(PUSH) 맨 위.
 * 목록이 그려지는 동안 높이가 모자라면 잠깐(최대 1초) 기다렸다 맞춘다.
 */
const scrolls = new Map<string, number>();
export function useScrollKeeper(path: string, pop: boolean, scroller: () => HTMLElement | Window | null) {
  useEffect(() => {
    const el = scroller();
    if (!el) return;
    const top = () => (el instanceof Window ? el.scrollY : el.scrollTop);
    const height = () => (el instanceof Window ? document.documentElement.scrollHeight - innerHeight : el.scrollHeight - el.clientHeight);
    const go = (y: number) => el.scrollTo({ top: y });
    const want = pop ? scrolls.get(path) ?? 0 : 0;
    let raf = 0;
    const t0 = performance.now();
    const fit = () => {
      if (height() >= want - 2 || performance.now() - t0 > 1000) { go(want); return; }
      go(want);
      raf = requestAnimationFrame(fit);
    };
    fit();
    const save = () => { scrolls.set(path, top()); };
    el.addEventListener('scroll', save, { passive: true });
    // 떠날 때 다시 읽지 않는다: 새 화면이 이미 그려져 높이가 줄면 위치가 잘려 있다
    return () => { cancelAnimationFrame(raf); el.removeEventListener('scroll', save); };
  }, [path, pop, scroller]);
}

/** 화면 안 '뒤로' 단추: 앱 안에서 온 곳이 있으면 진짜 뒤로(필터·위치가 그대로), 없으면 목록으로 */
export function goBack(nav: ((to: string) => unknown) & ((delta: number) => unknown), fallback: string) {
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  if (idx > 0) nav(-1); else nav(fallback);
}
