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

/**
 * 어울림 티어 (v3.7): 지금 챔피언과 얼마나 잘 맞는지를 S~D 로. 증강 자체의 세기(승률)가 아니다.
 * 점수 = 어울림 점수 + 근거(조건 충족·성향 일치) 하나당 5점 (최대 3개). 조건이 없으면 0.
 * 경계는 전체 챔피언 × 증강 분포로 맞췄다: S 약 16% · 누구나 무난한 범용 증강은 B.
 */
export type FitTier = 'S' | 'A' | 'B' | 'C' | 'D';
export const fitPoints = (f: Fit) => (f.level === 'none' ? 0 : f.score + Math.min(f.weight, 3) * 5);
export const tierOf = (points: number): FitTier => (points >= 100 ? 'S' : points >= 85 ? 'A' : points >= 58 ? 'B' : points >= 35 ? 'C' : 'D');
/** 같은 티어에서 이 점수 차 이내면 우열을 매기지 않는다 (같은 순위, 고르는 건 사용자) */
export const TIE_GAP = 8;

export type RankedFit = Fit & { points: number; tier: FitTier; rank: number; tied: boolean };

/** 뜬 증강 몇 개를 챔피언에게 맞는 순서로 (3개 비교·게임 위 작은 창 공용). 비슷하면 같은 순위 */
export function rankFits(c: ChampionProfile | undefined, augments: MayhemAugment[]): RankedFit[] {
  if (!c) return [];
  const list = augments
    .map((a) => fitOf(c, a))
    .map((f) => { const points = fitPoints(f); return { ...f, points, tier: tierOf(points), rank: 1, tied: false }; })
    .sort((a, b) => b.points - a.points || b.weight - a.weight);
  list.forEach((f, i) => {
    const prev = list[i - 1];
    if (!prev) return;
    // 같은 티어이고 바로 위와 차이가 작으면 같은 순위 (D 끼리는 묶을 의미가 없어 그대로)
    if (prev.tier === f.tier && f.tier !== 'D' && prev.points - f.points <= TIE_GAP) {
      f.rank = prev.rank;
      prev.tied = f.tied = true;
    } else f.rank = i + 1;
  });
  return list;
}

/** 1위가 여럿이면 그 증강들 (사용자가 고를 몫) */
export const topTie = (list: RankedFit[]) => { const top = list.filter((f) => f.rank === 1); return top.length >= 2 ? top : null; };

// ───────── 증강 상세 (도감에서 누르면) ─────────

/** 증강 태그를 사람 말로: 성향(선호)과 필요한 것(조건) */
export function augmentTraits(a: MayhemAugment): { prefs: string[]; reqs: string[] } {
  const prefs = a.tags.filter((t) => REASON[t]).map((t) => REASON[t]({} as ChampionProfile));
  const reqs = a.tags.filter((t) => REQUIRE[t]).map((t) => REQUIRE[t].label);
  return { prefs: [...new Set(prefs)], reqs };
}

/** 이 증강이 잘 맞는 챔피언 (잘 맞음 → 무난 순, 같은 단계는 조건 충족·성향 일치가 많은 순) */
export function championsFor(a: MayhemAugment, champions: Record<number, ChampionProfile>, limit = 15) {
  const order = { best: 3, good: 2, weak: 1, none: 0 } as const;
  const all = Object.entries(champions).map(([id, c]) => ({ ...fitOf(c, a), id: Number(id) }));
  const best = all.filter((f) => f.level === 'best').length;
  const list = all
    .filter((f) => f.level === 'best' || f.level === 'good')
    .sort((x, y) => order[y.level] - order[x.level] || y.weight - x.weight || y.score - x.score)
    .slice(0, limit);
  return { list, best, total: all.length };
}

