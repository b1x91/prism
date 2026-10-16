/**
 * 랭킹 점수 (CLAUDE.md v3.55). 승률을 판수만큼만 믿는다: 모든 회원에게 10승 10패를 미리 얹어 계산한다.
 * 판이 적으면 500점(50%) 쪽으로 당겨지고, 많이 하면서 잘 이기는 사람이 위로 간다.
 * 롤 MMR·티어가 아니라 Prism 기록으로만 만든 점수다. 숫자는 여기 한 곳.
 */
export const SCORE_PRIOR = 10;

export const rankScore = (w: number, n: number) => Math.round(((w + SCORE_PRIOR) / (n + 2 * SCORE_PRIOR)) * 1000);

/** 점수 순 (같으면 판수가 많은 쪽) */
export const byScore = <T extends { w: number; n: number }>(a: T, b: T) => rankScore(b.w, b.n) - rankScore(a.w, a.n) || b.n - a.n;

const KST = 9 * 3_600_000;

/** 시즌 = 분기 (KST). 1~3월 시즌 1 · 4~6월 시즌 2 · 7~9월 시즌 3 · 10~12월 시즌 4 */
export function seasonOf(t = Date.now()) {
  const k = new Date(t + KST);
  const y = k.getUTCFullYear(), q = Math.floor(k.getUTCMonth() / 3);
  const start = Date.UTC(y, q * 3, 1) - KST;
  const end = Date.UTC(y, q * 3 + 3, 1) - KST; // 다음 시즌 시작 (이 시각 직전까지)
  return { key: `${y}-S${q + 1}`, label: `${y} 시즌 ${q + 1}`, start, end };
}
