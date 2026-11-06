/**
 * 다음 화면 그림(requestAnimationFrame) — 단, rAF 만 믿지 않는다.
 * 게임 중에 켠 앱 창은 WebView 가 '안 보이는 창'으로 잡혀 rAF 가 멈출 수 있다 (1.0.50 제보: 메뉴가 안 눌림).
 * rAF 가 50ms 안에 안 오면 타이머로 대신 부른다. 숫자 차오름·결제 링처럼 rAF 로 이어 가는 움직임은 이걸 쓴다.
 */
const live = new Map<number, () => void>();
let seq = 0;
export function nextFrame(cb: (t: number) => void): number {
  const id = ++seq;
  let done = false;
  const run = (t: number) => { if (done) return; done = true; live.delete(id); cb(t); };
  const r = requestAnimationFrame(run);
  const tm = setTimeout(() => run(performance.now()), 50);
  live.set(id, () => { done = true; cancelAnimationFrame(r); clearTimeout(tm); });
  return id;
}
export function cancelFrame(id: number) { live.get(id)?.(); live.delete(id); }
