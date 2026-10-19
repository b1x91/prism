/**
 * 이번 주 도전 (CLAUDE.md v3.90). 연승 · 프리즘 연승 · 함께 쌓는 승리 · 모두의 목표 · 새로운 짝 · 듀오 등급.
 *  - 켜 둔 시간·접속에는 보상이 없다. 기록된 판의 결과(이긴 횟수·함께한 횟수)에만. 승률은 조건에 쓰지 않는다.
 *  - 보상은 '받기'로 (미션 받기와 같은 표 mission_claims, 번호는 cw: 로 시작). 지난주에 이루고 안 받은 것도 받는다.
 *  - 단계 보상은 주마다 한 번. 연승 자체는 주가 바뀌어도 이어진다 (그 단계에 닿은 판이 속한 주에 센다).
 *  - 프리즘 연승은 멤버가 같은 팀인 판만 잇는다. 혼자 한 판은 끊지도 잇지도 않는다.
 * 숫자는 WEEKLY 한 곳에서 바꾼다. 늘 기록에서 다시 계산한다.
 */
import { bondOf, BOND_GRADES } from './duo';
import type { DuoGame } from './profile';
import { weekStart } from './missions';
import { josa } from './josa';

/** 판 하나: 시각 · 승(1/0) · 같은 팀이었던 멤버들 */
export type WGame = { t: number; w: number; mates: string[] };

export const WEEKLY = {
  /** 연승 [연승 수, 피스] */
  streak: [[3, 20], [5, 40], [7, 80], [10, 150]] as [number, number][],
  /** 프리즘 연승 (멤버와 같은 팀일 때만) */
  crewStreak: [[2, 20], [4, 50], [6, 100], [8, 180]] as [number, number][],
  /** 이번 주 멤버와 같은 팀으로 이긴 판 */
  wins: [[5, 30], [15, 60], [30, 120]] as [number, number][],
  /** 모두의 목표: 이번 주 모임 전체가 함께 이긴 판 (내가 1승 이상 보탰을 때) */
  goal: [[60, 40], [100, 60]] as [number, number][],
  /** 새로운 짝: 같은 팀으로 이겨 본 적 없는 멤버와 첫 승, 한 명마다 · 주에 최대 */
  pair: { reward: 25, max: 3 },
  /** 듀오 등급이 오를 때 (짝마다 등급별 한 번) */
  bond: { 2: 30, 3: 60, 4: 120, 5: 250 } as Record<number, number>,
} as const;

const WEEK = 7 * 86_400_000;
/** 도전을 세기 시작한 주 (2026-10-19 월요일 0시 KST). 그 전 기록으로는 보상하지 않는다 — 한꺼번에 쏟아지지 않게.
 *  듀오 등급은 이때 이미 닿아 있던 등급 다음부터. 연승·짝은 그 전 판도 이어서 센다. */
export const WEEKLY_SINCE = Date.UTC(2026, 9, 18, 15, 0);

export type WStep = { id: string; at: number; reward: number; done: boolean; claimed?: boolean };
export type WTrack = { key: 'streak' | 'crewStreak' | 'wins' | 'goal'; now: number; best: number; steps: WStep[] };
export type WPair = { id: string; member: string; t: number; claimed?: boolean };
export type WBond = { id: string; member: string; grade: number; name: string; reward: number; claimed?: boolean };
export type WBondNext = { member: string; grade: number; name: string; next: string; toNext: number; pct: number; reward: number };

export type WeeklyCore = {
  week: { start: number; end: number };
  streak: WTrack; crewStreak: WTrack; wins: WTrack; goal: WTrack & { mine: number };
  /** 이번 주 새로운 짝 */
  pairs: WPair[];
  /** 같은 팀으로 이겨 본 적 있는 멤버 (챔프 선택 '걸린 것': 이 밖의 멤버와 이기면 새로운 짝) */
  wonEver: string[];
  /** 받을 수 있는 듀오 등급 보상 + 다음 등급이 가까운 짝 */
  bonds: WBond[]; bondNext: WBondNext[];
};

