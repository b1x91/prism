/**
 * 챔피언 × 아수라장 증강 궁합 계산 (앱·공개 사이트 공용, 순수 함수).
 *
 * 게임 데이터(챔피언 역할·피해 유형·스킬 설명, 증강 태그)만으로 "어울리는 정도"를 계산한다.
 * 증강 자체가 얼마나 센지(승률)는 여기서 다루지 않는다 — 그건 Prism 실전 통계가 맡는다.
 * 데이터: packages/core/data/mayhem-*.json (npm run data:mayhem 으로 갱신)
 */
export type Rarity = 'silver' | 'gold' | 'prismatic';
export type MayhemAugment = {
  id: number;
  key: string;
  name: string;
  rarity: Rarity;
  icon: string | null;
  desc: string;
  tags: string[];
  note: string;
  ability: boolean;
  quest: boolean;
  disabled: boolean;
};
export type ChampionProfile = {
  name: string;
  alias: string;
  roles: string[];
  damage: 'AP' | 'AD' | 'MIX' | null;
  range: 'ranged' | 'melee';
  style: { damage: number; durability: number; cc: number; mobility: number; utility: number };
  flags: string[];
  splash: string | null; // 기본 스킨 일러스트
  tile: string | null;
};
/**
 * 어울림 단계. 게임 데이터로는 증강의 실제 세기를 알 수 없으므로 점수를 등급처럼 쪼개지 않는다.
 *   best 잘 맞음 · good 무난 · weak 안 맞음 · none 조건 없음(챔피언에게 필요한 스킬이 없다)
 */
export type FitLevel = 'best' | 'good' | 'weak' | 'none';
export type Fit = { id: number; score: number; level: FitLevel; weight: number; reasons: string[]; missing?: string };

/** 치명타 아이템을 주로 가는 근접·비원딜 챔피언 */
const CRIT_USERS = new Set(['Yasuo', 'Yone', 'Tryndamere', 'Gangplank', 'MasterYi', 'Rengar', 'Fiora', 'Shaco', 'Naafiri']);

const has = (c: ChampionProfile, r: string) => c.roles.includes(r);
const lvl = (n: number) => (n >= 3 ? 1 : n === 2 ? 0.6 : 0.2);

/** 선호 태그별 이 챔피언과의 어울림 (0~1) */
const AFFINITY: Record<string, (c: ChampionProfile) => number> = {
  ap: (c) => (c.damage === 'AP' ? 1 : c.damage === 'MIX' ? 0.6 : 0.05),
  ad: (c) => (c.damage === 'AD' ? 1 : c.damage === 'MIX' ? 0.6 : 0.05),
  attack: (c) => {
    let v = has(c, 'marksman') ? 1 : c.damage === 'AD' && c.range === 'ranged' ? 0.8 : has(c, 'fighter') ? 0.75 : has(c, 'assassin') && c.damage === 'AD' ? 0.6 : has(c, 'tank') ? 0.4 : has(c, 'support') ? 0.2 : 0.15;
    if (c.flags.includes('onhit') || c.flags.includes('empower')) v += 0.15;
    return Math.min(1, v);
  },
  crit: (c) => (has(c, 'marksman') && c.damage !== 'AP' ? 1 : CRIT_USERS.has(c.alias) ? 0.9 : c.damage === 'AD' ? 0.25 : 0.05),
  ability: (c) => (has(c, 'mage') ? 1 : has(c, 'assassin') ? (c.damage === 'AP' ? 0.9 : 0.6) : has(c, 'support') ? 0.7 : has(c, 'fighter') ? 0.55 : has(c, 'tank') ? 0.5 : 0.35),
  haste: (c) => 0.3 + 0.7 * AFFINITY.ability(c),
  ult: (c) => (has(c, 'tank') || has(c, 'mage') ? 0.85 : 0.75),
  tank: (c) => (has(c, 'tank') ? 1 : lvl(c.style.durability)),
  bruiser: (c) => (has(c, 'fighter') ? 1 : has(c, 'tank') ? 0.75 : has(c, 'assassin') && c.range === 'melee' ? 0.5 : 0.15),
  sustain: (c) => Math.min(1, (has(c, 'fighter') ? 0.85 : has(c, 'tank') ? 0.7 : has(c, 'marksman') ? 0.55 : has(c, 'assassin') ? 0.5 : has(c, 'mage') ? 0.45 : 0.3) + (c.flags.includes('heal') ? 0.15 : 0)),
  mobile: (c) => lvl(c.style.mobility),
  ranged: (c) => (c.range === 'ranged' ? 1 : 0),
  melee: (c) => (c.range === 'melee' ? 1 : 0.1),
  burst: (c) => (has(c, 'assassin') ? 1 : has(c, 'mage') ? 0.75 : 0.35),
  any: () => 0.6,
  gamble: () => 0.5,
};

