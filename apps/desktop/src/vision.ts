/** 게임 중 자동 인식된 증강 (Rust 가 "augments" 이벤트로 보낸다). 앱 안에서만 동작 */
import { useEffect, useState } from 'react';
import { bridge, type VisionState } from './bridge';

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

/** 자동 인식이 지금 어디까지 왔는지 사람 말로 (설정·게임 화면) */
export function visionStatus(v: { settings: { enabled: boolean }; report: { engine: string; stage?: string; hits?: number } } | null): { text: string; tone: 'ok' | 'warn' | 'bad' | 'muted' } {
  if (!v) return { text: '', tone: 'muted' };
  const r = v.report;
  if (r.engine === 'no-korean') return { text: '이 PC 에 한국어 문자 인식이 없어요. Windows 설정 → 시간 및 언어 → 언어에서 한국어를 추가해 주세요.', tone: 'bad' };
  if (r.engine === 'unsupported') return { text: '이 환경에서는 쓸 수 없어요.', tone: 'muted' };
  if (!v.settings.enabled || r.stage === 'off') return { text: '꺼져 있어요. 설정에서 켤 수 있어요.', tone: 'muted' };
  switch (r.stage) {
    case 'wait': return { text: '로그인·동의가 끝나야 시작해요.', tone: 'warn' };
    case 'no-game': return { text: '게임 창을 기다리는 중', tone: 'muted' };
    case 'back': return { text: '게임 창이 맨 앞에 있을 때 읽어요 (지금은 다른 창이 앞에 있어요)', tone: 'muted' };
    case 'capture': return { text: '게임 화면을 복사하지 못했어요. 롤을 "테두리 없는 창 모드"로 바꿔 주세요.', tone: 'bad' };
    case 'reading': return { text: r.hits ? `증강 ${r.hits}개만 읽혔어요. 카드가 다 보이면 다시 읽어요` : '게임 화면을 읽는 중 · 증강 카드가 뜨면 바로 알아봐요', tone: 'ok' };
    case 'found': return { text: '증강 카드를 알아봤어요', tone: 'ok' };
    default: return { text: '준비 중', tone: 'muted' };
  }
}

/** 자동 인식 상태를 몇 초마다 (앱 안에서만) */
export function useVisionState(every = 2000): VisionState | null {
  const [v, setV] = useState<VisionState | null>(null);
  useEffect(() => {
    if (!inTauri) return;
    let on = true;
    const load = () => bridge.visionGet().then((x) => on && setV(x)).catch(() => {});
    load();
    const t = setInterval(load, every);
    return () => { on = false; clearInterval(t); };
  }, [every]);
  return v;
}