/** 같은 성향의 증강 (선호·조건 태그가 많이 겹치는 순). 함께 노리면 빌드 방향이 맞는다 */
export function relatedAugments(a: MayhemAugment, augments: MayhemAugment[], limit = 8) {
  const key = (x: MayhemAugment) => new Set(x.tags.filter((t) => t !== 'any' && t !== 'gamble' && t !== 'ranged' && t !== 'melee'));
  const mine = key(a);
  if (!mine.size) return [];
  return augments
    .filter((x) => x.id !== a.id && !x.disabled)
    .map((x) => {
      const t = key(x);
      const inter = [...t].filter((k) => mine.has(k)).length;
      return { a: x, score: inter / (mine.size + t.size - inter || 1), inter };
    })
    .filter((r) => r.inter > 0 && r.score >= 0.34)
    .sort((x, y) => y.score - x.score || x.a.name.localeCompare(y.a.name, 'ko'))
    .slice(0, limit)
    .map((r) => r.a);
}

// ───────── 설명 (게임 위 작은 창·3개 비교) ─────────

/** 받침이 있으면 '이', 없으면 '가' (한글이 아닌 끝 글자는 '가', 예: CC) */
const iGa = (w: string) => { const ch = w.charCodeAt(w.length - 1); return ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 ? '이' : '가'; };

/** 이 챔피언에게 왜 맞는지 (성향 태그별) */
const WHY: Record<string, string> = {
  haste: '스킬을 자주 써서 교전을 계속 열 수 있어요',
  ability: '스킬로 싸우는 챔피언이라 효과를 다 받아요',
  ult: '궁극기를 더 자주, 더 세게 써요',
  attack: '평타로 싸우는 챔피언이라 효과를 다 받아요',
  crit: '치명타 아이템을 가는 챔피언이라 바로 이득이에요',
  ap: 'AP 챔피언이라 그대로 강해져요',
  ad: 'AD 챔피언이라 그대로 강해져요',
  tank: '앞에서 버티는 역할이 더 단단해져요',
  bruiser: '싸움 한가운데서 오래 버티는 전사형에 맞아요',
  sustain: '회복으로 긴 싸움을 버텨요',
  mobile: '많이 움직이는 챔피언이라 효과를 자주 터뜨려요',
  ranged: '원거리라 안전하게 효과를 써요',
  melee: '붙어서 싸우는 챔피언에 맞아요',
  burst: '한 번에 몰아치는 순간 딜에 맞아요',
  any: '어느 챔피언이 써도 손해 없는 범용 증강이에요',
  gamble: '운에 따라 결과가 갈리는 증강이에요',
};
/** 조건을 갖췄을 때 */
const WHY_REQ: Record<string, string> = {
  'req:cc': '묶는 스킬(CC)이 있어 효과가 자주 터져요',
  'req:dash': '돌진기가 있어 효과를 자주 써요',
  'req:ally': '아군을 돕는 스킬이 있어 효과가 커져요',
  'req:shield': '보호막 스킬이 있어 효과가 커져요',
  'req:heal': '회복·보호막 스킬이 있어 효과가 커져요',
  'req:channel': '정신 집중 스킬과 잘 맞아요',
  'req:summon': '소환물이 있어 함께 강해져요',
  'req:burn': '지속 피해 스킬과 잘 맞아요',
  'req:stack': '영구 중첩 스킬과 잘 맞아요',
  'req:knockback': '밀어내기 스킬과 잘 맞아요',
  'req:terrain': '지형 생성 스킬과 잘 맞아요',
  'req:spin': '회전 스킬과 잘 맞아요',
  'req:empower': '강화 평타 스킬과 잘 맞아요',
};
/**
 * 언제 더 좋은지: 증강 설명(게임 파일 원문)에 있는 말로만 판단한다. 위에서부터 처음 맞는 하나.
 * same: 이유(WHY)와 같은 말이면 겹치지 않게 건너뛴다
 */
