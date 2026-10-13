/**
 * 앱 업데이트 상태. 켜질 때와 6시간마다 확인하고, 사용자가 버튼을 누를 때만 설치한다.
 * 설치를 누르면 새 버전을 받아 설치 프로그램이 앱을 닫고 설치한 뒤 다시 켠다.
 */
import { useSyncExternalStore } from 'react';
import { bridge, type UpdateInfo } from './bridge';

const EVERY = 6 * 3600_000;
type U = { info: UpdateInfo | null; checking: boolean; installing: boolean; error: string | null };
let u: U = { info: null, checking: false, installing: false, error: null };
const subs = new Set<() => void>();
const set = (p: Partial<U>) => { u = { ...u, ...p }; subs.forEach((f) => f()); };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function checkUpdate() {
  if (u.checking || u.installing) return;
  set({ checking: true, error: null });
  try { set({ info: await bridge.updateCheck() }); }
  catch (e) { set({ error: msg(e) }); }
  finally { set({ checking: false }); }
}

export async function installUpdate() {
  if (u.installing) return;
  set({ installing: true, error: null });
  try { await bridge.updateInstall(); } // 성공하면 앱이 곧 꺼진다
  catch (e) { set({ installing: false, error: msg(e) }); }
}

let started = false;
export function startUpdates() {
  if (started) return;
  started = true;
  setTimeout(checkUpdate, 5_000); // 켜자마자 롤 확인과 겹치지 않게 조금 뒤에
  setInterval(checkUpdate, EVERY);
}

export const useUpdate = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => u);
