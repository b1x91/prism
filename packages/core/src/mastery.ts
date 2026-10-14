/**
 * 도감 마스터 여정: 해 봤다고 끝이 아니라, 제대로 써 보고 이겨야 채워진다.
 *  - 챔피언: 그 챔피언에게 S 티어로 맞는 증강을 골라 보기 + 그 챔피언으로 3/5/10/30/50승
 *  - 증강:   그 증강이 가장 잘 맞는 챔피언(대부분 S, 범용 증강은 그 증강의 최고 티어)으로 골라 보기 + 그 증강으로 3/5/10/30/50승
 * 3승이면 '포획'(포켓몬 도감의 잡음), 목표를 모두 이루면 '마스터'.
 * 챔피언은 역할 챌린지(challenges.ts)까지, 그 마지막 관문을 넘어야 마스터.
 */
import { ACTIVE_AUGMENTS, AUGMENT, CHAMPIONS } from './data';
import { fitOf, fitPoints, tierOf, type FitTier } from './synergy';
import type { DexEntry, DexPair } from './history';
import { ROLE_CHALLENGES, challengeRole, type ChallengeRole, type ChallengeTally } from './challenges';

export const WIN_STEPS = [3, 5, 10, 30, 50] as const;
export const CATCH_WINS = 3;

export type Goal = {
  key: string; label: string; cur: number; target: number; done: boolean;
  /** 역할 챌린지 */ role?: boolean;
  /** 마지막 관문 */ gate?: boolean;
  hint?: string;
  /** 롤 클라이언트가 이 기록을 주지 않아 도전할 수 없음 (마스터 조건에서 뺀다) */ off?: boolean;
};
export type Mastery = {
  seen: boolean;
  caught: boolean;
  master: boolean;
  goals: Goal[];
  /** 이룬 목표 수 / 전체 */
  done: number;
  total: number;
  /** 다음에 이룰 목표 (마스터면 null) */
  next: Goal | null;
  /** 특별 목표에 해당하는 상대 (챔피언이면 S 티어 증강들, 증강이면 가장 잘 맞는 챔피언들)와 써 본 것 */
  special: { tier: FitTier; ids: number[]; tried: number[] };
  /** 챔피언 역할 챌린지의 역할 */
  role?: ChallengeRole | null;
};

const TIER_ORDER: FitTier[] = ['S', 'A', 'B', 'C', 'D'];
const champIds = () => Object.keys(CHAMPIONS).map(Number);
const tierFor = (champ: number, aug: number): FitTier | null => {
  const c = CHAMPIONS[champ], a = AUGMENT[aug];
  return c && a ? tierOf(fitPoints(fitOf(c, a))) : null;
};

// 계산이 무거워 한 번만 (챔피언 170여 × 증강 200여)
const sAugCache = new Map<number, number[]>();
/** 이 챔피언에게 S 티어인 증강 */
export function sTierAugments(champ: number): number[] {
  let v = sAugCache.get(champ);
  if (!v) { v = ACTIVE_AUGMENTS.filter((a) => tierFor(champ, a.id) === 'S').map((a) => a.id); sAugCache.set(champ, v); }
  return v;
}
const bestChampCache = new Map<number, { tier: FitTier; ids: number[] }>();
/** 이 증강이 가장 잘 맞는 챔피언들과 그 티어 (S 가 없으면 그 증강의 최고 티어) */
export function bestChampions(aug: number): { tier: FitTier; ids: number[] } {
  let v = bestChampCache.get(aug);
  if (!v) {
    const all = champIds().map((c) => [c, tierFor(c, aug)] as const);
    const tier = TIER_ORDER.find((t) => all.some(([, x]) => x === t)) ?? 'D';
    v = { tier, ids: all.filter(([, x]) => x === tier).map(([c]) => c) };
    bestChampCache.set(aug, v);
  }
  return v;
}

