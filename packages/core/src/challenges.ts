/**
 * 도감 역할 챌린지: 챔피언 역할에 맞는 도전과 마지막 관문. 관문까지 넘어야 마스터 (CLAUDE.md v3.16).
 *  - 한 판의 '활약 기록'(Feat)은 수집할 때 10명 전체를 보고 만든다 (피해량 1위 같은 순위가 필요해서).
 *    원본(Feat)만 저장하고, 몇 번 이뤘는지는 늘 여기 규칙으로 다시 센다 → 기준을 바꿔도 옛 판에 그대로 적용된다.
 *  - 롤 클라이언트가 어떤 값을 주지 않으면(예: 아군 회복량) 그 도전은 '기록 없음'으로 빼고 마스터 조건에서도 뺀다.
 */
import { CHAMPIONS, ITEM } from './data';

/** 한 판의 활약 기록. null = 그 판에서는 알 수 없음 */
export type Feat = {
  multi: number | null;      // 가장 큰 연속 처치 (2 더블 · 3 트리플 · 4 쿼드라 · 5 펜타)
  dmgTop: boolean | null;    // 10명 중 챔프 피해량 1위
  dmgTeamTop: boolean | null;
  share: number | null;      // 우리 팀 챔프 피해량 중 내 몫 (0~1)
  takenTop: boolean | null;  // 10명 중 받은 피해 1위
  takenTeamTop: boolean | null;
  ccTop: boolean | null;     // 10명 중 군중 제어 시간 1위
  ally: number | null;       // 아군 회복 + 아군 보호막
  helpItems: number;         // 아군을 돕는 아이템 수
};

/** 수집기가 보내는 한 사람 기록 (CLAUDE.md 7-1, 있는 값만) */
export type FeatSource = {
  teamId: number;
  win: boolean;
  kills: number;
  deaths: number;
  damageToChampions?: number;
  damageTaken?: number;
  largestMultiKill?: number;
  pentaKills?: number;
  quadraKills?: number;
  ccTime?: number;
  healsOnTeammates?: number;
  shieldsOnTeammates?: number;
  items?: number[];
};

/** 아군을 돕는 아이템 (이름으로 찾는다: 아수라장·아레나 변형 번호가 따로 있어서) */
const HELP_ITEMS = new Set([
  '월석 재생기', '구원', '흐르는 물의 지팡이', '기사의 맹세', '미카엘의 축복', '강철의 솔라리 펜던트',
  '불타는 향로', '슈렐리아의 군가', '헬리아의 메아리', '새벽심장', '지크의 융합', '균열 생성기',
]);
export const isHelpItem = (id: number) => HELP_ITEMS.has(ITEM[id]?.name ?? '');

const has = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** 값이 모두 있을 때만 1위를 가린다 (같으면 공동 1위) */
function top(me: FeatSource, list: FeatSource[], key: 'damageToChampions' | 'damageTaken' | 'ccTime'): boolean | null {
  if (list.length < 2 || !list.every((p) => has(p[key]))) return null;
  const v = me[key] as number;
  return v > 0 && list.every((p) => (p[key] as number) <= v);
}

/** 한 사람의 활약 기록. all = 그 판의 10명 (적어도 같은 팀은 있어야 팀 순위가 나온다) */
export function featOf(me: FeatSource, all: FeatSource[]): Feat {
  const team = all.filter((p) => p.teamId === me.teamId);
  const multi = has(me.largestMultiKill) ? me.largestMultiKill : has(me.pentaKills) && me.pentaKills > 0 ? 5 : has(me.quadraKills) && me.quadraKills > 0 ? 4 : null;
  const teamDmg = team.every((p) => has(p.damageToChampions)) ? team.reduce((s, p) => s + (p.damageToChampions ?? 0), 0) : 0;
  return {
    multi,
    dmgTop: all.length >= 10 ? top(me, all, 'damageToChampions') : null,
    dmgTeamTop: team.length >= 5 ? top(me, team, 'damageToChampions') : null,
    share: teamDmg > 0 && has(me.damageToChampions) ? me.damageToChampions / teamDmg : null,
    takenTop: all.length >= 10 ? top(me, all, 'damageTaken') : null,
    takenTeamTop: team.length >= 5 ? top(me, team, 'damageTaken') : null,
    ccTop: all.length >= 10 ? top(me, all, 'ccTime') : null,
    ally: has(me.healsOnTeammates) || has(me.shieldsOnTeammates) ? (me.healsOnTeammates ?? 0) + (me.shieldsOnTeammates ?? 0) : null,
    helpItems: (me.items ?? []).filter(isHelpItem).length,
  };
}

