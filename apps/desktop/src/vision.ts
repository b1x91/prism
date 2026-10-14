/** 게임 중 자동 인식된 증강 (Rust 가 "augments" 이벤트로 보낸다). 앱 안에서만 동작 */
import { useEffect, useState } from 'react';

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export type Seen = { ids: number[]; at: number };

export function useSeenAugments(): Seen {
  const [seen, setSeen] = useState<Seen>({ ids: [], at: 0 });
  useEffect(() => {
    if (!inTauri) {
      // 개발 미리보기: ?demo=증강ID,증강ID,증강ID
      const d = new URLSearchParams(location.search).get('demo');
      if (d) setSeen({ ids: d.split(',').map(Number).filter(Boolean), at: Date.now() });
      return;
    }
    let off: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen }) => listen<Seen>('augments', (e) => setSeen(e.payload)).then((f) => { off = f; }));
    return () => off?.();
  }, []);
  return seen;
}

/** 챔프 선택 때 기억해 둔 내 챔피언 */
export const lastChampion = (): number | null => {
  try { return Number(JSON.parse(localStorage.getItem('prism-last-champion') ?? 'null')) || null; } catch { return null; }
};

/** 이번 판 조합 (메인 창이 localStorage 에 써 두면 작은 창이 읽는다) */
export function readMatchup(): { allies: number[]; enemies: number[] } | null {
  try {
    const m = JSON.parse(localStorage.getItem('prism-matchup') ?? 'null');
    // 한 판보다 오래된 조합은 쓰지 않는다
    return m && Date.now() - Number(m.at) < 90 * 60_000 ? { allies: m.allies ?? [], enemies: m.enemies ?? [] } : null;
  } catch { return null; }
}
