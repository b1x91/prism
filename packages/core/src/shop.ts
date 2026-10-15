/**
 * 피스(Prism 화폐)와 상점 (CLAUDE.md v3.24). 서버와 화면이 같은 표를 쓴다.
 *  - 버는 법: 기록된 판 · 이긴 판 · 모임 판(회원 2명 이상) · 도감 레벨 오르기 · 미션 · 매일 첫 접속 (함께 해요 참여는 예전 기록만)
 *  - 쓰는 곳: 내 페이지 꾸미기 (머리 테두리 · 머리 효과 · 이름 효과 · 칭호)
 * 숫자는 여기 한 곳에서 바꾼다. 번 피스는 기록에서 늘 다시 계산하므로 기준을 바꾸면 지난 기록에도 적용된다.
 */
import type { DexLevel } from './mastery';

export const PIECE = '피스';

export const EARN = {
  game: 10,
  win: 5,
  crew: 5,
  /** 함께 해요에서 연 판·내전에 참여하고 그 시간에 실제로 한 판 */
  together: 20,
  daily: 10,
} as const;

/** 도감 레벨에 오를 때마다 (챔피언·증강 각각). 누적: 실버 5 · 골드 15 · 플래티넘 35 · 다이아몬드 65 · 마스터 165 */
export const LEVEL_REWARD: Record<DexLevel, number> = { 0: 0, 1: 5, 2: 10, 3: 20, 4: 30, 5: 100 };
export const levelTotal = (l: DexLevel) => ([1, 2, 3, 4, 5] as DexLevel[]).filter((x) => x <= l).reduce<number>((s, x) => s + LEVEL_REWARD[x], 0);

export type ShopSlot = 'frame' | 'fx' | 'name' | 'title';
export const SLOT_KO: Record<ShopSlot, string> = { frame: '머리 테두리', fx: '머리 효과', name: '이름 효과', title: '칭호' };
export type ShopRarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITY_SHOP_KO: Record<ShopRarity, string> = { common: '일반', rare: '희귀', epic: '영웅', legendary: '전설' };
export type ShopItem = { id: string; slot: ShopSlot; name: string; price: number; desc: string; rarity: ShopRarity };

