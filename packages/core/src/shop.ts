/**
 * 피스(Prism 화폐)와 상점 (CLAUDE.md v3.24). 서버와 화면이 같은 표를 쓴다.
 *  - 버는 법: 기록된 판 · 이긴 판 · 모임 판(회원 2명 이상) · 도감 레벨 오르기 · 함께 해요 참여 · 매일 첫 접속
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
export type ShopItem = { id: string; slot: ShopSlot; name: string; price: number; desc: string };

export const SHOP: ShopItem[] = [
  { id: 'frame-gold', slot: 'frame', name: '금빛 테두리', price: 300, desc: '머리와 얼굴을 금빛으로 두른다' },
  { id: 'frame-ember', slot: 'frame', name: '불꽃 테두리', price: 600, desc: '붉게 타오르는 테두리' },
  { id: 'frame-frost', slot: 'frame', name: '서리 테두리', price: 600, desc: '차갑게 빛나는 푸른 테두리' },
  { id: 'frame-prism', slot: 'frame', name: '프리즘 테두리', price: 1200, desc: '스펙트럼이 천천히 돈다' },
  { id: 'fx-sparkle', slot: 'fx', name: '반짝임', price: 400, desc: '머리 위로 작은 빛이 반짝인다' },
  { id: 'fx-petals', slot: 'fx', name: '꽃잎', price: 500, desc: '꽃잎이 천천히 흩날린다' },
  { id: 'fx-rays', slot: 'fx', name: '빛살', price: 700, desc: '뒤에서 빛줄기가 퍼진다' },
  { id: 'fx-aurora', slot: 'fx', name: '오로라', price: 900, desc: '머리 위로 오로라가 흐른다' },
  { id: 'name-glow', slot: 'name', name: '빛나는 이름', price: 250, desc: '이름이 은은하게 빛난다' },
  { id: 'name-gold', slot: 'name', name: '금빛 이름', price: 400, desc: '이름을 금빛으로' },
  { id: 'name-galaxy', slot: 'name', name: '은하 이름', price: 800, desc: '이름에 푸른 은하가 흐른다' },
  { id: 'title-night', slot: 'title', name: '밤의 단골', price: 200, desc: '이름 위 한 줄 칭호' },
  { id: 'title-start', slot: 'title', name: '전설의 시작', price: 200, desc: '이름 위 한 줄 칭호' },
  { id: 'title-teamfight', slot: 'title', name: '한타의 중심', price: 350, desc: '이름 위 한 줄 칭호' },
  { id: 'title-alchemist', slot: 'title', name: '증강 연금술사', price: 450, desc: '이름 위 한 줄 칭호' },
  { id: 'title-ruler', slot: 'title', name: '칼바람의 지배자', price: 600, desc: '이름 위 한 줄 칭호' },
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
export type Earned = { games: number; wins: number; crew: number; levels: number; together: number; daily: number };
export const earnedTotal = (e: Earned) => e.games * EARN.game + e.wins * EARN.win + e.crew * EARN.crew + e.levels + e.together * EARN.together + e.daily * EARN.daily;

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