/** 이룬 도전 전부 (모든 주): 번호 → 기본 보상. goalWins: 주 시작 → 그 주 모임 전체 함께 이긴 판 */
export function weeklyDone(all: WGame[], goalWins: Map<number, number>, now = Date.now()): Map<string, number> {
  const out = new Map<string, number>();
  const gs = [...all].sort((a, b) => a.t - b.t);
  // 연승 · 프리즘 연승: 그 단계에 닿은 판의 주
  let s = 0, cs = 0;
  for (const g of gs) {
    const ws = weekStart(g.t);
    s = g.w ? s + 1 : 0;
    if (g.mates.length) cs = g.w ? cs + 1 : 0;
    if (ws < WEEKLY_SINCE) continue;
    // 지난주에 시작한 연승이 이번 주로 이어져도 이번 주 단계로 센다 (단계마다 주에 한 번)
    for (const [at, r] of WEEKLY.streak) if (s >= at) out.set(`cw:${ws}:streak:${at}`, r);
    if (g.mates.length) for (const [at, r] of WEEKLY.crewStreak) if (cs >= at) out.set(`cw:${ws}:crew:${at}`, r);
  }
  // 주마다: 함께 쌓는 승리 · 모두의 목표 · 새로운 짝
  const byWeek = new Map<number, WGame[]>();
  for (const g of gs) { const ws = weekStart(g.t); (byWeek.get(ws) ?? byWeek.set(ws, []).get(ws)!).push(g); }
  const wonBefore = new Set<string>();
  for (const [ws, list] of [...byWeek].sort((a, b) => a[0] - b[0])) {
    const cw = list.filter((g) => g.w && g.mates.length).length;
    if (ws < WEEKLY_SINCE) { for (const g of list) if (g.w) for (const m of g.mates) wonBefore.add(m); continue; }
    for (const [at, r] of WEEKLY.wins) if (cw >= at) out.set(`cw:${ws}:wins:${at}`, r);
    const total = goalWins.get(ws) ?? 0;
    if (cw > 0) for (const [at, r] of WEEKLY.goal) if (total >= at) out.set(`cw:${ws}:goal:${at}`, r);
    let n = 0;
    for (const g of list) {
      if (!g.w) continue;
      for (const m of g.mates) {
        if (wonBefore.has(m)) continue;
        wonBefore.add(m);
        if (n < WEEKLY.pair.max) { out.set(`cw:${ws}:pair:${m}`, WEEKLY.pair.reward); n++; }
      }
    }
  }
  // 듀오 등급 (주와 무관, 짝마다 등급별 한 번)
  for (const [m, T] of togetherBy(gs)) {
    const b = bondOf(T, now);
    const base = bondOf(T.filter((g) => g.t < WEEKLY_SINCE), WEEKLY_SINCE).grade;
    for (let gr = base + 1; gr <= b.grade; gr++) if (WEEKLY.bond[gr]) out.set(`cw:bond:${m}:${gr}`, WEEKLY.bond[gr]);
  }
  return out;
}

function togetherBy(gs: WGame[]): Map<string, DuoGame[]> {
  const by = new Map<string, DuoGame[]>();
  for (const g of gs) for (const m of g.mates) (by.get(m) ?? by.set(m, []).get(m)!).push({ t: g.t, w: g.w } as DuoGame);
  return by;
}

export const weeklyClaimable = (all: WGame[], goalWins: Map<number, number>, claims: Map<string, number>, now = Date.now()) =>
  new Map([...weeklyDone(all, goalWins, now)].filter(([id]) => !claims.has(id)));

/** 이번 주 도전 화면 */
export function weeklyState(all: WGame[], goalWins: Map<number, number>, claims: Map<string, number>, now = Date.now()): WeeklyCore & { ready: number; past: { id: string; reward: number }[] } {
  const ws = weekStart(now);
  const done = weeklyDone(all, goalWins, now);
  const open = new Map([...done].filter(([id]) => !claims.has(id)));
  const mark = (id: string) => ({ done: done.has(id), claimed: done.has(id) && !open.has(id) });
  const gs = [...all].sort((a, b) => a.t - b.t);
  const mine = gs.filter((g) => g.t >= ws);

  // 지금 이어지는 연승 (주가 바뀌어도 이어진다) · 이번 주 최고
  let s = 0, cs = 0, sBest = 0, cBest = 0;
  for (const g of gs) {
    s = g.w ? s + 1 : 0;
    if (g.mates.length) cs = g.w ? cs + 1 : 0;
    if (g.t >= ws) { sBest = Math.max(sBest, s); if (g.mates.length) cBest = Math.max(cBest, cs); }
  }
  const steps = (kind: string, table: [number, number][]) => table.map(([at, reward]) => { const id = `cw:${ws}:${kind}:${at}`; return { id, at, reward, ...mark(id) }; });
  const cw = mine.filter((g) => g.w && g.mates.length).length;

  const pairs: WPair[] = [...done.keys()].filter((id) => id.startsWith(`cw:${ws}:pair:`)).map((id) => {
    const member = id.split(':')[3];
    const g = mine.find((x) => x.w && x.mates.includes(member));
    return { id, member, t: g?.t ?? ws, claimed: !open.has(id) };
  });
  const wonEver = new Set(gs.filter((g) => g.w).flatMap((g) => g.mates));

  const bonds: WBond[] = [];
  const bondNext: WBondNext[] = [];
  for (const [m, T] of togetherBy(gs)) {
    const b = bondOf(T, now);
    for (let gr = 2; gr <= b.grade; gr++) {
      const id = `cw:bond:${m}:${gr}`;
      if (open.has(id)) bonds.push({ id, member: m, grade: gr, name: BOND_GRADES[gr - 1].name, reward: open.get(id)! });
    }
    if (b.next && WEEKLY.bond[b.grade + 1]) bondNext.push({ member: m, grade: b.grade, name: b.name, next: b.next.name, toNext: b.toNext, pct: b.pct, reward: WEEKLY.bond[b.grade + 1] });
  }
  bondNext.sort((a, b) => b.pct - a.pct);

  const past = [...open].filter(([id]) => !id.startsWith(`cw:${ws}:`) && !id.startsWith('cw:bond:')).map(([id, reward]) => ({ id, reward }));
  return {
    week: { start: ws, end: ws + WEEK },
    streak: { key: 'streak', now: s, best: sBest, steps: steps('streak', WEEKLY.streak) },
    crewStreak: { key: 'crewStreak', now: cs, best: cBest, steps: steps('crew', WEEKLY.crewStreak) },
    wins: { key: 'wins', now: cw, best: cw, steps: steps('wins', WEEKLY.wins) },
    goal: { key: 'goal', now: goalWins.get(ws) ?? 0, best: goalWins.get(ws) ?? 0, mine: cw, steps: steps('goal', WEEKLY.goal) },
    pairs, wonEver: [...wonEver],
    bonds, bondNext: bondNext.slice(0, 3),
    past, ready: [...open.values()].reduce((a, b) => a + b, 0),
  };
}