const it = (id: string, slot: ShopSlot, rarity: ShopRarity, price: number, name: string, desc: string): ShopItem => ({ id, slot, rarity, price, name, desc });
export const SHOP: ShopItem[] = [
  // 머리 테두리: 얼굴 테두리 + 머리 아래 빛 띠
  it('frame-silver', 'frame', 'common', 200, '은빛 테두리', '단정한 은빛으로 얼굴을 두른다'),
  it('frame-gold', 'frame', 'rare', 400, '금빛 테두리', '묵직한 금빛 테두리와 금빛 띠'),
  it('frame-jade', 'frame', 'rare', 450, '비취 테두리', '맑은 초록빛 비취 테두리'),
  it('frame-ember', 'frame', 'epic', 700, '불꽃 테두리', '숨 쉬듯 타오르는 붉은 테두리'),
  it('frame-frost', 'frame', 'epic', 700, '서리 테두리', '얼음 결정처럼 차갑게 빛난다'),
  it('frame-void', 'frame', 'epic', 800, '공허 테두리', '보랏빛 어둠이 천천히 일렁인다'),
  it('frame-starlight', 'frame', 'legendary', 1200, '별빛 테두리', '밤하늘 테두리에 별이 반짝인다'),
  it('frame-prism', 'frame', 'legendary', 1500, '프리즘 테두리', '스펙트럼이 얼굴을 따라 돈다'),
  // 머리 효과: 머리 전체에 흐르는 움직임
  it('fx-sparkle', 'fx', 'common', 300, '반짝임', '머리 곳곳에 작은 빛이 반짝인다'),
  it('fx-snow', 'fx', 'rare', 450, '눈송이', '하얀 눈이 조용히 내린다'),
  it('fx-petals', 'fx', 'rare', 500, '꽃잎', '분홍 꽃잎이 바람에 흩날린다'),
  it('fx-fireflies', 'fx', 'epic', 650, '반딧불', '노란 빛이 둥실 떠다닌다'),
  it('fx-embers', 'fx', 'epic', 700, '불씨', '불씨가 아래에서 위로 솟는다'),
  it('fx-rays', 'fx', 'epic', 800, '빛살', '뒤에서 빛줄기가 천천히 돈다'),
  it('fx-aurora', 'fx', 'legendary', 1100, '오로라', '초록·보랏빛 오로라가 흐른다'),
  it('fx-meteor', 'fx', 'legendary', 1300, '별똥별', '별똥별이 비스듬히 떨어진다'),
  // 이름 효과 (무지개 글자는 쓰지 않는다 — 1.5절)
  it('name-glow', 'name', 'common', 200, '빛나는 이름', '이름이 은은하게 빛난다'),
  it('name-silver', 'name', 'rare', 350, '은빛 이름', '금속처럼 매끈한 은빛'),
  it('name-gold', 'name', 'rare', 450, '금빛 이름', '무게감 있는 금빛'),
  it('name-ember', 'name', 'epic', 650, '불꽃 이름', '붉게 달아오른 이름'),
  it('name-frost', 'name', 'epic', 650, '서리 이름', '얼음처럼 푸른 이름'),
  it('name-galaxy', 'name', 'legendary', 1000, '은하 이름', '푸른 은하가 이름 위로 흐른다'),
  // 칭호: 이름 위 한 줄
  it('title-night', 'title', 'common', 150, '밤의 단골', '오늘 밤도 한 판'),
  it('title-poro', 'title', 'common', 150, '포로 친구', '다리 위의 작은 친구들과 함께'),
  it('title-start', 'title', 'common', 200, '전설의 시작', '모든 장인은 첫 판부터'),
  it('title-bridge', 'title', 'rare', 300, '다리 위의 산책자', '울부짖는 심연이 내 집'),
  it('title-teamfight', 'title', 'rare', 350, '한타의 중심', '싸움은 늘 내 곁에서'),
  it('title-dice', 'title', 'rare', 350, '주사위의 신', '무작위도 내 편'),
  it('title-last', 'title', 'rare', 400, '끝까지 버티는 자', '마지막까지 서 있는 사람'),
  it('title-alchemist', 'title', 'epic', 500, '증강 연금술사', '어떤 증강도 금으로'),
  it('title-penta', 'title', 'epic', 600, '펜타킬 사냥꾼', '다섯은 기본'),
  it('title-ruler', 'title', 'legendary', 800, '칼바람의 지배자', '이 다리의 주인'),
  it('title-prism', 'title', 'legendary', 1000, '프리즘 수집가', '빛을 모으는 사람'),
];
export const SHOP_ITEM: Record<string, ShopItem> = Object.fromEntries(SHOP.map((x) => [x.id, x]));

/** 장착한 꾸밈 (칸마다 하나) */
export type Deco = Partial<Record<ShopSlot, string>>;
export function parseDeco(s: string | null | undefined): Deco {
  if (!s) return {};
  try {
    const d = JSON.parse(s) as Record<string, unknown>;
    const out: Deco = {};
    for (const k of Object.keys(SLOT_KO) as ShopSlot[]) { const v = d[k]; if (typeof v === 'string' && SHOP_ITEM[v]?.slot === k) out[k] = v; }
    return out;
  } catch { return {}; }
}

/** 번 피스 내역 */
/** missions: 미션으로 번 피스 (core/missions.ts) */
export type Earned = { games: number; wins: number; crew: number; levels: number; together: number; daily: number; missions?: number };
export const earnedTotal = (e: Earned) => e.games * EARN.game + e.wins * EARN.win + e.crew * EARN.crew + e.levels + e.together * EARN.together + e.daily * EARN.daily + (e.missions ?? 0);

export type Shop = { balance: number; earned: Earned; spent: number; owned: string[]; deco: Deco; shared: boolean };

/** 공개 링크로 보는 그 사람의 강점 (모임 정보 없음) */
export type PublicProfile = {
  id: string; nick: string; intro: string; skin: number | null; deco: Deco;
  total: { n: number; w: number; k: number; d: number; a: number };
  best: { id: number; n: number; w: number }[];
  masters: number[];
  levels: Record<DexLevel, number>;
  feats: { penta: number; quadra: number; dmgTop: number; takenTop: number };
  /** 챔피언별 판·승·KDA (역할·성향 계산용) */
  champions: { id: number; n: number; w: number; k: number; d: number; a: number }[];
};

/** 공개 웹 주소 (공유 링크는 웹으로: 앱이 없어도 열린다) */
export const SITE_URL = 'https://przm.web.app';
export const shareUrl = (id: string) => `${SITE_URL}/p/${encodeURIComponent(id)}`;