function build(e: DexEntry | undefined, special: Mastery['special'], specialLabel: string, extra: Goal[] = [], role?: ChallengeRole | null): Mastery {
  const wins = e?.w ?? 0;
  const goals: Goal[] = [
    { key: 'special', label: specialLabel, cur: Math.min(special.tried.length, 1), target: 1, done: special.tried.length > 0 },
    ...WIN_STEPS.map((t) => ({ key: `w${t}`, label: `${t}승`, cur: Math.min(wins, t), target: t, done: wins >= t })),
    ...extra,
  ];
  const live = goals.filter((g) => !g.off);
  const done = live.filter((g) => g.done).length;
  return { seen: Boolean(e), caught: wins >= CATCH_WINS, master: done === live.length, goals, done, total: live.length, next: live.find((g) => !g.done) ?? null, special, role };
}

/** 챔피언 역할 챌린지 → 목표 (관문은 맨 뒤) */
function roleGoals(id: number, ch?: ChallengeTally | null): { goals: Goal[]; role: ChallengeRole | null } {
  const role = challengeRole(id);
  if (!role) return { goals: [], role };
  const known = new Set(ch?.known ?? []);
  const counts = ch?.counts[id] ?? {};
  const goals = ROLE_CHALLENGES[role].map((c) => {
    const n = counts[c.key] ?? 0;
    return { key: `r-${c.key}`, label: c.label, hint: c.hint, cur: Math.min(n, c.target), target: c.target, done: n >= c.target, role: true, gate: c.gate, off: !ch || (c.needs.some((k) => !known.has(k)) && n === 0) };
  });
  return { goals: [...goals.filter((g) => !g.gate), ...goals.filter((g) => g.gate)], role };
}

export function champMastery(id: number, e: DexEntry | undefined, pairs: DexPair[], ch?: ChallengeTally | null): Mastery {
  const ids = sTierAugments(id);
  const set = new Set(ids);
  const tried = [...new Set(pairs.filter((p) => p.champ === id && set.has(p.aug)).map((p) => p.aug))];
  const r = roleGoals(id, ch);
  return build(e, { tier: 'S', ids, tried }, 'S티어 증강 골라 보기', r.goals, r.role);
}

export function augMastery(id: number, e: DexEntry | undefined, pairs: DexPair[]): Mastery {
  const best = bestChampions(id);
  const set = new Set(best.ids);
  const tried = [...new Set(pairs.filter((p) => p.aug === id && set.has(p.champ)).map((p) => p.champ))];
  return build(e, { tier: best.tier, ids: best.ids, tried }, `${best.tier}티어 챔피언으로 골라 보기`);
}

/**
 * 도감 레벨 0~5 (v3.20): 0 미발견 · 1 만남(1판) · 2 포획(3승) · 3 숙련(목표 절반) · 4 정예(마지막 목표 하나만 남음, 챔피언은 관문만) · 5 마스터
 */
export type DexLevel = 0 | 1 | 2 | 3 | 4 | 5;
export const DEX_LEVEL_KO: Record<DexLevel, string> = { 0: '미발견', 1: '만남', 2: '포획', 3: '숙련', 4: '정예', 5: '마스터' };
export const DEX_LEVEL_RULE: Record<DexLevel, string> = {
  0: '아직 만나지 못했어요',
  1: '한 판 해 봤어요',
  2: `${CATCH_WINS}승을 거뒀어요`,
  3: '마스터 목표를 절반 넘게 이뤘어요',
  4: '마지막 목표 하나만 남았어요',
  5: '모든 목표를 이뤘어요',
};
export function dexLevel(m: Mastery): DexLevel {
  if (m.master) return 5;
  if (!m.seen) return 0;
  if (!m.caught) return 1;
  const left = m.goals.filter((g) => !g.off && !g.done);
  if (left.length === 1 || (left.length > 0 && left.every((g) => g.gate))) return 4;
  if (m.total > 0 && m.done * 2 >= m.total) return 3;
  return 2;
}
