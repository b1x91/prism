/**
 * 연결이 끊겼을 때 (v3.122). 인터넷이 끊기거나 Prism 서버에 닿지 않으면 화면 전체에 안내를 띄운다.
 * - '새로고침'은 페이지를 다시 읽지 않는다 (인터넷이 없으면 브라우저 오류 화면이 뜨므로) — 서버에 닿는지 확인하고, 닿으면 데이터를 새로 받는다.
 * - 떠 있는 동안 5초마다 조용히 확인하고, 연결되면 저절로 닫히며 화면을 새로 불러온다.
 * - 브라우저가 '인터넷 없음'을 알려 주면 바로, 서버 요청이 연달아 실패하면(withNet) 뜬다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { emitPullRefresh, markDown, netState, onNet, type Api } from '@prism/core';
import { Icon } from './icons';

const RETRY_MS = 5000;
const osOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export function OfflineScreen({ api, onBack, hold = false }: { api: Api; /** 연결이 돌아왔을 때 (내 정보 다시 받기 등) */ onBack?: () => void; /** 잠시 띄우지 않기 — 앱의 챔프 선택·게임 중 (그때 쓰는 증강 가이드는 인터넷 없이도 돌아간다) */ hold?: boolean }) {
  const [down, setDown] = useState(() => netState() === 'down' || osOffline());
  const [noNet, setNoNet] = useState(osOffline);
  const [checking, setChecking] = useState(false);
  const [miss, setMiss] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const busy = useRef(false);

  const recover = useCallback(() => {
    // 서서히 걷히고 나서 화면을 새로 불러온다
    setLeaving(true);
    window.setTimeout(() => { setDown(false); setNoNet(false); setLeaving(false); setMiss(0); api.forget?.(); emitPullRefresh(); onBack?.(); }, 320);
  }, [api, onBack]);

  const check = useCallback(async (manual: boolean) => {
    if (busy.current) return;
    busy.current = true;
    if (manual) setChecking(true);
    const t0 = Date.now();
    let ok = false;
    try { await api.get('/links'); ok = true; } catch { markDown(); }
    // 눌렀을 때는 확인하는 모습이 한 번은 보이게
    if (manual) await new Promise((r) => setTimeout(r, Math.max(0, 700 - (Date.now() - t0))));
    busy.current = false;
    if (manual) setChecking(false);
    if (ok) recover(); else if (manual) setMiss((m) => m + 1);
  }, [api, recover]);

  useEffect(() => {
    const off = onNet((s) => { if (s === 'down') setDown(true); });
    const goOff = () => { setNoNet(true); setDown(true); };
    const goOn = () => { setNoNet(false); void check(false); };
    addEventListener('offline', goOff);
    addEventListener('online', goOn);
    return () => { off(); removeEventListener('offline', goOff); removeEventListener('online', goOn); };
  }, [check]);

  // 떠 있는 동안 조용히 다시 확인
  useEffect(() => {
    if (!down) return;
    const t = window.setInterval(() => { if (!osOffline()) void check(false); }, RETRY_MS);
    return () => window.clearInterval(t);
  }, [down, check]);

  // 떠 있는 동안 뒤 화면은 스크롤되지 않게
  useEffect(() => {
    if (!down || hold) return;
    const html = document.documentElement, was = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => { html.style.overflow = was; };
  }, [down, hold]);

  if (!down || hold) return null;
  const internet = noNet || osOffline();
  return createPortal(
    <div className={`offl ${leaving ? 'out' : ''}`} role="alertdialog" aria-modal="true" aria-labelledby="offl-t" aria-describedby="offl-d">
      <div className="offl-box">
        <span className={`offl-ill ${checking ? 'scan' : ''} ${internet ? 'net' : 'srv'}`} aria-hidden="true">
          <svg viewBox="0 0 64 64" width="64" height="64">
            <path className="a3" d="M8 26a34 34 0 0 1 48 0" />
            <path className="a2" d="M16 34a23 23 0 0 1 32 0" />
            <path className="a1" d="M24 42a12 12 0 0 1 16 0" />
            <circle className="dot" cx="32" cy="50" r="3.2" />
            <path className="slash" d="M14 14 50 52" />
          </svg>
        </span>
        <h2 id="offl-t">{internet ? '인터넷 연결이 끊겼어요' : 'Prism 서버에 연결할 수 없어요'}</h2>
        <p id="offl-d">{internet ? '와이파이나 랜선을 확인한 뒤 새로고침을 눌러 주세요.' : '잠시 뒤에 다시 시도해 주세요.'}<br />연결되면 저절로 다시 불러와요.</p>
        <button type="button" className={`btn primary lg offl-go ${miss > 0 ? 'nudge' : ''}`} key={miss} disabled={checking} onClick={() => void check(true)}>
          <span className="act-stack">
            <span className={checking ? '' : 'on'} aria-hidden={checking}><Icon name="refresh" />새로고침</span>
            <span className={checking ? 'on' : ''} aria-hidden={!checking}><i className="act-spin" aria-hidden="true" />연결 확인 중</span>
          </span>
        </button>
        <span className="offl-miss meta" aria-live="polite">{miss > 0 && !checking ? '아직 연결되지 않았어요. 연결되면 바로 열려요.' : '\u00a0'}</span>
      </div>
    </div>,
    document.body,
  );
}
