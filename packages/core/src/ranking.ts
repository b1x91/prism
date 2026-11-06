/**
 * 예전 랭킹 점수 (CLAUDE.md v3.55) — 2026-11-06 부터 랭킹은 Prism 레이팅(rating.ts). 이 점수는 예전 서버·운영 화면 활동 지수에만 남는다.
 * 랭킹 점수 (CLAUDE.md v3.55). 승률을 판수만큼만 믿는다: 모든 회원에게 10승 10패를 미리 얹어 계산한다.
 * 판이 적으면 500점(50%) 쪽으로 당겨지고, 많이 하면서 잘 이기는 사람이 위로 간다.
 * 롤 MMR·티어가 아니라 Prism 기록으로만 만든 점수다. 숫자는 여기 한 곳.
 */
export const SCORE_PRIOR = 10;

export const rankScore = (w: number, n: number) => Math.round(((w + SCORE_PRIOR) / (n + 2 * SCORE_PRIOR)) * 1000);

/** 점수 순 (같으면 판수가 많은 쪽). 서버가 Prism 레이팅(rating.ts)을 보냈으면 그것으로, 예전 서버면 위 점수로 */
const sc = (r: { w: number; n: number; rating?: number | null }) => r.rating ?? rankScore(r.w, r.n);
export const byScore = <T extends { w: number; n: number; rating?: number | null }>(a: T, b: T) => sc(b) - sc(a) || b.n - a.n;

const KST = 9 * 3_600_000;

/** 시즌 = 분기 (KST). 1~3월 시즌 1 · 4~6월 시즌 2 · 7~9월 시즌 3 · 10~12월 시즌 4 */
export function seasonOf(t = Date.now()) {
  const k = new Date(t + KST);
  const y = k.getUTCFullYear(), q = Math.floor(k.getUTCMonth() / 3);
  const start = Date.UTC(y, q * 3, 1) - KST;
  const end = Date.UTC(y, q * 3 + 3, 1) - KST; // 다음 시즌 시작 (이 시각 직전까지)
  return { key: `${y}-S${q + 1}`, label: `${y} 시즌 ${q + 1}`, start, end };
}
