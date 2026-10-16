/**
 * 내 챔프 · 내 증강 (CLAUDE.md v3.27). 하트(좋아요)를 눌러 좋아하는 챔프·증강을 표시한다 (v3.38 하트 터짐).
 * 서버(/api/me/favs)가 진실이고, 이 기기에도 localStorage `prism-favs` 로 남겨
 * 로그인 전·게임 위 작은 창에서도 바로 읽을 수 있게 한다.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { HeartBurst, HeartIcon } from './likeheart';
import type { Api } from '@prism/core';

export type FavKind = 'champ' | 'aug';
type Favs = { champs: number[]; augs: number[] };

const KEY = 'prism-favs';
const read = (): Favs => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? '') as Favs; if (Array.isArray(v.champs) && Array.isArray(v.augs)) return v; } catch { /* 없음 */ } return { champs: [], augs: [] }; };
let state: Favs = read();
let api: Api | null = null;
const subs = new Set<() => void>();
const set = (v: Favs) => { state = v; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* 저장 막힘 */ } subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };

/** 로그인되면 한 번 부른다 (서버 목록으로 맞춘다). 로그아웃이면 null */
export function connectFavs(a: Api | null) {
  api = a;
  if (a) a.get<Favs>('/api/me/favs').then(set).catch(() => {});
  subs.forEach((f) => f());
}

/** 다른 창(게임 위 작은 창)에서 바뀐 것을 따라간다 */
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === KEY) { state = read(); subs.forEach((f) => f()); } });

export function useFavs() {
  const v = useSyncExternalStore(subscribe, () => state);
  const connected = useSyncExternalStore(subscribe, () => api !== null);
  return {
    champs: v.champs, augs: v.augs, connected,
    has: (kind: FavKind, id: number) => (kind === 'champ' ? v.champs : v.augs).includes(id),
  };
}

export async function toggleFav(kind: FavKind, id: number) {
  const list = kind === 'champ' ? state.champs : state.augs;
  const on = !list.includes(id);
  const next = on ? [...list, id] : list.filter((x) => x !== id);
  const prev = state;
  set(kind === 'champ' ? { ...state, champs: next } : { ...state, augs: next }); // 바로 반영
  if (!api) return;
  try { set(await api.post<Favs>('/api/me/favs', { kind, id, on })); } catch { set(prev); }
}

/** 좋아요 하트 버튼 + 좋아한 회원 수 (로그인 전에는 숨긴다) */
export function FavStar({ kind, id, size = 'md' }: { kind: FavKind; id: number; size?: 'sm' | 'md' }) {
  const f = useFavs();
  const on = f.has(kind, id);
  const [count, setCount] = useState<number | null>(null);
  const [pending, setPending] = useState(true);
  useEffect(() => {
    setCount(null); setPending(true);
    if (!f.connected || !api) return;
    let live = true;
    api.get<{ n: number }>(`/api/favs/count?kind=${kind}&id=${id}`).then((r) => { if (live) setCount(r.n); }).catch(() => {}).finally(() => { if (live) setPending(false); });
    return () => { live = false; };
  }, [f.connected, kind, id]);
  if (!f.connected) return null;
  const what = kind === 'champ' ? '내 챔프' : '내 증강';
  const label = on ? `좋아요 취소 (${what}에서 빼기)` : `좋아요 (${what}로 표시)`;
  return <HeartBurst on={on} count={count} label={label} size={size} pending={pending} onToggle={() => { setCount((c) => (c == null ? c : Math.max(0, c + (on ? -1 : 1)))); void toggleFav(kind, id); }} />;
}

/** 작은 하트 표시 (목록 칸 구석, inline 이면 이름 옆) */
export function FavMark({ kind, id, inline }: { kind: FavKind; id: number; inline?: boolean }) {
  const f = useFavs();
  return f.has(kind, id) ? <span className={`fav-mark ${inline ? 'in' : ''}`} role="img" aria-label={kind === 'champ' ? '내 챔프' : '내 증강'}><HeartIcon size={inline ? 13 : 11} /></span> : null;
}
