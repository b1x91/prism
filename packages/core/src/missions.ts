/**
 * 미션 (CLAUDE.md v3.27). 도감과 이어서, 안 해 본 챔프와 덜 한 역할로 넓히게 한다.
 *  - 이번 주 미션 3개: 지난주까지의 내 기록으로 정해지고(주 중에 바뀌지 않는다), 이번 주 판으로 채운다.
 *    한 역할에 치우친 사람일수록 보상이 크다 (BIAS_BONUS).
 *  - 역할 개척: 역할마다 해 본 챔프 수가 단계를 넘으면 보상.
 * 깬 미션은 '받기'를 눌러야 피스가 들어온다 (v3.38). 받은 것만 서버 mission_claims 에 남고,
 * CLAIM_SINCE 전에 이미 깬 미션은 예전처럼 자동으로 받은 것으로 본다 (모아 둔 피스가 줄지 않게).
 * 숫자는 여기 한 곳에서 바꾼다.
 */
import { CHAMPIONS } from './data';
import { challengeRole, CHALLENGE_ROLE_KO, type ChallengeRole } from './challenges';

/** 판 하나: 챔프 · 승(1/0) · 시각 */
export type MGame = { c: number; w: number; t: number };

export const MISSION_ROLES: ChallengeRole[] = ['marksman', 'mage', 'assassin', 'fighter', 'tank', 'support'];
export const MISSION_ROLE_KO = CHALLENGE_ROLE_KO;

/** 주간 미션 기본 보상 */
export const MISSION_REWARD = { fresh: 40, weak: 40, spread: 30 } as const;
/** 가장 많이 한 역할의 비율이 이 이상이면 보상 배수 (큰 것부터) */
export const BIAS_BONUS: [number, number][] = [[0.7, 2], [0.5, 1.5]];
/** 역할 개척 단계: 그 역할 챔프를 몇 개 해 봤나 (half·all 은 그 역할 챔프 수의 절반·전부) */
export const PIONEER_STEPS: { at: number | 'half' | 'all'; reward: number }[] = [
  { at: 3, reward: 20 }, { at: 8, reward: 40 }, { at: 'half', reward: 100 }, { at: 'all', reward: 300 },
];

const DAY = 86_400_000, HOUR = 3_600_000, WEEK = 7 * DAY;
/** 이번 주 월요일 0시 (한국 시간) */
export function weekStart(t: number) {
  const d = Math.floor((t + 9 * HOUR) / DAY);
  const monday = d - ((d + 3) % 7); // 1970-01-01 은 목요일
  return monday * DAY - 9 * HOUR;
}

/** 역할별 챔프 (도전 역할 기준: 서포터 태그 우선, 서포터+탱커는 탱커) */
export const ROLE_POOL: Record<ChallengeRole, number[]> = Object.fromEntries(MISSION_ROLES.map((r) => [r, [] as number[]])) as Record<ChallengeRole, number[]>;
for (const id of Object.keys(CHAMPIONS).map(Number).sort((a, b) => a - b)) { const r = challengeRole(id); if (r) ROLE_POOL[r].push(id); }

export type RoleShare = { role: ChallengeRole; n: number; share: number };
/** 역할별 판수·비율 (많은 순) */
export function roleShares(games: MGame[]): RoleShare[] {
  const n: Record<string, number> = {};
  for (const g of games) { const r = challengeRole(g.c); if (r) n[r] = (n[r] ?? 0) + 1; }
  const total = Object.values(n).reduce((s, x) => s + x, 0);
  return MISSION_ROLES.map((role) => ({ role, n: n[role] ?? 0, share: total ? (n[role] ?? 0) / total : 0 })).sort((a, b) => b.n - a.n);
}
export const bonusOf = (top: number) => BIAS_BONUS.find(([at]) => top >= at)?.[1] ?? 1;

/** 이 시각 전에 깬 미션은 '받기' 없이 이미 받은 것으로 본다 (받기 도입 2026-10-15 18시 KST) */
export const CLAIM_SINCE = Date.UTC(2026, 9, 15, 9, 0);

