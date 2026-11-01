/**
 * 앱 업데이트 단추 하나로: 받는 동안 단추 안에 진행 막대 → 다 받으면 '재시작' 단추로 바뀜 → 누르면 새 버전으로 다시 켜진다.
 * 사이드바와 설정이 같은 단추를 쓴다. 게임·챔프 선택 중에는 부르는 쪽이 숨긴다.
 */
import { useSyncExternalStore } from 'react';
import { getState, subscribe } from './controller';
import { applyUpdate, prepare, useUpdate } from './update';

export function UpdateButton({ className = '' }: { className?: string }) {
  const up = useUpdate();
  const status = useSyncExternalStore(subscribe, () => getState().status);
  const info = up.info;
  // 게임·챔프 선택 중에는 숨긴다 (적용하면 앱이 잠깐 꺼지므로). 끝나면 다시
  if (!info?.available || info.managed || status === 'in-game' || status === 'champ-select') return null;
  const pct = Math.round((up.progress ?? 0) * 100);
  const state = up.applying ? 'apply' : info.ready ? 'ready' : up.preparing ? 'dl' : 'get';
  const label = state === 'apply' ? '다시 켜는 중…'
    : state === 'ready' ? `재시작하고 v${info.latest} 적용`
    : state === 'dl' ? (up.progress == null ? `v${info.latest} 받는 중…` : `v${info.latest} 받는 중 ${pct}%`)
    : `v${info.latest} 받기`;
  const fill = state === 'dl' ? (up.progress ?? 0) : 1;
  const click = state === 'ready' ? () => void applyUpdate() : state === 'get' ? () => void prepare() : undefined;
  return (
    <button type="button" className={`upd-btn ${state} ${className}`} disabled={!click} onClick={click}
      title={up.error ?? undefined} aria-live="polite" style={{ ['--p' as string]: fill }}>
      <span className="upd-fill" aria-hidden="true" />
      <span className="upd-ic" aria-hidden="true">
        {state === 'ready'
          ? <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
          : state === 'apply' ? <i className="upd-spin" />
          : <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></svg>}
      </span>
      <span key={state} className="upd-t">{label}</span>
    </button>
  );
}
