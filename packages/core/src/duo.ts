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

// ───────── 관계 점수 (함께할수록 오른다, 기록에서 늘 다시 계산) ─────────

/** 듀오 등급 (프로 팀 느낌). 숫자는 이 표 한 곳에서 바꾼다 */
export const BOND_GRADES = [
  { at: 0, name: '트라이아웃', desc: '서로의 플레이를 알아 가는 단계' },
  { at: 100, name: '로스터 합류', desc: '같은 팀으로 손발을 맞추기 시작했어요' },
  { at: 300, name: '주전 듀오', desc: '믿고 함께 나서는 사이' },
  { at: 700, name: '에이스 듀오', desc: '팀의 중심이 되는 호흡' },
  { at: 1500, name: '레전드 듀오', desc: '말하지 않아도 통하는 사이' },
] as const;
/** 함께한 판 · 함께 이긴 판 · 함께한 주(꾸준함) 점수 */
export const BOND_POINT = { game: 10, win: 5, week: 30 } as const;

export type Bond = {
  score: number; grade: number; name: string; desc: string;
  next: { name: string; at: number } | null; toNext: number; pct: number;
  weeks: number; recentWeeks: number;
  parts: { games: number; wins: number; weeks: number };
};

const WEEK = 7 * DAY;
const weekKey = (t: number) => Math.floor((t + 9 * 3_600_000 + 3 * DAY) / WEEK); // 한국 시간 월요일 기준 주

export function bondOf(T: DuoGame[], now = Date.now()): Bond {
  const wins = T.filter((g) => g.w).length;
  const weeks = new Set(T.map((g) => weekKey(g.t)));
  const cur = weekKey(now);
  const recentWeeks = [0, 1, 2, 3].filter((i) => weeks.has(cur - i)).length;
  const parts = { games: T.length * BOND_POINT.game, wins: wins * BOND_POINT.win, weeks: weeks.size * BOND_POINT.week };
  const score = parts.games + parts.wins + parts.weeks;
  let grade = 0;
  BOND_GRADES.forEach((g, i) => { if (score >= g.at) grade = i; });
  const g = BOND_GRADES[grade], nx = BOND_GRADES[grade + 1];
  return {
    score, grade: grade + 1, name: g.name, desc: g.desc,
    next: nx ? { name: nx.name, at: nx.at } : null,
    toNext: nx ? nx.at - score : 0,
    pct: nx ? (score - g.at) / (nx.at - g.at) : 1,
    weeks: weeks.size, recentWeeks, parts,
  };
}

// ───────── 코치 리포트 (강점 · 보완점 · 다음 판 작전) ─────────

export type CoachItem = { key: string; tone: 'good' | 'fix'; title: string; evidence: string; action: string; call: string; weight: number };
export type CoachReport = { ready: boolean; need: number; items: CoachItem[]; plan: string[] };

/** 리포트를 쓰기 시작하는 함께 판수 */
export const COACH_MIN = 5;
/** 비교할 두 묶음이 각각 이만큼은 있어야 말한다 */
const BUCKET = 3;
const pp = (x: number) => `${Math.round(x * 100)}%`;
const dmgType = (id: number) => CHAMPIONS[id]?.damage ?? null;
const isFront = (id: number) => { const c = CHAMPIONS[id]; return Boolean(c && (c.roles.includes('tank') || (c.roles[0] === 'fighter' && c.style.durability >= 2))); };

