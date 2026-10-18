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