/** 조건 태그: 챔피언에게 이 능력이 있어야 효과가 있다 */
const REQUIRE: Record<string, { ok: (c: ChampionProfile) => boolean; label: string }> = {
  'req:cc': { ok: (c) => c.flags.includes('cc'), label: '이동 불가 CC' },
  'req:dash': { ok: (c) => c.flags.includes('dash'), label: '돌진기' },
  'req:ally': { ok: (c) => c.flags.includes('ally'), label: '아군 회복·보호막' },
  'req:shield': { ok: (c) => c.flags.includes('shield') || c.flags.includes('ally'), label: '보호막 스킬' },
  'req:heal': { ok: (c) => c.flags.includes('heal') || c.flags.includes('shield') || c.flags.includes('ally'), label: '회복·보호막 스킬' },
  'req:channel': { ok: (c) => c.flags.includes('channel'), label: '정신 집중 스킬' },
  'req:summon': { ok: (c) => c.flags.includes('summon'), label: '소환물' },
  'req:burn': { ok: (c) => c.flags.includes('burn'), label: '지속 피해 스킬' },
  'req:stack': { ok: (c) => c.flags.includes('stack'), label: '영구 중첩' },
  'req:knockback': { ok: (c) => c.flags.includes('knockback'), label: '밀어내기 스킬' },
  'req:terrain': { ok: (c) => c.flags.includes('terrain'), label: '지형 생성 스킬' },
  'req:spin': { ok: (c) => c.flags.includes('spin'), label: '회전 스킬' },
  'req:empower': { ok: (c) => c.flags.includes('empower'), label: '강화 평타 스킬' },
};

/** 이유 칩에 쓰는 말 (어울림이 높을 때만 표시) */
const REASON: Record<string, (c: ChampionProfile) => string> = {
  ap: () => 'AP 챔피언',
  ad: () => 'AD 챔피언',
  attack: () => '평타 위주',
  crit: () => '치명타',
  ability: () => '스킬 위주',
  haste: () => '스킬 가속 효율',
  ult: () => '궁극기',
  tank: () => '앞라인',
  bruiser: () => '전사형',
  sustain: () => '버티기',
  mobile: () => '기동성',
  ranged: () => '원거리',
  melee: () => '근접',
  burst: () => '순간 딜',
};

export function fitOf(c: ChampionProfile, a: MayhemAugment): Fit {
  const prefs = a.tags.filter((t) => AFFINITY[t]);
  const reqs = a.tags.filter((t) => REQUIRE[t]);
  const missing = reqs.find((t) => !REQUIRE[t].ok(c));
  const values = prefs.map((t) => AFFINITY[t](c));
  let base = values.length ? values.reduce((x, y) => x + y, 0) / values.length : 0.6;
  // 조건을 갖춘 전용 증강은 그 챔피언에게 특히 잘 맞는다
  // 다만 성향이 안 맞으면(예: 원딜에게 탱커용 CC 증강) 조건만으로 끌어올리지 않는다
  if (reqs.length && !missing) base = prefs.length ? Math.min(1, base + 0.15) : 0.85;
  const score = missing ? Math.min(10, Math.round(base * 100)) : Math.round(base * 100);
  const reasons = [
    ...reqs.filter((t) => !missing && REQUIRE[t].ok(c)).map((t) => `${REQUIRE[t].label} 보유`),
    ...prefs.filter((t) => REASON[t] && AFFINITY[t](c) >= 0.75).map((t) => REASON[t](c)),
  ];
  // 같은 단계 안 정렬용: 조건 충족은 2, 성향 일치는 1
  const weight = (missing ? 0 : reqs.length * 2) + prefs.filter((t) => AFFINITY[t](c) >= 0.75 && t !== 'any').length;
  const level: FitLevel = missing ? 'none' : score >= 80 ? 'best' : score >= 55 ? 'good' : 'weak';
  return { id: a.id, score, level, weight, reasons: [...new Set(reasons)].slice(0, 3), missing: missing ? `${REQUIRE[missing].label} 없음` : undefined };
}

/** 챔피언 하나의 증강 궁합 전체 (비활성 증강 제외, 등급별로 점수순) */
export function guideOf(data: { augments: MayhemAugment[]; champions: Record<number, ChampionProfile> }, championId: number) {
  const c = data.champions[championId];
  if (!c) return null;
  const fits = data.augments.filter((a) => !a.disabled).map((a) => ({ ...fitOf(c, a), rarity: a.rarity }));
  // 같은 단계 안에서는 근거(조건 충족·성향 일치)가 많은 증강을 먼저
  const order: Record<FitLevel, number> = { best: 3, good: 2, weak: 1, none: 0 };
  const by = (r: Rarity) => fits.filter((f) => f.rarity === r).sort((x, y) => order[y.level] - order[x.level] || y.weight - x.weight || y.score - x.score);
  return {
    championId,
    profile: { name: c.name, roles: c.roles, damage: c.damage, range: c.range, flags: c.flags },
    silver: by('silver'),
    gold: by('gold'),
    prismatic: by('prismatic'),
  };
}
