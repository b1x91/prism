/**
 * 인터넷·서버 연결 상태 (v3.122). 서버 요청이 '연결 자체'에 실패하면 알리고, 하나라도 성공하면 되살아난 것으로 본다.
 * 화면(OfflineScreen)은 이걸 듣고 연결 안내를 띄운다. 서버가 오류로 답한 것(4xx·5xx)은 연결 문제가 아니므로 세지 않는다.
 */
import type { Api } from './api';

export type NetState = 'ok' | 'down';
let state: NetState = 'ok';
let fails = 0;
const subs = new Set<(s: NetState) => void>();
const set = (s: NetState) => { if (s !== state) { state = s; subs.forEach((f) => f(s)); } };

export const netState = () => state;
export function onNet(f: (s: NetState) => void): () => void { subs.add(f); return () => { subs.delete(f); }; }

/** 연결 자체가 안 된 오류인가 — 웹 fetch 실패 · 앱 Rust 중계의 '서버 연결 실패' (앱은 모든 오류가 상태 0 이라 글로 가른다) */
export function isNetError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return /서버 연결 실패|서버에 연결하지 못했|Failed to fetch|NetworkError|Load failed/i.test(m);
}

/** 요청 결과를 알린다. 잠깐 끊긴 것(한 번)으로는 안내를 띄우지 않고, 연달아 두 번 실패하면 끊긴 것으로 본다 */
export function reportNet(ok: boolean) {
  if (ok) { fails = 0; set('ok'); return; }
  fails += 1;
  if (fails >= 2) set('down');
}
/** 연결 확인(다시 시도)이 실패했을 때: 바로 끊긴 상태로 */
export function markDown() { fails = Math.max(fails, 2); set('down'); }

/** 서버 요청마다 연결 상태를 알리는 감싸개 */
export function withNet(api: Api): Api {
  const watch = <T>(p: Promise<T>) => p.then((v) => { reportNet(true); return v; }, (e) => { if (isNetError(e)) reportNet(false); else reportNet(true); throw e; });
  return { ...api, get: (p) => watch(api.get(p)), post: (p, b) => watch(api.post(p, b)), del: (p) => watch(api.del(p)) };
}
