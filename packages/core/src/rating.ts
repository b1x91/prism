/**
 * Prism 레이팅 (2026-11-06 사용자 결정): 팀 게임용 실력 추정. OpenSkill 의 Weng-Lin Bradley-Terry 방식(공개 논문,
 * Xbox TrueSkill 과 같은 계열)을 그대로 구현했다 — 코드는 가져오지 않았다.
 *
 *  - 사람마다 실력 μ 와 불확실성 σ. 처음엔 모두 μ=25, σ=25/3.
 *  - 판이 끝나면 두 팀의 실력 합으로 '이길 확률'을 구하고, 결과와의 차이만큼 μ 를 옮긴다. 강한 팀을 이기면 많이,
 *    약한 팀에게 지면 많이 내려간다. 판이 쌓일수록 σ 가 줄어 한 판의 무게가 작아진다.
 *  - 그 판의 PRISM SCORE(같은 팀 다섯 명 안의 몫, mvp.ts)를 상한 있는 작은 보정으로 더한다 — 승패가 주인공.
 *  - 랭킹은 보수적 실력 μ − 2σ: 판이 적으면 σ 가 커서 저절로 깎인다 (17판 71% 가 104판 60% 를 이기지 않게).
 *  - 상대·팀원은 우리 기록 안에서 같은 사람을 다시 만나면 그 실력으로, 처음 보는 사람은 기본 실력으로 본다.
 *  - 시즌(분기)이 바뀌면 처음부터가 아니라 σ 만 다시 키운다 — 실력은 잇고 새 시즌 결과가 빨리 반영된다.
 *  롤 MMR·티어가 아니라 Prism 기록으로만 만든 숫자다 (15절과 충돌 없음). 숫자는 RATING 한 곳.
 */
import { rankScore, seasonOf } from './ranking';

export const RATING = {
  mu: 25,
  sigma: 25 / 3,
  /** 한 판 결과의 흔들림 (σ0/2) */
  beta: 25 / 6,
  /** 판마다 σ 가 조금씩 다시 커진다 (실력은 변하므로) */
  tau: 25 / 300,
  kappa: 0.0001,
  /** 시즌이 바뀌면 σ² 에 더하는 값의 σ */
  seasonSigma: 25 / 3 * 0.35,
  /**
   * PRISM SCORE 보정: 이 사람의 '결과'를 승패(1/0)에 (점수 − 5) / 10 × perf 만큼 더해 본다. PRISM SCORE 는 팀 평균이 5 라
   * 팀 전체의 변화는 그대로이고 팀 안에서만 나눠 갖는다 — 쌓이며 부풀지 않고, σ 가 줄수록 함께 작아진다.
   */
  perf: 0.15,
  /** 보수적 실력 = μ − k·σ */
  k: 2,
  /** 화면 숫자 = base + scale × (μ − kσ) */
  base: 1000,
  scale: 40,
};

export type Skill = { mu: number; sigma: number; n: number; w: number; season?: string };
export const newSkill = (): Skill => ({ mu: RATING.mu, sigma: RATING.sigma, n: 0, w: 0 });

/** 화면에 보이는 Prism 레이팅 */
export const ratingOf = (s: { mu: number; sigma: number } | null | undefined) =>
  Math.round(RATING.base + RATING.scale * ((s?.mu ?? RATING.mu) - RATING.k * (s?.sigma ?? RATING.sigma)));

export type RatedPlayer = { key: string; teamId: number; win: boolean; score?: number | null };
export type RatedGame = { playedAt: number; players: RatedPlayer[] };

/**
 * 한 판으로 갱신. 열쇠가 없는 사람(이름을 모르는 자리)은 그 판만 기본 실력으로 끼운다.
 * 팀이 정확히 둘이 아니면 건너뛴다.
 */
export function rateGame(book: Map<string, Skill>, g: RatedGame) {
  const season = seasonOf(g.playedAt).key;
  const teams = new Map<number, { p: RatedPlayer; s: Skill }[]>();
  for (const p of g.players) {
    let s = p.key ? book.get(p.key) : undefined;
    if (!s) { s = newSkill(); if (p.key) book.set(p.key, s); }
    if (s.season && s.season !== season) s.sigma = Math.min(RATING.sigma, Math.sqrt(s.sigma ** 2 + RATING.seasonSigma ** 2));
    s.season = season;
    s.sigma = Math.min(RATING.sigma, Math.sqrt(s.sigma ** 2 + RATING.tau ** 2));
    (teams.get(p.teamId) ?? teams.set(p.teamId, []).get(p.teamId)!).push({ p, s });
  }
  if (teams.size !== 2) return;
  const [A, B] = [...teams.values()];
  const winA = A[0].p.win, winB = B[0].p.win;
  if (winA === winB) return;
  const sum = (t: typeof A) => ({ mu: t.reduce((x, y) => x + y.s.mu, 0), s2: t.reduce((x, y) => x + y.s.sigma ** 2, 0) });
  const a = sum(A), b = sum(B);
  const c = Math.sqrt(a.s2 + b.s2 + 2 * RATING.beta ** 2);
  const pA = 1 / (1 + Math.exp((b.mu - a.mu) / c)), pB = 1 - pA;
  const upd = (t: typeof A, team: { s2: number }, win: boolean, p: number) => {
    const gamma = Math.sqrt(team.s2) / c;
    const eta = gamma * (team.s2 / (c * c)) * p * (1 - p);
    for (const { p: pl, s } of t) {
      const share = s.sigma ** 2 / team.s2;
      const bonus = pl.score != null && Number.isFinite(pl.score) ? RATING.perf * Math.max(-0.5, Math.min(0.5, (pl.score - 5) / 10)) : 0;
      s.mu += share * (team.s2 / c) * ((win ? 1 : 0) + bonus - p);
      s.sigma = Math.sqrt(s.sigma ** 2 * Math.max(1 - share * eta, RATING.kappa));
      s.n += 1; if (win) s.w += 1;
    }
  };
  upd(A, a, winA, pA);
  upd(B, b, winB, pB);
}

/** 판들을 시간순으로 모두 거쳐 실력표를 만든다 */
export function rateAll(games: RatedGame[]) {
  const book = new Map<string, Skill>();
  for (const g of [...games].sort((x, y) => x.playedAt - y.playedAt)) rateGame(book, g);
  return book;
}


/** 줄의 점수: 서버가 레이팅을 보냈으면 그것, 예전 서버면 예전 점수 */
export const scoreOf = (r: { rating?: number | null; w: number; n: number }) => r.rating ?? rankScore(r.w, r.n);

/**
 * 설명용 예시: 처음 보는 상대들과만 n판을 해서 w승 (승패를 고르게 섞음, 개인 성적 보정 없음)일 때의 레이팅.
 * 비회원 랭킹 안내('레이팅은 이렇게 매겨요')에 쓴다.
 */
export function ratingExample(n: number, w: number) {
  const book = new Map<string, Skill>();
  let won = 0;
  for (let i = 0; i < n; i++) {
    const win = Math.floor(((i + 1) * w) / n) > won;
    if (win) won++;
    const players: RatedPlayer[] = [{ key: 'me', teamId: 100, win }];
    for (let k = 0; k < 4; k++) players.push({ key: '', teamId: 100, win });
    for (let k = 0; k < 5; k++) players.push({ key: '', teamId: 200, win: !win });
    rateGame(book, { playedAt: 0, players });
  }
  return ratingOf(book.get('me'));
}
