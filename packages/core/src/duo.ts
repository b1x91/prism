/**
 * 나와의 시너지 (CLAUDE.md v3.28). 회원 페이지에서 '나'와 그 회원이 함께한 판·맞붙은 판을 읽어
 * 실제 기록(사실)과 성향 예상(추정)을 나눠 보여 줄 재료를 만든다.
 * 판수가 적을 때 승률이 튀지 않게 함께 승률은 내 평균 쪽으로 당겨서(PRIOR 판만큼) 평가한다.
 */
import { CHAMPIONS } from './data';
import { challengeRole, CHALLENGE_ROLE_KO, type ChallengeRole } from './challenges';
import { synergyOf, type ChampAgg, type DuoGame, type DuoVs, type MemberPage, type Synergy } from './profile';

/** 평가할 때 내 평균 쪽으로 당기는 세기 (가상의 판 수) */
const PRIOR = 10;
/** 한 줄 평가를 내리는 최소 함께 판수 */
const VERDICT_MIN = 10;
const rateOf = (w: number, n: number) => (n ? w / n : 0);
const kdaOf = (k: number, d: number, a: number) => (k + a) / Math.max(1, d);
const DAY = 86_400_000;

export type DuoPair = { mc: number; tc: number; n: number; w: number };
export type DuoRole = { mr: ChallengeRole; tr: ChallengeRole; n: number; w: number };
export type DuoVerdict = { key: 'new' | 'dream' | 'good' | 'fine' | 'tuning'; label: string; sub: string };

export type Duo = {
  together: {
    n: number; w: number; rate: number;
    /** 내 평균 · 그 회원 평균 승률 */
    myAvg: number | null; theirAvg: number | null;
    /** 함께 승률 - 내 평균 (%p, 판이 적으면 내 평균 쪽으로 당긴 값) */
    lift: number | null;
    recent: boolean[]; streak: number; best: number;
    first: number | null; last: number | null;
    kda: { me: number; them: number; meAvg: number | null; themAvg: number | null } | null;
    pairs: DuoPair[];
    roles: DuoRole[];
  };
  vs: { n: number; w: number; recent: boolean[]; nemesis: { tc: number; n: number; l: number } | null };
  style: Synergy | null;
  verdict: DuoVerdict;
  insights: { tone: 'up' | 'down' | 'info'; text: string }[];
};

const kdaAll = (cs: ChampAgg[]) => {
  const s = cs.reduce((x, c) => ({ k: x.k + (c.k ?? 0), d: x.d + (c.d ?? 0), a: x.a + (c.a ?? 0), n: x.n + c.n }), { k: 0, d: 0, a: 0, n: 0 });
  return s.n ? kdaOf(s.k, s.d, s.a) : null;
};

/** 연속: 최신 판부터 같은 결과가 몇 판 이어졌나 (+ 연승, - 연패) · 가장 긴 연승 */
function streaks(games: { w: number }[]) {
  let cur = 0;
  for (const g of games) { if (cur === 0) cur = g.w ? 1 : -1; else if ((cur > 0) === Boolean(g.w)) cur += cur > 0 ? 1 : -1; else break; }
  let best = 0, run = 0;
  for (const g of [...games].reverse()) { run = g.w ? run + 1 : 0; best = Math.max(best, run); }
  return { cur, best };
}