export type ChallengeRole = 'marksman' | 'mage' | 'assassin' | 'fighter' | 'tank' | 'support';
/** 한 판 + 그 판의 활약 기록 */
export type FeatGame = { win: boolean; kills: number; deaths: number; f: Feat };
export type Challenge = {
  key: string;
  label: string;
  /** 짧은 설명 (어떻게 하면 되는지) */
  hint: string;
  target: number;
  /** 마지막 관문 */
  gate?: boolean;
  /** 이 기록이 하나도 없으면 도전할 수 없다 (클라이언트가 값을 안 줌) */
  needs: (keyof Feat)[];
  test: (g: FeatGame) => boolean;
};

const K = (n: number) => `${n / 10000}만`;
const ALLY_STEP = 20_000, ALLY_GATE = 40_000; // 아수라장 소라카 평균 회복량이 한 판 3만 안팎 (2026-10 기준 공개 통계)

export const ROLE_CHALLENGES: Record<ChallengeRole, Challenge[]> = {
  marksman: [
    { key: 'dmgTop', label: '피해량 1위 3번', hint: '한 판 10명 중 챔프에게 준 피해가 가장 많게', target: 3, needs: ['dmgTop'], test: (g) => g.f.dmgTop === true },
    { key: 'quadra', label: '쿼드라킬', hint: '혼자 연달아 넷을 처치', target: 1, needs: ['multi'], test: (g) => (g.f.multi ?? 0) >= 4 },
    { key: 'penta', label: '펜타킬', hint: '혼자 연달아 다섯을 처치', target: 1, gate: true, needs: ['multi'], test: (g) => (g.f.multi ?? 0) >= 5 },
  ],
  mage: [
    { key: 'dmgTop', label: '피해량 1위 3번', hint: '한 판 10명 중 챔프에게 준 피해가 가장 많게', target: 3, needs: ['dmgTop'], test: (g) => g.f.dmgTop === true },
    { key: 'quadra', label: '쿼드라킬', hint: '혼자 연달아 넷을 처치', target: 1, needs: ['multi'], test: (g) => (g.f.multi ?? 0) >= 4 },
    { key: 'carry', label: '팀 피해의 35%를 넣고 승리', hint: '우리 팀이 넣은 피해의 3분의 1 넘게를 혼자', target: 1, gate: true, needs: ['share'], test: (g) => g.win && (g.f.share ?? 0) >= 0.35 },
  ],
  assassin: [
    { key: 'kills15', label: '한 판 15킬', hint: '한 판에 15명 이상 처치', target: 1, needs: [], test: (g) => g.kills >= 15 },
    { key: 'quadra', label: '쿼드라킬', hint: '혼자 연달아 넷을 처치', target: 1, needs: ['multi'], test: (g) => (g.f.multi ?? 0) >= 4 },
    { key: 'penta', label: '펜타킬', hint: '혼자 연달아 다섯을 처치', target: 1, gate: true, needs: ['multi'], test: (g) => (g.f.multi ?? 0) >= 5 },
  ],
  fighter: [
    { key: 'triple', label: '트리플킬', hint: '혼자 연달아 셋을 처치', target: 1, needs: ['multi'], test: (g) => (g.f.multi ?? 0) >= 3 },
    { key: 'frontCarry', label: '팀 피해량·받은 피해 모두 1위', hint: '우리 팀에서 가장 많이 때리고 가장 많이 맞기', target: 1, needs: ['dmgTeamTop', 'takenTeamTop'], test: (g) => g.f.dmgTeamTop === true && g.f.takenTeamTop === true },
    { key: 'quadra', label: '쿼드라킬', hint: '혼자 연달아 넷을 처치', target: 1, gate: true, needs: ['multi'], test: (g) => (g.f.multi ?? 0) >= 4 },
  ],
  tank: [
    { key: 'takenTop', label: '받은 피해 1위 3번', hint: '한 판 10명 중 가장 많이 맞아 주기', target: 3, needs: ['takenTop'], test: (g) => g.f.takenTop === true },
    { key: 'ccTop', label: '군중 제어 1위 3번', hint: '한 판 10명 중 적을 가장 오래 묶기', target: 3, needs: ['ccTop'], test: (g) => g.f.ccTop === true },
    { key: 'wall', label: '받은 피해 1위로 이기고 4데스 이하', hint: '가장 많이 맞고도 4번 이하로 쓰러지고 승리', target: 1, gate: true, needs: ['takenTop'], test: (g) => g.win && g.deaths <= 4 && g.f.takenTop === true },
  ],
  support: [
    { key: 'ally2', label: `아군 회복·보호막 ${K(ALLY_STEP)}`, hint: `한 판에 아군을 ${K(ALLY_STEP)} 넘게 회복하거나 보호막으로 지키기`, target: 1, needs: ['ally'], test: (g) => (g.f.ally ?? 0) >= ALLY_STEP },
    { key: 'helper', label: '아군을 돕는 아이템 2개로 승리 3번', hint: '월석 재생기·구원·기사의 맹세 같은 아이템을 2개 이상 갖추고 이기기', target: 3, needs: [], test: (g) => g.win && g.f.helpItems >= 2 },
    { key: 'ally4', label: `아군 회복·보호막 ${K(ALLY_GATE)}으로 승리`, hint: `한 판에 아군을 ${K(ALLY_GATE)} 넘게 지키고 이기기`, target: 1, gate: true, needs: ['ally'], test: (g) => g.win && (g.f.ally ?? 0) >= ALLY_GATE },
  ],
};

