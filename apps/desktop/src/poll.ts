/**
 * 창을 보고 있을 때만 주기적으로 확인하기 (v3.68, 게임 중 부담 줄이기). 창이 트레이에 있거나 포커스를 잃으면(게임 중) 건너뛰고,
 * 다시 보면 바로 한 번 확인한다. 끄는 함수를 돌려준다.
 */
export function pollWhileShown(check: () => void, every: number): () => void {
  const shown = () => document.visibilityState === 'visible' && document.hasFocus();
  check();
  const t = setInterval(() => { if (shown()) check(); }, every);
  const back = () => { if (shown()) check(); };
  window.addEventListener('focus', back);
  document.addEventListener('visibilitychange', back);
  return () => { clearInterval(t); window.removeEventListener('focus', back); document.removeEventListener('visibilitychange', back); };
}