export type Mission = {
  /** 받기용 번호: w:주시작:종류 */
  id: string;
  key: 'fresh' | 'weak' | 'spread';
  claimed?: boolean;
  title: string; hint: string; role?: ChallengeRole;
  target: number; progress: number; done: boolean; reward: number;
};

/** 그 주의 미션 (주 시작 전 기록으로 정하고, 그 주 판으로 채운다) */
export function weekMissions(all: MGame[], ws: number): { missions: Mission[]; bonus: number; top: RoleShare | null } {
  const prior = all.filter((g) => g.t < ws), week = all.filter((g) => g.t >= ws && g.t < ws + WEEK);
  const shares = roleShares(prior);
  const top = shares[0]?.n ? shares[0] : null;
  const bonus = bonusOf(top?.share ?? 0);
  // 덜 한 역할 순 (같으면 주마다 돌아가는 순서로)
  const rot = Math.floor(ws / WEEK) % MISSION_ROLES.length;
  const order = (r: ChallengeRole) => (MISSION_ROLES.indexOf(r) - rot + MISSION_ROLES.length) % MISSION_ROLES.length;
  const weak = [...shares].sort((a, b) => a.n - b.n || order(a.role) - order(b.role)).map((x) => x.role);
  const seen = new Set(prior.map((g) => g.c));
  // 1) 가장 덜 한 역할에서 안 해 본 챔프 (그 역할을 다 해 봤으면 그다음 역할)
  const r1 = weak.find((r) => ROLE_POOL[r].some((c) => !seen.has(c))) ?? weak[0];
  const left1 = ROLE_POOL[r1].filter((c) => !seen.has(c)).length;
  const t1 = Math.min(2, Math.max(1, left1));
  const fresh = new Set(week.filter((g) => challengeRole(g.c) === r1 && !seen.has(g.c)).map((g) => g.c)).size;
  // 2) 그다음으로 덜 한 역할로 승리
  const r2 = weak.find((r) => r !== r1) ?? r1;
  const wins = week.filter((g) => g.w && challengeRole(g.c) === r2).length;
  // 3) 서로 다른 역할 3개
  const roles = new Set(week.map((g) => challengeRole(g.c)).filter(Boolean)).size;
  const R = (base: number) => Math.round(base * bonus);
  const missions: Mission[] = [
    { id: `w:${ws}:fresh`, key: 'fresh', role: r1, title: `처음 해 보는 ${CHALLENGE_ROLE_KO[r1]} 챔프 ${t1}개`, hint: `아직 안 해 본 ${CHALLENGE_ROLE_KO[r1]} 챔프로 한 판씩`, target: t1, progress: Math.min(fresh, t1), done: fresh >= t1, reward: R(MISSION_REWARD.fresh) },
    { id: `w:${ws}:weak`, key: 'weak', role: r2, title: `${CHALLENGE_ROLE_KO[r2]}로 2승`, hint: `덜 해 본 역할인 ${CHALLENGE_ROLE_KO[r2]} 챔프로 두 번 이기기`, target: 2, progress: Math.min(wins, 2), done: wins >= 2, reward: R(MISSION_REWARD.weak) },
    { id: `w:${ws}:spread`, key: 'spread', title: '서로 다른 역할 3개', hint: '이번 주에 역할이 다른 챔프 셋으로 한 판씩', target: 3, progress: Math.min(roles, 3), done: roles >= 3, reward: R(MISSION_REWARD.spread) },
  ];
  return { missions, bonus, top };
}