export function coachOf(page: MemberPage, nick: string): CoachReport {
  const T = page.duo?.together ?? [];
  if (T.length < COACH_MIN) return { ready: false, need: COACH_MIN - T.length, items: [], plan: [] };
  const items: CoachItem[] = [];
  const R = (gs: DuoGame[]) => rateOf(gs.filter((g) => g.w).length, gs.length);
  const all = R(T);

  // 1) 피해 유형 구성: 둘 다 같은 유형(AD+AD / AP+AP) vs 섞임
  const same = T.filter((g) => { const a = dmgType(g.mc), b = dmgType(g.tc); return a && b && a !== 'MIX' && a === b; });
  const mixed = T.filter((g) => { const a = dmgType(g.mc), b = dmgType(g.tc); return a && b && (a !== b || a === 'MIX'); });
  if (same.length >= BUCKET && mixed.length >= BUCKET) {
    const d = R(mixed) - R(same);
    if (d >= 0.1) items.push({ key: 'dmg', tone: 'fix', weight: d, title: '피해 유형이 한쪽으로 쏠릴 때 고전',
      evidence: `둘 다 같은 피해 유형일 때 ${pp(R(same))} (${same.length}판) · 섞였을 때 ${pp(R(mixed))} (${mixed.length}판)`,
      action: '상대가 방어력·마법 저항력 하나만 올려도 둘이 함께 막힙니다. 한 명은 AP/혼합 쪽 챔프를 대기석에서 먼저 잡거나, 증강·아이템을 관통 쪽으로 틀어 주세요.',
      call: '피해 유형 분산 (AP·AD 섞기)' });
    else if (d <= -0.1) items.push({ key: 'dmg', tone: 'good', weight: -d, title: '같은 유형으로 몰아칠 때 강함',
      evidence: `같은 피해 유형 ${pp(R(same))} (${same.length}판) · 섞였을 때 ${pp(R(mixed))}`,
      action: '한 유형으로 화력을 집중할 때 결과가 좋았어요. 상대가 저항 아이템을 늦게 가는 판이라면 그대로 밀어붙여도 좋습니다.', call: '' });
    else if (R(mixed) >= 0.55 && mixed.length >= 5) items.push({ key: 'dmg', tone: 'good', weight: 0.05, title: 'AP·AD 균형이 안정적',
      evidence: `피해 유형이 섞인 판 ${pp(R(mixed))} (${mixed.length}판)`, action: '지금처럼 서로 다른 피해 유형을 맡는 그림을 유지하세요.', call: '' });
  }

  // 2) 앞라인: 둘 중 하나라도 앞라인을 맡았나
  const front = T.filter((g) => isFront(g.mc) || isFront(g.tc)), back = T.filter((g) => !isFront(g.mc) && !isFront(g.tc));
  if (front.length >= BUCKET && back.length >= BUCKET) {
    const d = R(front) - R(back);
    if (d >= 0.1) items.push({ key: 'front', tone: 'fix', weight: d, title: '둘 다 뒷줄이면 한타가 열리지 않음',
      evidence: `한 명이 앞라인일 때 ${pp(R(front))} (${front.length}판) · 둘 다 뒷줄일 때 ${pp(R(back))} (${back.length}판)`,
      action: '둘 다 딜러를 잡으면 교전을 먼저 열 사람이 없습니다. 주사위·대기석에서 탱커/브루저를 한 명이 맡고, 아니라면 내구·생존 증강을 먼저 챙겨 앞줄을 대신하세요.',
      call: '앞라인 한 명 확보' });
    else if (d <= -0.1) items.push({ key: 'front', tone: 'good', weight: -d, title: '딜러 둘의 화력전이 통함',
      evidence: `둘 다 뒷줄일 때 ${pp(R(back))} (${back.length}판) · 앞라인 있을 때 ${pp(R(front))}`,
      action: '포킹·원거리 화력으로 밀어붙이는 운영이 잘 맞아요. 거리 유지와 시야 확보에 집중하세요.', call: '' });
  }

  // 3) 데스 관리: 진 판에서 둘이 함께 많이 죽는가 (따로 잡힘 = 합류 문제)
  const W = T.filter((g) => g.w), L = T.filter((g) => !g.w);
  const deaths = (gs: DuoGame[]) => gs.reduce((s, g) => s + g.md + g.td, 0) / Math.max(1, gs.length);
  if (W.length >= BUCKET && L.length >= BUCKET) {
    const dw = deaths(W), dl = deaths(L);
    if (dl >= dw * 1.35 && dl - dw >= 3) items.push({ key: 'death', tone: 'fix', weight: (dl - dw) / 20, title: '진 판에서 따로 잡히는 장면이 많음',
      evidence: `진 판 둘의 데스 합 평균 ${dl.toFixed(1)} · 이긴 판 ${dw.toFixed(1)}`,
      action: '한 명이 먼저 들어가고 다른 한 명이 늦게 따라가는 패턴입니다. 진입은 같이(3초 안에 합류), 빠질 때도 같이. 한 명이 잘리면 무리한 복수 교전보다 한 박자 쉬고 다시 맞추세요.',
      call: '같이 들어가고 같이 빠지기' });
    else if (dl <= dw) items.push({ key: 'death', tone: 'good', weight: 0.04, title: '져도 무너지지 않는 안정감',
      evidence: `진 판 데스 합 ${dl.toFixed(1)} · 이긴 판 ${dw.toFixed(1)}`, action: '불리할 때도 함께 버티는 운영이 됩니다. 역전 각을 끝까지 노려 보세요.', call: '' });
  }

  // 4) 캐리 분배: 이긴 판·진 판에서 그 회원의 피해 비중 (둘 사이)
  const share = (gs: DuoGame[]) => { const xs = gs.filter((g) => g.mdmg && g.tdmg); return xs.length ? { v: xs.reduce((s, g) => s + g.tdmg! / (g.mdmg! + g.tdmg!), 0) / xs.length, n: xs.length } : null; };
  const sw = share(W), sl = share(L);
  if (sw && sl && sw.n >= BUCKET && sl.n >= BUCKET) {
    const d = sw.v - sl.v;
    if (d >= 0.08) items.push({ key: 'carry-them', tone: 'fix', weight: d, title: `${nick}님의 딜이 살아야 이기는 구조`,
      evidence: `둘의 피해 중 ${nick}님 몫 — 이긴 판 ${pp(sw.v)} · 진 판 ${pp(sl.v)}`,
      action: `${nick}님이 피해를 넣을 각을 만들어 주는 쪽으로 운영하세요. 진입·보호·시야를 ${nick}님 쪽에 몰고, 아이템·증강도 생존·보조 쪽으로 받쳐 주면 승률이 올라갑니다.`,
      call: `${nick}님 중심 딜 분배` });
    else if (d <= -0.08) items.push({ key: 'carry-me', tone: 'fix', weight: -d, title: '내가 딜을 넣어야 이기는 구조',
      evidence: `둘의 피해 중 내 몫 — 이긴 판 ${pp(1 - sw.v)} · 진 판 ${pp(1 - sl.v)}`,
      action: `이긴 판은 내가 화력을 맡았을 때였어요. ${nick}님에게 앞에서 시선을 끌어 달라고 하고, 나는 딜 각이 열릴 때까지 위치를 지키세요.`,
      call: '나 중심 딜 분배' });
  }

  // 5) 경기 시간: 짧은 판(15분 이하) vs 긴 판(20분 이상)
  const short = T.filter((g) => g.dur && g.dur <= 15 * 60), long = T.filter((g) => g.dur && g.dur >= 20 * 60);
  if (short.length >= BUCKET && long.length >= BUCKET) {
    const d = R(short) - R(long);
    if (d >= 0.15) items.push({ key: 'late', tone: 'fix', weight: d, title: '장기전에서 힘이 빠짐',
      evidence: `15분 안에 끝난 판 ${pp(R(short))} (${short.length}판) · 20분 넘긴 판 ${pp(R(long))} (${long.length}판)`,
      action: '초반 우위를 굳히지 못하면 후반 한타에서 밀립니다. 앞서 있을 때 과감하게 끝내는 판단(포탑·억제기 압박)을 하고, 후반을 보고 성장하는 증강도 하나쯤 섞어 두세요.',
      call: '앞섰을 때 빠르게 끝내기' });
    else if (d <= -0.15) items.push({ key: 'early', tone: 'fix', weight: -d, title: '초반 교전에서 밀림',
      evidence: `15분 안에 끝난 판 ${pp(R(short))} · 20분 넘긴 판 ${pp(R(long))}`,
      action: '시작 직후 교전에서 손해를 보고 일찍 무너지는 판이 많습니다. 초반엔 무리한 진입보다 둘이 붙어 다니며 상대의 실수를 기다리고, 후반 강한 그림으로 끌고 가세요.',
      call: '초반엔 붙어서 버티기' });
  }

  // 6) 역할 조합: 주전 라인업 / 피해야 할 조합
  const rm = new Map<string, { mr: ChallengeRole; tr: ChallengeRole; gs: DuoGame[] }>();
  for (const g of T) { const mr = challengeRole(g.mc), tr = challengeRole(g.tc); if (!mr || !tr) continue; const k = `${mr}-${tr}`; const x = rm.get(k) ?? { mr, tr, gs: [] }; x.gs.push(g); rm.set(k, x); }
  const rl = [...rm.values()].filter((x) => x.gs.length >= BUCKET);
  const best = [...rl].sort((a, b) => R(b.gs) - R(a.gs))[0], worst = [...rl].sort((a, b) => R(a.gs) - R(b.gs))[0];
  const ko = (r: ChallengeRole) => CHALLENGE_ROLE_KO[r];
  if (best && R(best.gs) >= Math.max(0.55, all + 0.05)) items.push({ key: 'lineup', tone: 'good', weight: R(best.gs) - all, title: `주전 라인업: 나 ${ko(best.mr)} + ${nick}님 ${ko(best.tr)}`,
    evidence: `이 조합 ${pp(R(best.gs))} (${best.gs.length}판) · 전체 ${pp(all)}`,
    action: '주사위·대기석에서 이 역할 조합이 보이면 우선 잡으세요. 두 사람이 가장 편하게 호흡을 맞추는 그림입니다.', call: `나 ${ko(best.mr)} + ${nick} ${ko(best.tr)} 라인업 우선` });
  if (worst && worst !== best && R(worst.gs) <= Math.min(0.4, all - 0.1)) items.push({ key: 'avoid', tone: 'fix', weight: all - R(worst.gs), title: `약한 조합: 나 ${ko(worst.mr)} + ${nick}님 ${ko(worst.tr)}`,
    evidence: `이 조합 ${pp(R(worst.gs))} (${worst.gs.length}판) · 전체 ${pp(all)}`,
    action: '이 역할로 만나면 역할이 겹치거나 빈 곳이 생깁니다. 바꿀 수 있다면 한 명이 역할을 바꾸고, 그대로 간다면 둘 중 한 명이 보조·앞라인 증강으로 빈 곳을 메우세요.', call: `나 ${ko(worst.mr)} + ${nick} ${ko(worst.tr)}면 역할 조정` });

  // 7) 모임 판(회원 3명 이상) vs 둘만
  const big = T.filter((g) => g.crew >= 3), duo2 = T.filter((g) => g.crew < 3);
  if (big.length >= BUCKET && duo2.length >= BUCKET) {
    const d = R(big) - R(duo2);
    if (Math.abs(d) >= 0.12) items.push({ key: 'crew', tone: d > 0 ? 'good' : 'fix', weight: Math.abs(d) * 0.8,
      title: d > 0 ? 'Prism 회원이 더 붙으면 더 강해짐' : '둘이서만 할 때가 더 잘 풀림',
      evidence: `회원 3명 이상 ${pp(R(big))} (${big.length}판) · 둘만 ${pp(R(duo2))} (${duo2.length}판)`,
      action: d > 0 ? '디스코드에 한 명 더 불러서 3인 이상으로 들어가 보세요. 소통이 되는 아군이 늘수록 결과가 좋았습니다.' : '인원이 늘면 역할이 겹치기 쉽습니다. 여럿이 할 땐 시작 전에 앞라인·딜러를 미리 나눠 두세요.',
      call: d > 0 ? '한 명 더 불러 3인 이상으로' : '' });
  }

  // 8) 함께할 때 KDA (기복)
  const kd = (k: number, d: number, a: number) => (k + a) / Math.max(1, d);
  const them = kd(T.reduce((s, g) => s + g.tk, 0), T.reduce((s, g) => s + g.td, 0), T.reduce((s, g) => s + g.ta, 0));
  const themAvg = page.total.n ? kd(page.total.k, page.total.d, page.total.a) : null;
  if (themAvg && them >= themAvg * 1.2) items.push({ key: 'kda', tone: 'good', weight: 0.06, title: `나와 함께할 때 ${nick}님이 살아남`,
    evidence: `함께할 때 ${nick}님 KDA ${them.toFixed(1)} · 평소 ${themAvg.toFixed(1)}`, action: '서로 받쳐 주는 호흡이 이미 있습니다. 지금 거리감(붙어 다니기)을 유지하세요.', call: '' });

  // 작전: 보완점 중 큰 것부터 + 주전 라인업
  const fixes = items.filter((x) => x.tone === 'fix').sort((a, b) => b.weight - a.weight);
  const goods = items.filter((x) => x.tone === 'good').sort((a, b) => b.weight - a.weight);
  const plan = [...items.filter((x) => x.key === 'lineup'), ...fixes].map((x) => x.call).filter(Boolean).slice(0, 3);
  return { ready: true, need: 0, items: [...fixes, ...goods], plan };
}
