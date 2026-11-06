/**
 * 홈 배경 그림 (v3.177). 홈이 고른 오늘의 챔프 그림을 앱 껍데기가 늘 그려 두고,
 * 홈에 들어오고 나갈 때 서서히 나타나고 사라지게 한다 — 예전엔 홈 화면과 함께 그림이 통째로 붙었다 떨어져
 * 메뉴를 옮기면 배경이 '냅다' 바뀌었다.
 */
import { useSyncExternalStore } from 'react';

let src = '';
const subs = new Set<() => void>();
export function setHomeBg(next: string) {
  if (!next || next === src) return;
  src = next;
  subs.forEach((f) => f());
}
export function useHomeBg(): string {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => src);
}