export function duoOf(page: MemberPage, nick: string): Duo | null {
  if (!page.duo || !page.viewer) return null;
  const T: DuoGame[] = page.duo.together, V: DuoVs[] = page.duo.against;
  const n = T.length, w = T.filter((g) => g.w).length;
  const vt = page.viewer.total;
  const myAvg = vt?.n ? rateOf(vt.w, vt.n) : null;
  const theirAvg = page.total.n ? rateOf(page.total.w, page.total.n) : null;
  const shrunk = myAvg === null ? null : (w + PRIOR * myAvg) / (n + PRIOR);
  const lift = shrunk === null || !n ? null : Math.round((shrunk - myAvg!) * 1000) / 10;
  const { cur, best } = streaks(T);

  // 조합 (내 챔프 + 그 회원 챔프)
  const pm = new Map<string, DuoPair>();
  for (const g of T) { const k = `${g.mc}-${g.tc}`; const x = pm.get(k) ?? { mc: g.mc, tc: g.tc, n: 0, w: 0 }; x.n++; if (g.w) x.w++; pm.set(k, x); }
  // 두 번 넘게 한 조합을 먼저 (한 번 이긴 조합이 위를 차지하지 않게), 그 안에서 승수·승률 순
  const pairs = [...pm.values()].filter((x) => x.w > 0).sort((a, b) => Number(b.n >= 2) - Number(a.n >= 2) || b.w - a.w || rateOf(b.w, b.n) - rateOf(a.w, a.n) || b.n - a.n).slice(0, 4);
  // 역할 조합
  const rm = new Map<string, DuoRole>();
  for (const g of T) {
    const mr = challengeRole(g.mc), tr = challengeRole(g.tc);
    if (!mr || !tr) continue;
    const k = `${mr}-${tr}`; const x = rm.get(k) ?? { mr, tr, n: 0, w: 0 }; x.n++; if (g.w) x.w++; rm.set(k, x);
  }
  const roles = [...rm.values()].sort((a, b) => b.n - a.n || b.w - a.w);

  const kda = n ? {
    me: kdaOf(T.reduce((s, g) => s + g.mk, 0), T.reduce((s, g) => s + g.md, 0), T.reduce((s, g) => s + g.ma, 0)),
    them: kdaOf(T.reduce((s, g) => s + g.tk, 0), T.reduce((s, g) => s + g.td, 0), T.reduce((s, g) => s + g.ta, 0)),
    meAvg: kdaAll(page.viewer.champions), themAvg: page.total.n ? kdaOf(page.total.k, page.total.d, page.total.a) : null,
  } : null;

  // 맞대결: 나를 가장 많이 이긴 그 회원의 챔프
  const nm = new Map<number, { tc: number; n: number; l: number }>();
  for (const g of V) { const x = nm.get(g.tc) ?? { tc: g.tc, n: 0, l: 0 }; x.n++; if (!g.w) x.l++; nm.set(g.tc, x); }
  const nemesis = [...nm.values()].filter((x) => x.l >= 2).sort((a, b) => b.l - a.l || a.n - b.n)[0] ?? null;
  const vw = V.filter((g) => g.w).length;

  const style = synergyOf(page.viewer.champions, page.champions);

  // 평가는 함께 10판부터 (적은 판으로 '환상의 듀오'라고 단정하지 않는다)
  const verdict: DuoVerdict = n === 0 ? { key: 'new', label: '아직 같이 한 판이 없어요', sub: '오늘 밤 같이 한 판 어때요?' }
    : n < VERDICT_MIN ? { key: 'new', label: '알아가는 사이', sub: `함께 ${n}판 · ${lift !== null && lift > 0 ? '출발이 좋아요' : '몇 판 더 하면 궁합이 보여요'}` }
    : lift !== null && lift >= 6 ? { key: 'dream', label: '환상의 듀오', sub: '같이 하면 확실히 더 이겨요' }
    : lift !== null && lift >= 2 ? { key: 'good', label: '든든한 짝', sub: '같이 하면 평소보다 잘 풀려요' }
    : lift !== null && lift > -2 ? { key: 'fine', label: '편한 짝', sub: '함께해도 평소 실력 그대로' }
    : { key: 'tuning', label: '손발 맞추는 중', sub: '조합을 바꿔 보면 달라질 수 있어요' };

  // 한 줄 인사이트 (사실만, 판수가 받쳐 줄 때만)
  const ins: Duo['insights'] = [];
  const cn = (id: number) => CHAMPIONS[id]?.name ?? `#${id}`;
  if (n >= 5 && lift !== null && Math.abs(lift) >= 1) ins.push({ tone: lift > 0 ? 'up' : 'down', text: `${nick}님과 함께하면 내 승률이 평소보다 ${Math.abs(lift).toFixed(1)}%p ${lift > 0 ? '높아요' : '낮아요'}` });
  if (cur >= 2) ins.push({ tone: 'up', text: `지금 함께 ${cur}연승 중이에요` });
  else if (cur <= -3) ins.push({ tone: 'down', text: `최근 함께 ${-cur}연패 — 다음 판은 역할을 바꿔 보세요` });
  const bp = pairs.find((p) => p.n >= 2 && p.w / p.n >= 0.6);
  if (bp) ins.push({ tone: 'up', text: `${cn(bp.mc)} + ${cn(bp.tc)} 조합으로 ${bp.w}승 ${bp.n - bp.w}패` });
  const theirRole = new Map<ChallengeRole, { n: number; w: number }>();
  for (const r of roles) { const x = theirRole.get(r.tr) ?? { n: 0, w: 0 }; x.n += r.n; x.w += r.w; theirRole.set(r.tr, x); }
  const br = [...theirRole.entries()].filter(([, x]) => x.n >= 3).sort((a, b) => rateOf(b[1].w, b[1].n) - rateOf(a[1].w, a[1].n))[0];
  if (br && rateOf(br[1].w, br[1].n) >= 0.55) ins.push({ tone: 'up', text: `${nick}님이 ${CHALLENGE_ROLE_KO[br[0]]}일 때 함께 ${Math.round(rateOf(br[1].w, br[1].n) * 100)}% 이겼어요 (${br[1].n}판)` });
  if (kda && kda.themAvg !== null && n >= 5 && kda.them >= kda.themAvg * 1.15) ins.push({ tone: 'up', text: `나와 함께할 때 ${nick}님 KDA가 평소보다 좋아요 (${kda.them.toFixed(1)} · 평소 ${kda.themAvg.toFixed(1)})` });
  if (kda && kda.meAvg !== null && n >= 5 && kda.me >= kda.meAvg * 1.15) ins.push({ tone: 'up', text: `${nick}님과 함께할 때 내 KDA가 평소보다 좋아요 (${kda.me.toFixed(1)} · 평소 ${kda.meAvg.toFixed(1)})` });
  if (V.length >= 3) ins.push({ tone: vw * 2 >= V.length ? 'up' : 'down', text: `맞대결은 내가 ${vw}승 ${V.length - vw}패${nemesis ? ` · ${cn(nemesis.tc)}에게 ${nemesis.l}번 졌어요` : ''}` });
  const last = T[0]?.t ?? null;
  if (last && Date.now() - last > 14 * DAY) ins.push({ tone: 'info', text: `마지막으로 함께한 지 ${Math.floor((Date.now() - last) / DAY)}일 — 오랜만에 같이 한 판 어때요?` });

  return {
    together: {
      n, w, rate: rateOf(w, n), myAvg, theirAvg, lift,
      recent: T.slice(0, 10).map((g) => Boolean(g.w)).reverse(), streak: cur, best,
      first: T.length ? T[T.length - 1].t : null, last, kda, pairs, roles: roles.slice(0, 4),
    },
    vs: { n: V.length, w: vw, recent: V.slice(0, 10).map((g) => Boolean(g.w)).reverse(), nemesis },
    style, verdict, insights: ins.slice(0, 5),
  };
}