const WHEN: { re: RegExp; text: string; same?: string[] }[] = [
  { re: /최대 체력[^.]*(피해|고정)/, text: '체력 많은 탱커를 상대할 때 특히 좋아요' },
  { re: /고정 피해/, text: '방어력·마법 저항력과 상관없이 들어가요' },
  { re: /(방어력|마법 저항력)[^.]*감소/, text: '단단한 적을 녹일 때 좋아요' },
  { re: /(체력이 낮은|잃은 체력)/, text: '마무리와 역전에 강해요' },
  { re: /영구/, text: '오래 쌓을수록 강해져요. 일찍 고를수록 좋아요' },
  { re: /무한히 (중첩|초기화)/, text: '오래 싸울수록 강해져요' },
  { re: /선택한 스킬/, text: '핵심 스킬 하나를 골라 집중해서 키워요' },
  { re: /아군/, text: '아군과 붙어 다닐 때 빛나요' },
  { re: /(주변 적|주변의 적|모든 적|광역)/, text: '적이 뭉친 한타에서 좋아요' },
  { re: /(둔화|기절|속박|공중에 띄|이동 불가)/, text: '적을 묶어 아군이 들어가기 쉬워져요' },
  { re: /보호막/, text: '한타에서 한 번 더 버텨요', same: ['tank'] },
  { re: /(회복|흡혈)/, text: '긴 교전에서 강해요', same: ['sustain'] },
  { re: /(스킬 가속|재사용 대기시간)/, text: '스킬을 자주 쓸수록 좋아요', same: ['haste', 'ability'] },
  { re: /이동 속도/, text: '치고 빠지기와 추격에 좋아요', same: ['mobile'] },
  { re: /공격 속도/, text: '평타를 많이 칠수록 좋아요', same: ['attack'] },
  { re: /사거리/, text: '먼저 때리고 안전하게 싸워요', same: ['ranged'] },
  { re: /사망 시/, text: '앞에서 먼저 싸우다 쓰러져도 손해가 적어요' },
  { re: /체력[^.]*(증가|얻)/, text: '쉽게 쓰러지지 않아요', same: ['tank', 'bruiser'] },
];

/** 왜 맞는지(챔피언 기준) + 언제 더 좋은지(증강 설명 기준). 둘 다 사람 말 한 줄 */
export function explainFit(c: ChampionProfile, a: MayhemAugment): { why: string; when: string | null; key: string | null } {
  const reqs = a.tags.filter((t) => REQUIRE[t]);
  const missing = reqs.find((t) => !REQUIRE[t].ok(c));
  const prefs = a.tags.filter((t) => AFFINITY[t]);
  const level = fitOf(c, a).level;
  // 성향이 안 맞을 때 쓰는 말 (가장 안 맞는 성향 기준)
  const weakWhy = () => {
    const worst = prefs.filter((t) => REASON[t]).sort((x, y) => AFFINITY[x](c) - AFFINITY[y](c))[0];
    return worst ? `${REASON[worst]({} as ChampionProfile)} 증강이라 이 챔피언에겐 효과가 작아요` : '이 챔피언에겐 효과가 작아요';
  };
  let why: string, key: string | null = null;
  if (missing) why = `${REQUIRE[missing].label}${iGa(REQUIRE[missing].label)} 없어 효과를 거의 못 봐요`;
  else if (level === 'weak') why = weakWhy();
  else if (reqs.length) { key = reqs[0]; why = WHY_REQ[reqs[0]] ?? `${REQUIRE[reqs[0]].label} 보유`; }
  else {
    // 가장 잘 맞는 성향 (범용·운은 다른 성향이 없을 때만)
    const ranked = prefs.filter((t) => WHY[t]).sort((x, y) => AFFINITY[y](c) - AFFINITY[x](c) || Number(x === 'any' || x === 'gamble') - Number(y === 'any' || y === 'gamble'));
    const best = ranked.find((t) => t !== 'any' && t !== 'gamble') ?? ranked[0];
    if (!best) why = '어느 챔피언이 써도 무난해요';
    else if (best === 'any' || best === 'gamble' || AFFINITY[best](c) >= 0.6) { key = best; why = WHY[best]; }
    else why = weakWhy();
  }
  // 잘 안 맞는 증강에는 '언제 좋은지'를 붙이지 않는다 (고를 이유처럼 보이지 않게)
  const when = missing || level === 'weak' ? null : WHEN.find((w) => w.re.test(a.desc) && !(key && w.same?.includes(key)))?.text ?? null;
  return { why, when, key };
}

/** 등급을 넘어서는 어울림: S 티어 실버는 골드급, S 티어 골드는 프리즘급 */
export const gradeUp = (rarity: Rarity, tier: FitTier): Rarity | null => (tier !== 'S' ? null : rarity === 'silver' ? 'gold' : rarity === 'gold' ? 'prismatic' : null);
