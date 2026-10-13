/**
 * 회원 페이지 분석과 "나와의 시너지". 서버가 준 원본 집계(챔피언별·증강별 n/w)로 화면에서 계산한다.
 * 시너지는 두 가지를 나눠서 말한다: 실제로 같이 한 판(사실) / 플레이 성향으로 본 예상(추정).
 */
import { AUGMENT, CHAMPIONS } from './data';
import type { NW } from './history';

export type ChampAgg = { id: number; n: number; w: number; k?: number; d?: number; a?: number };
export type RankingRow = { id: string; nick: string; skin: number | null; n: number; w: number; mainChampion: number | null };
export type Ranking = { period: 'all' | 'month'; minWinrate: number; rows: RankingRow[] };
export type MemberGame = { gameId: number; playedAt: number; duration: number; championId: number; win: boolean; kills: number; deaths: number; assists: number; augments: number[]; crewCount: number };
export type MemberPage = {
  member: { id: string; nick: string; intro: string; tier: 'guest' | 'member' | 'admin'; joinedAt: number; skin: number | null; riotId: string | null; self: boolean };
  total: NW & { k: number; d: number; a: number; first: number | null };
  rank: number;
  champions: ChampAgg[];
  augments: { id: number; n: number; w: number }[];
  recent: MemberGame[];
  together?: NW;
  against?: NW;
  viewer?: { champions: ChampAgg[] };
};

export const ROLE_ORDER = ['marksman', 'mage', 'assassin', 'fighter', 'tank', 'support'] as const;

/** 증강 성향 이름 (조건 태그 req:* 는 성향이 아니라서 뺀다) */
export const TAG_KO: Record<string, string> = {
  ability: '스킬 위주', attack: '평타 위주', crit: '치명타', ap: '주문력', ad: '공격력', haste: '스킬 가속', ult: '궁극기',
  tank: '탱커형', bruiser: '전사형', sustain: '생존·회복', mobile: '기동성', burst: '순간 폭딜', ranged: '원거리', melee: '근접',
  any: '무난한 능력치', gamble: '도박형',
};

const share = (m: Map<string, number>, total: number) =>
  [...m].map(([k, v]) => ({ key: k, n: v, share: total ? v / total : 0 })).sort((a, b) => b.n - a.n);

/** 챔피언 기록 → 역할·피해 유형 비중 (판수 가중) */
export function styleOf(champions: ChampAgg[]) {
  const roles = new Map<string, number>(), dmg = new Map<string, number>();
  let n = 0, front = 0, cc = 0;
  for (const c of champions) {
    const p = CHAMPIONS[c.id];
    if (!p) continue;
    n += c.n;
    roles.set(p.roles[0], (roles.get(p.roles[0]) ?? 0) + c.n);
    dmg.set(p.damage ?? 'MIX', (dmg.get(p.damage ?? 'MIX') ?? 0) + c.n);
    if (p.style.durability >= 3) front += c.n;
    cc += p.style.cc * c.n;
  }
  const ap = ((dmg.get('AP') ?? 0) + (dmg.get('MIX') ?? 0) / 2) / (n || 1);
  return { n, roles: share(roles, n), damage: share(dmg, n), ap, ad: n ? 1 - ap : 0, front: front / (n || 1), cc: cc / (n || 1) };
}

/** 증강 기록 → 등급별 비중·승률, 성향 태그 상위 */
export function augmentStyleOf(augments: { id: number; n: number; w: number }[]) {
  const rarity: Record<string, NW> = { prismatic: { n: 0, w: 0 }, gold: { n: 0, w: 0 }, silver: { n: 0, w: 0 } };
  const tags = new Map<string, number>();
  let n = 0;
  for (const a of augments) {
    const x = AUGMENT[a.id];
    if (!x) continue;
    n += a.n;
    const r = rarity[x.rarity];
    if (r) { r.n += a.n; r.w += a.w; }
    for (const t of x.tags) if (TAG_KO[t]) tags.set(t, (tags.get(t) ?? 0) + a.n);
  }
  return { n, rarity, tags: share(tags, n).slice(0, 6) };
}

export type Synergy = { score: number; level: 'good' | 'ok' | 'weak'; reasons: string[] };

/** 두 사람의 플레이 성향으로 본 예상 궁합 (실제 같이 한 판과 별개). 기록이 적으면 null */
export function synergyOf(a: ChampAgg[], b: ChampAgg[]): Synergy | null {
  const A = styleOf(a), B = styleOf(b);
  if (A.n < 5 || B.n < 5) return null;
  let score = 50;
  const reasons: string[] = [];
  const lean = (s: typeof A) => (s.ap >= 0.58 ? 'AP' : s.ap <= 0.42 ? 'AD' : 'MIX');
  const la = lean(A), lb = lean(B);
  if ((la === 'AP' && lb === 'AD') || (la === 'AD' && lb === 'AP')) { score += 20; reasons.push('AP·AD 피해가 서로 섞임'); }
  else if (la === lb && la !== 'MIX') { score -= 10; reasons.push(`둘 다 ${la} 위주`); }
  if (Math.max(A.front, B.front) >= 0.35) { score += 15; reasons.push(`${A.front >= B.front ? '나' : '상대'}가 앞라인을 자주 맡음`); }
  else if (A.front < 0.15 && B.front < 0.15) { score -= 10; reasons.push('둘 다 앞라인을 잘 안 맡음'); }
  const cc = (A.cc + B.cc) / 2;
  if (cc >= 2.3) { score += 10; reasons.push('CC가 넉넉함'); }
  else if (cc < 1.8) { score -= 5; reasons.push('CC가 적은 편'); }
  const top = (s: typeof A) => s.roles[0]?.key;
  if (top(A) && top(A) === top(B)) reasons.push('주 역할이 같음');
  score = Math.max(0, Math.min(100, score));
  return { score, level: score >= 70 ? 'good' : score >= 45 ? 'ok' : 'weak', reasons };
}
