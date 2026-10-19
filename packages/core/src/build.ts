/**
 * 아이템 추천 (CLAUDE.md v3.88). 챔프 선택·챔프 상세에 쓴다.
 *  - 모임 기록이 충분하면(BUILD_MIN 판) 그 챔프로 실제로 산 완성 아이템을 자주 산 순서로 — 사실.
 *  - 모자라면 챔프 역할·피해 유형으로 고른 기본 빌드 (외부 통계 수치를 가져오지 않는다, v3.2-3).
 * 상대에 따라 바꿀 아이템(치유 감소·관통·방어)은 이번 판 분석·게임 위 작은 창이 따로 말한다.
 */
import { CHAMPIONS, ITEM } from './data';
import type { ChampionProfile } from './synergy';

export type BuildKind = 'apBurst' | 'apBattle' | 'apAssassin' | 'enchanter' | 'tank' | 'fighter' | 'adAssassin' | 'crit';
export type CrewItems = { games: number; items: { id: number; n: number; w: number }[]; boots: { id: number; n: number; w: number }[] };
export type Build = {
  source: 'crew' | 'role';
  kind: BuildKind;
  label: string;        // 역할 기본 빌드 이름 (예: '마법 폭딜')
  core: { id: number; n?: number; w?: number }[];   // 먼저 갈 3개
  later: { id: number; n?: number; w?: number }[];  // 그다음 후보 2~3개
  boots: number;
  games: number;        // source 'crew' 일 때 근거 판수
};

/** 모임 기록을 믿기 시작하는 판수 */
export const BUILD_MIN = 5;

/** 치명타를 주로 가는 근접·비원딜 챔프 (synergy.ts 와 같은 목록) */
const CRIT_USERS = new Set(['Yasuo', 'Yone', 'Tryndamere', 'Gangplank', 'MasterYi', 'Rengar', 'Fiora', 'Shaco', 'Naafiri']);

/** 역할별 기본 빌드 — 지금 패치 데이터(items.json)에 있는 아이템만 */
export const ROLE_BUILD: Record<BuildKind, { label: string; core: number[]; later: number[]; boots: number }> = {
  apBurst: { label: '마법 폭딜', core: [6655, 4645, 3089], later: [3135, 3157], boots: 3020 },
  apBattle: { label: '마법 지속 딜', core: [6653, 3116, 4629], later: [3089, 3135], boots: 3020 },
  apAssassin: { label: '마법 암살', core: [4646, 4645, 3089], later: [3157, 3135], boots: 3020 },
  enchanter: { label: '아군 지원', core: [6617, 3107, 3222], later: [6621, 4005], boots: 3158 },
  tank: { label: '앞라인 탱커', core: [3068, 6665, 3083], later: [3075, 4401], boots: 3047 },
  fighter: { label: '싸움꾼', core: [6630, 3071, 3053], later: [6333, 6610], boots: 3047 },
  adAssassin: { label: '물리 암살', core: [6693, 3142, 6694], later: [6697, 3026], boots: 3158 },
  crit: { label: '치명타 원거리', core: [6672, 3031, 3094], later: [3036, 3072], boots: 3006 },
};

/** 챔프의 기본 빌드 종류 (8절 역할 규칙과 같은 순서: 서포터 우선, 서포터+탱커는 탱커) */
export function buildKindOf(c: ChampionProfile): BuildKind {
  const has = (r: string) => c.roles.includes(r);
  const ap = c.damage === 'AP';
  if (has('tank')) return 'tank';
  if (has('support')) return ap && c.style.damage >= 2 ? 'apBattle' : 'enchanter';
  if (has('marksman')) return ap ? 'apBattle' : 'crit';
  if (CRIT_USERS.has(c.alias)) return 'crit';
  if (has('assassin') && c.roles[0] === 'assassin') return ap ? 'apAssassin' : 'adAssassin';
  if (has('mage')) return c.style.durability >= 2 || c.flags.includes('burn') ? 'apBattle' : has('assassin') ? 'apAssassin' : 'apBurst';
  if (has('fighter')) return ap ? 'apBattle' : c.style.durability >= 2 ? 'fighter' : 'adAssassin';
  if (has('assassin')) return ap ? 'apAssassin' : 'adAssassin';
  return ap ? 'apBurst' : 'fighter';
}

/** 완성 아이템인지 (신발·재료 제외) */
export const isFinished = (id: number) => (ITEM[id]?.price ?? 0) >= 2200;

export function buildFor(championId: number, crew?: CrewItems | null): Build | null {
  const c = CHAMPIONS[championId];
  if (!c) return null;
  const kind = buildKindOf(c);
  const role = ROLE_BUILD[kind];
  const valid = (id: number) => Boolean(ITEM[id]);
  const fromRole = {
    core: role.core.filter(valid).map((id) => ({ id })),
    later: role.later.filter(valid).map((id) => ({ id })),
    boots: valid(role.boots) ? role.boots : 0,
  };
  const items = (crew?.items ?? []).filter((x) => valid(x.id) && isFinished(x.id));
  if (crew && crew.games >= BUILD_MIN && items.length >= 3) {
    const top = [...items].sort((a, b) => b.n - a.n || b.w - a.w);
    const boots = [...(crew.boots ?? [])].filter((x) => valid(x.id)).sort((a, b) => b.n - a.n)[0];
    return { source: 'crew', kind, label: role.label, core: top.slice(0, 3), later: top.slice(3, 6), boots: boots?.id ?? fromRole.boots, games: crew.games };
  }
  return { source: 'role', kind, label: role.label, ...fromRole, games: crew?.games ?? 0 };
}
