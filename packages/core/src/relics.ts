/**
 * 칼바람(아수라장) 힐팩 타이머 (2026-11-05 사용자 결정, 준비 중). 미니맵 위 네 자리에 다음 힐팩까지 남은 시간을 띄운다.
 * 시간은 게임 시계(라이브 클라이언트 데이터)로 세고, 먹었는지는 화면의 미니맵에서 그 자리 아이콘이 사라진 순간으로 안다
 * (미니맵 자리·모습은 관리자 계정이 모은 미니맵 자료로 확정한 뒤 붙인다).
 * 시간 출처: LoL Wiki Health Relic (바깥 1:45 · 안쪽 2:30 · 다시 생기기 90초). OP.GG 화면(0:40 에 가운데 1:05 · 양 끝 1:50)과도 맞다.
 * [검증필요] 아수라장에서 그대로인지 — 미니맵 자료의 게임 시각으로 확인.
 */

export type RelicSpot = 'mid-blue' | 'mid-red' | 'end-blue' | 'end-red';

/** 미니맵 대각선 위 네 자리: 가운데 둘(바깥 포탑 쪽, 먼저 생김) · 양 끝 둘(안쪽, 나중에 생김) */
export const RELIC_SPOTS: { id: RelicSpot; first: number }[] = [
  { id: 'mid-blue', first: 105 },
  { id: 'mid-red', first: 105 },
  { id: 'end-blue', first: 150 },
  { id: 'end-red', first: 150 },
];

/** 먹힌 뒤 다시 생기기까지(초) */
export const RELIC_RESPAWN = 90;

/** 한 자리의 상태: 다음에 생기는 게임 시각, 지금 있는지 */
export type RelicState = { id: RelicSpot; next: number; up: boolean };

/** 처음 상태 (게임 시작) */
export const relicStart = (): RelicState[] => RELIC_SPOTS.map((s) => ({ id: s.id, next: s.first, up: false }));

/** 게임 시각이 흐름에 따라: 생길 시각을 지났으면 '있음' */
export function relicTick(st: RelicState[], t: number): RelicState[] {
  return st.map((s) => (!s.up && t >= s.next ? { ...s, up: true } : s));
}

/** 그 자리 힐팩을 누가 먹었다 (미니맵에서 사라짐을 본 게임 시각) */
export function relicTaken(st: RelicState[], id: RelicSpot, t: number): RelicState[] {
  return st.map((s) => (s.id === id && s.up ? { id, up: false, next: t + RELIC_RESPAWN } : s));
}

/** 미니맵에 띄울 글자: 있으면 null(아이콘이 보이므로), 없으면 남은 시간 m:ss */
export function relicLabel(s: RelicState, t: number): string | null {
  if (s.up) return null;
  const left = Math.max(0, Math.ceil(s.next - t));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}
