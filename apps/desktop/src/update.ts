/**
 * 앱 업데이트 (CLAUDE.md v3.33). 설치 창 없이 조용히.
 *  1) 켜질 때 · 30분마다 · 창을 다시 띄울 때(10분 넘게 지났으면) · 트레이 '업데이트 확인'으로 확인 → 새 버전이 있으면 뒤에서 미리 받아 둔다 (sha256 확인).
 *  2) 적용: 사용자가 '적용'을 누르거나, 창을 내려 둔 채(트레이) 롤 게임·챔프 선택이 아닐 때 자동으로.
 *     조용한 설치(/S)가 앱을 닫고 설치한 뒤 다시 켠다. 트레이에 있었으면 트레이로 다시 켜진다.
 *  3) 그 밖에는 앱을 끌 때(트레이 '종료')나 다음에 켤 때 적용된다 (Rust).
 * Microsoft Store 판(managed)은 스토어가 업데이트하므로 아무것도 하지 않는다.
 */
import { useSyncExternalStore } from 'react';
import { bridge, type UpdateInfo } from './bridge';
import { getState, windowOpen } from './controller';

const EVERY = 30 * 60_000;
/** 창을 다시 띄웠을 때, 마지막 확인이 이보다 오래됐으면 다시 확인 */
const STALE = 10 * 60_000;
let lastCheck = 0;
const IDLE_CHECK = 60_000;
type U = { info: UpdateInfo | null; checking: boolean; preparing: boolean; applying: boolean; error: string | null };
let u: U = { info: null, checking: false, preparing: false, applying: false, error: null };
const subs = new Set<() => void>();
const set = (p: Partial<U>) => { u = { ...u, ...p }; subs.forEach((f) => f()); };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 롤 게임·챔프 선택 중이면 적용하지 않는다 (앱이 잠깐 꺼지므로) */
const busy = () => { const s = getState().status; return s === 'in-game' || s === 'champ-select'; };

export async function checkUpdate() {
  if (u.checking || u.preparing || u.applying) return;
  set({ checking: true, error: null });
  lastCheck = Date.now();
  try {
    const info = await bridge.updateCheck();
    set({ info });
    if (info.available && !info.ready && !info.managed) void prepare();
  } catch (e) { set({ error: msg(e) }); }
  finally { set({ checking: false }); }
}

/** 새 버전을 뒤에서 받아 둔다 */
async function prepare() {
  if (u.preparing) return;
  set({ preparing: true, error: null });
  try { set({ info: await bridge.updatePrepare() }); }
  catch (e) { set({ error: msg(e) }); }
  finally { set({ preparing: false }); }
}

/** 받아 둔 새 버전을 적용 (앱이 몇 초 꺼졌다 다시 켜진다) */
export async function applyUpdate(background = false) {
  if (u.applying || !u.info?.ready) return;
  set({ applying: true, error: null });
  try { await bridge.updateApply(background); } // 성공하면 앱이 곧 꺼진다
  catch (e) { set({ applying: false, error: msg(e) }); }
}

let started = false;
export function startUpdates() {
  if (started) return;
  started = true;
  setTimeout(checkUpdate, 5_000); // 켜자마자 롤 확인과 겹치지 않게 조금 뒤에
  setInterval(checkUpdate, EVERY);
  // 트레이에서 다시 열거나 창으로 돌아오면, 오래됐을 때만 다시 확인
  addEventListener('focus', () => { if (Date.now() - lastCheck > STALE) void checkUpdate(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - lastCheck > STALE) void checkUpdate(); });
  // 창을 내려 둔 채 쉬고 있으면 조용히 적용 (트레이로 다시 켜진다)
  setInterval(async () => {
    if (!u.info?.ready || u.applying || busy()) return;
    if (!(await windowOpen())) void applyUpdate(true);
  }, IDLE_CHECK);
}

export const useUpdate = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => u);