/** 서버 /api/me/weekly 응답 (보상은 피스 배율을 곱한 값, 짝·듀오에는 얼굴) */
export type WFace = { id: string; nick: string; skin: number | null; main: number | null } | null;
export type WeeklyState = Omit<WeeklyCore, 'pairs' | 'bonds' | 'bondNext' | 'goal'> & {
  goal: WTrack & { mine: number; helpers: number };
  pairs: (WPair & { reward: number; face: WFace })[];
  bonds: (WBond & { face: WFace })[];
  bondNext: (WBondNext & { face: WFace })[];
  past: { id: string; reward: number }[];
  ready: number; rate: number;
};

// ───────── 챔프 선택 '이번 판에 걸린 것' (v3.90) ─────────

export type Stake = { key: 'streak' | 'crew' | 'wins' | 'goal' | 'pair'; big: string; title: string; sub: string; reward: number };


/** 이번 판을 이기면 무엇이 되는지. w 의 보상은 배율을 곱한 값. mates = 같은 팀 멤버 (짧은 이름) */
export function stakesOf(w: Pick<WeeklyState, 'streak' | 'crewStreak' | 'wins' | 'goal' | 'pairs' | 'wonEver' | 'rate'>, mates: { id: string; nick: string }[]): Stake[] {
  const out: Stake[] = [];
  const stepAt = (t: WTrack, next: number) => t.steps.find((s) => !s.done && s.at >= next);
  const subOf = (t: WTrack, next: number, unit: string) => {
    const s = stepAt(t, next);
    if (!s) return { sub: '이번 주 단계를 모두 이뤘어요', reward: 0 };
    return s.at === next ? { sub: `이기면 받을 수 있어요`, reward: s.reward } : { sub: `${s.at}${unit}이 되면 +${s.reward}`, reward: 0 };
  };
  const n1 = w.streak.now + 1;
  out.push({ key: 'streak', big: String(n1), title: `이기면 ${n1}연승`, ...subOf(w.streak, n1, '연승') });
  if (mates.length) {
    const names = mates.map((m) => m.nick).join('·');
    const c1 = w.crewStreak.now + 1;
    out.push({ key: 'crew', big: String(c1), title: `${josa(names, '과/와')} 이기면 프리즘 ${c1}연승`, ...subOf(w.crewStreak, c1, '연승') });
    const w1 = w.wins.now + 1;
    const ws = subOf(w.wins, w1, '승');
    if (ws.reward) out.push({ key: 'wins', big: String(w1), title: `함께 쌓는 승리 ${w1}승`, ...ws });
    const g = w.goal.steps.find((s) => !s.done);
    if (g) out.push({ key: 'goal', big: String(w.goal.now + 1), title: `모두의 목표 ${w.goal.now} → ${w.goal.now + 1}승`, sub: `${g.at}승까지 ${Math.max(0, g.at - w.goal.now - 1)}승${w.goal.mine ? '' : ' · 이기면 나도 함께 받아요'}`, reward: 0 });
    const won = new Set(w.wonEver);
    const left = WEEKLY.pair.max - w.pairs.length;
    for (const m of mates.filter((x) => !won.has(x.id)).slice(0, Math.max(0, left)))
      out.push({ key: 'pair', big: '첫', title: `${josa(m.nick, '과/와')} 첫 함께 승리`, sub: '새로운 짝', reward: Math.round(WEEKLY.pair.reward * w.rate) });
  }
  return out;
}
