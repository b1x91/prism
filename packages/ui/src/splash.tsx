/**
 * 큰 그림 갈아 끼우기 (v3.80): 챔프를 바꿔도 화면이 비거나 툭 바뀌지 않게.
 * 새 그림을 먼저 받아 풀어 둔 뒤(decode) 예전 그림 위에 겹쳐 서서히 나타내고, 다 나타나면 예전 그림을 치운다.
 * 받는 동안에는 예전 그림이 그대로 남는다. 빠르게 여러 번 바꾸면 마지막 것만 나타난다.
 * 층마다 같은 className 을 주므로 기존 그림 자리 CSS(.bg 등)를 그대로 쓴다.
 */
import { useEffect, useRef, useState } from 'react';
import { CHAMPIONS, cdragon } from '@prism/core';
import { imgIn } from './skeleton';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const decoded = new Set<string>();

/** 그림을 받아 풀어 둔다 (이미 했으면 바로) */
function ready(src: string): Promise<void> {
  if (decoded.has(src)) return Promise.resolve();
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  const done = () => { decoded.add(src); };
  return (img.decode ? img.decode() : new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); })).then(done, done);
}

/** 그림 여러 장을 받아 풀어 둔다 (다 되거나 limit ms 가 지나면 끝) — 화면을 보여 주기 전에 그림이 뒤늦게 튀어나오지 않게 */
export function preloadImages(srcs: string[], limit = 1500): Promise<void> {
  const all = Promise.all([...new Set(srcs.filter(Boolean))].map(ready)).then(() => undefined);
  return Promise.race([all, new Promise<void>((r) => setTimeout(r, limit))]);
}

/** 챔프 그림을 미리 받아 둔다 (챔프 선택의 대기석·팀 챔프 등) */
export function preloadSplash(ids: (number | null | undefined)[]) {
  for (const id of ids) { const s = id ? cdragon(CHAMPIONS[id]?.splash) : ''; if (s) void ready(s); }
}

/**
 * 챔프가 바뀌면 그 챔프의 큰 그림이 준비될 때까지 지금 화면(value)을 그대로 두었다가, 준비되면 글·그림을 한 번에 바꾼다 (v3.122).
 * 예전엔 이름·기록 글이 먼저 바뀌고 그림이 뒤늦게 바뀌어 어긋났다. 기다리는 동안은 pending — 화면은 살짝 어두워져 눌렀다는 걸 보인다.
 * 그림이 아주 늦어도(인터넷이 느릴 때) limit ms 뒤에는 바꾼다 (SplashSwap 이 예전 그림을 남겨 두므로 비지 않는다).
 */
export function useSplashHold<T>(id: number | null | undefined, value: T, limit = 4000): { value: T; pending: boolean; key: number | null } {
  const [shown, setShown] = useState<number | null>(id ?? null);
  const snap = useRef(value);
  const cur = id ?? null;
  const srcOf = (x: number | null) => (x ? cdragon(CHAMPIONS[x]?.splash) : '');
  // 이미 받아 둔 그림이면 기다릴 것 없이 이 렌더에서 바로 (한 프레임도 예전 화면을 보이지 않게)
  const instant = cur !== shown && (!srcOf(cur) || decoded.has(srcOf(cur)));
  if (instant) setShown(cur);
  if (cur === shown || instant) snap.current = value;
  useEffect(() => {
    if (cur === shown) return;
    let on = true;
    const go = () => { if (on) setShown(cur); };
    void ready(srcOf(cur)).then(go);
    const t = setTimeout(go, limit);
    return () => { on = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- srcOf 는 cur 로 정해진다
  }, [cur, shown, limit]);
  const now = cur === shown || instant;
  return { value: now ? value : snap.current, pending: !now, key: now ? cur : shown };
}

export function SplashSwap({ src, className = '' }: { src: string; className?: string }) {
  const seq = useRef(0);
  const [layers, setLayers] = useState<{ src: string; k: number; first?: boolean }[]>(() => (src ? [{ src, k: 0, first: true }] : []));
  useEffect(() => {
    if (!src || layers[layers.length - 1]?.src === src) return;
    let on = true;
    ready(src).then(() => {
      if (!on) return;
      const k = ++seq.current;
      // 동작 줄이기면 겹치지 않고 바로 바꾼다
      setLayers((ls) => (reduced() ? [{ src, k }] : [...ls.slice(-1), { src, k }]));
    });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  return (
    <>
      {layers.map((l, i) => {
        const top = i === layers.length - 1;
        // 첫 그림은 받아지면 서서히(img.fi), 바뀐 그림은 예전 그림 위에서 서서히(ss-in) — 다 나타나면 아래 층을 치운다
        return l.first
          ? <img key={l.k} className={`${className} fi`} {...imgIn} src={l.src} alt="" />
          : <img key={l.k} className={`${className} ss-in`} src={l.src} alt="" onAnimationEnd={top ? () => setLayers((ls) => ls.slice(-1)) : undefined} />;
      })}
    </>
  );
}