export type PioneerStep = { id: string; at: number; reward: number; done: boolean; claimed?: boolean };
export type Pioneer = { role: ChallengeRole; played: number; pool: number; steps: PioneerStep[] };
/** 역할 개척: 역할마다 해 본 챔프 수와 단계 */
export function pioneer(all: MGame[]): Pioneer[] {
  const seen = new Set(all.map((g) => g.c));
  return MISSION_ROLES.map((role) => {
    const pool = ROLE_POOL[role].length, played = ROLE_POOL[role].filter((c) => seen.has(c)).length;
    const ats = PIONEER_STEPS.map((s) => ({ at: s.at === 'all' ? pool : s.at === 'half' ? Math.ceil(pool / 2) : Math.min(s.at, pool), reward: s.reward }));
    return { role, played, pool, steps: ats.map((s, i) => ({ id: `p:${role}:${i}`, ...s, done: played >= s.at })) };
  });
}

/** 깬 미션 전부 (지난 모든 주 + 이번 주 + 역할 개척): 번호와 보상 */
export function doneItems(all: MGame[], now = Date.now()): Map<string, number> {
  const out = new Map<string, number>();
  if (!all.length) return out;
  const first = Math.min(...all.map((g) => g.t));
  for (let ws = weekStart(first); ws <= now; ws += WEEK) for (const m of weekMissions(all, ws).missions) if (m.done) out.set(m.id, m.reward);
  for (const p of pioneer(all)) for (const x of p.steps) if (x.done) out.set(x.id, x.reward);
  return out;
}
/** 받기 도입 전에 이미 깬 미션 (자동으로 받은 것으로 본다) */
export const legacyItems = (all: MGame[]) => doneItems(all.filter((g) => g.t < CLAIM_SINCE), CLAIM_SINCE);

/** 받은 미션 피스 = 예전에 자동으로 받은 것 + 받기로 받은 것 (claims: 번호 → 받은 보상) */
export function missionPieces(all: MGame[], claims: Map<string, number>): number {
  const legacy = legacyItems(all);
  let sum = 0;
  for (const r of legacy.values()) sum += r;
  for (const [id, r] of claims) if (!legacy.has(id)) sum += r;
  return sum;
}
/** 지금 받을 수 있는 미션 (깼는데 아직 안 받은 것) */
export function claimable(all: MGame[], claims: Map<string, number>, now = Date.now()): Map<string, number> {
  const legacy = legacyItems(all);
  return new Map([...doneItems(all, now)].filter(([id]) => !claims.has(id) && !legacy.has(id)));
}

/** 미션 화면 */
export type MissionState = {
  week: { start: number; end: number; missions: Mission[]; bonus: number; top: RoleShare | null };
  shares: RoleShare[]; pioneer: Pioneer[]; earned: number;
  /** 피스 배율 (서버가 보상에 이미 곱해서 보낸다) */
  rate?: number;
  /** 이번 주 '처음 해 보는' 미션 역할에서 아직 안 해 본 챔프 */
  suggest: number[];
  /** 지난주까지 깼는데 아직 안 받은 주간 미션 */
  past: Mission[];
  /** 지금 받을 수 있는 피스 합 */
  ready: number;
};
export function missionState(all: MGame[], claims: Map<string, number> = new Map(), now = Date.now()): MissionState {
  const ws = weekStart(now);
  const w = weekMissions(all, ws);
  const seen = new Set(all.map((g) => g.c));
  const r = w.missions[0].role!;
  const open = claimable(all, claims, now);
  const mark = <T extends { id: string; done: boolean }>(x: T) => ({ ...x, claimed: x.done && !open.has(x.id) });
  const past: Mission[] = [];
  if (all.length) {
    const first = Math.min(...all.map((g) => g.t));
    for (let s = weekStart(first); s < ws; s += WEEK) for (const m of weekMissions(all, s).missions) if (open.has(m.id)) past.push({ ...m, claimed: false });
  }
  return {
    week: { start: ws, end: ws + WEEK, ...w, missions: w.missions.map(mark) },
    shares: roleShares(all), pioneer: pioneer(all).map((p) => ({ ...p, steps: p.steps.map(mark) })), earned: missionPieces(all, claims),
    suggest: ROLE_POOL[r].filter((c) => !seen.has(c)),
    past, ready: [...open.values()].reduce((a, b) => a + b, 0),
  };
}
