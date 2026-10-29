/**
 * 상점의 꾸밈 밖 상품과 칭호 (CLAUDE.md v3.99). 서버와 화면이 같은 표를 쓴다. 숫자는 여기 한 곳에서 바꾼다.
 *  - 인사이트권: 내 기록을 깊게 읽은 리포트를 7일 동안 연다. 리포트는 서버가 이용권을 확인한 뒤에만 계산해서 보낸다.
 *  - 도감 돋보기: 아직 안 해 본 챔프·증강 하나의 마스터 조건과 팁을 연다 (한 번 열면 계속).
 *  - 미션 다시 뽑기: 이번 주 미션 하나를 다른 미션으로 (주 2회). 다시 뽑은 미션은 뽑은 뒤의 판만 센다.
 *  - 선물: 앱을 쓰는 멤버끼리 꾸밈을 선물한다 (주는 사람이 값을 낸다). 디스코드에 알린다.
 *  - 명장면 액자: 쿼드라·펜타킬 판 하나를 내 페이지에 걸어 둔다.
 *  - 랜덤박스: 아직 없는 꾸밈 하나가 등급 확률대로 나온다 (칭호 제외, 겹치지 않는다).
 *  - 칭호: 상점에서 팔지 않는다. 미션·도감·활약으로 얻는다 (이미 산 칭호는 그대로 가진다).
 */
import { SHOP, type ShopItem, type ShopRarity } from './shop';

export const USE_PRICE = {
  insight: { aug: 150, partner: 150, golden: 120 },
  lens: 30,
  reroll: 30,
  box: 400,
  frame: 300,
} as const;
/** 인사이트권 하나로 열리는 기간 */
export const INSIGHT_DAYS = 7;
/** 미션 다시 뽑기: 주마다 */
export const REROLL_PER_WEEK = 2;
/** 선물 한마디 */
export const GIFT_NOTE_MAX = 40;

export type InsightKind = keyof typeof USE_PRICE.insight;
export const INSIGHTS: { id: InsightKind; name: string; desc: string; rarity: ShopRarity }[] = [
  { id: 'aug', name: '증강 습관 정밀 리포트', desc: '어떤 증강을 언제 골랐을 때 이기는지, 등급·성향·챔프별로', rarity: 'epic' },
  { id: 'partner', name: '베스트 파트너 TOP 3', desc: '함께하면 가장 잘 이기는 멤버 셋과 그 이유', rarity: 'epic' },
  { id: 'golden', name: '나의 골든타임', desc: '잘 이기는 시간대·요일, 몇 판째부터 흔들리는지', rarity: 'rare' },
];

/** 랜덤박스 등급 확률 (안 가진 꾸밈이 없는 등급은 빼고 나머지로 다시 나눈다) */
export const BOX_ODDS: Record<ShopRarity, number> = { common: 0.6, rare: 0.28, epic: 0.1, legendary: 0.02, mythic: 0 };
/** 랜덤박스에서 나올 수 있는 것: 칭호·신화를 뺀 꾸밈 중 아직 없는 것 (신화는 9,000 피스라 400 상자에서 나오면 값의 의미가 사라진다, v3.123) */
export const boxPool = (owned: Iterable<string>) => { const o = new Set(owned); return SHOP.filter((x) => x.slot !== 'title' && x.rarity !== 'mythic' && !o.has(x.id)); };
export function drawBox(pool: ShopItem[], rnd: () => number = Math.random): ShopItem | null {
  if (!pool.length) return null;
  const rars = (Object.keys(BOX_ODDS) as ShopRarity[]).filter((r) => pool.some((x) => x.rarity === r));
  const total = rars.reduce((s, r) => s + BOX_ODDS[r], 0);
  let k = rnd() * total, rar = rars[rars.length - 1];
  for (const r of rars) { if (k < BOX_ODDS[r]) { rar = r; break; } k -= BOX_ODDS[r]; }
  const items = pool.filter((x) => x.rarity === rar);
  return items[Math.floor(rnd() * items.length)] ?? items[0];
}

// ───────── 칭호 (상점에서 팔지 않고 얻는다) ─────────

/** 칭호 조건을 재는 내 기록 (서버가 모은다) */
export type TitleStats = {
  games: number;
  /** 밤 9시 ~ 새벽 3시(한국 시간)에 한 판 */
  night: number;
  /** 만난 챔프 수 */
  champs: number;
  dmgTop: number; takenTop: number; penta: number;
  champMasters: number; augMasters: number;
  /** 만난 프리즘 등급 증강 수 */
  prismAugs: number;
  /** 역할 개척 1단계(그 역할 챔프 3개)를 넘은 역할 수 */
  pioneerRoles: number;
};
export type TitleRule = { id: string; how: string; ok: (s: TitleStats) => boolean; progress: (s: TitleStats) => [number, number] };
const at = (k: keyof TitleStats, n: number, how: string, id: string): TitleRule => ({ id, how, ok: (s) => s[k] >= n, progress: (s) => [Math.min(s[k], n), n] });
export const TITLE_RULES: TitleRule[] = [
  at('games', 1, '첫 판을 기록하면', 'title-start'),
  at('games', 100, '100판을 기록하면', 'title-poro'),
  at('night', 50, '밤 9시~새벽 3시에 50판', 'title-night'),
  at('games', 300, '300판을 기록하면', 'title-bridge'),
  at('champs', 100, '서로 다른 챔프 100개를 만나면', 'title-dice'),
  at('dmgTop', 30, '피해량 1위 30번', 'title-teamfight'),
  at('takenTop', 30, '받은 피해 1위 30번', 'title-last'),
  at('pioneerRoles', 6, '여섯 역할 모두 챔프 3개씩 (미션 역할 개척)', 'title-allround'),
  at('augMasters', 1, '증강 하나를 도감 마스터하면', 'title-alchemist'),
  at('penta', 1, '첫 펜타킬', 'title-penta'),
  at('champMasters', 1, '챔프 하나를 도감 마스터하면', 'title-artisan'),
  at('prismAugs', 30, '프리즘 등급 증강 30개를 만나면', 'title-prism'),
  at('champMasters', 10, '챔프 10개를 도감 마스터하면', 'title-ruler'),
];
export const TITLE_RULE: Record<string, TitleRule> = Object.fromEntries(TITLE_RULES.map((r) => [r.id, r]));
export const earnedTitles = (s: TitleStats) => TITLE_RULES.filter((r) => r.ok(s)).map((r) => r.id);