export const CHALLENGE_ROLE_KO: Record<ChallengeRole, string> = { marksman: '원딜', mage: '마법사', assassin: '암살자', fighter: '전사', tank: '탱커', support: '서포터' };

/** 챔피언의 도전 역할 (CLAUDE.md 8절: 서포터 태그가 있으면 서포터, 서포터+탱커는 탱커) */
export function challengeRole(champ: number): ChallengeRole | null {
  const roles = (CHAMPIONS[champ]?.roles ?? []) as string[];
  if (roles.includes('support')) return roles.includes('tank') ? 'tank' : 'support';
  const r = roles[0];
  return r && r in ROLE_CHALLENGES ? (r as ChallengeRole) : null;
}

/** 챔피언별 도전 횟수 + 한 번이라도 들어온 기록 종류 */
export type ChallengeTally = { counts: Record<number, Record<string, number>>; known: string[] };

/** 판들 → 챔피언별로 각 도전을 몇 번 이뤘는지 */
export function tallyChallenges(games: ({ championId: number } & FeatGame)[]): ChallengeTally {
  const counts: Record<number, Record<string, number>> = {};
  const known = new Set<string>();
  for (const g of games) {
    for (const [k, v] of Object.entries(g.f)) if (v !== null && k !== 'helpItems') known.add(k);
    const role = challengeRole(g.championId);
    if (!role) continue;
    for (const c of ROLE_CHALLENGES[role]) if (c.test(g)) { const m = (counts[g.championId] ??= {}); m[c.key] = (m[c.key] ?? 0) + 1; }
  }
  return { counts, known: [...known] };
}

/** 저장된 활약 기록(JSON) 읽기. 이전 판·깨진 값은 null */
export function parseFeat(s: string | null | undefined): Feat | null {
  if (!s) return null;
  try { const f = JSON.parse(s); return f && typeof f === 'object' ? (f as Feat) : null; } catch { return null; }
}
