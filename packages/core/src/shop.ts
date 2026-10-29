/**
 * 피스(Prism 화폐)와 상점 (CLAUDE.md v3.24). 서버와 화면이 같은 표를 쓴다.
 *  - 버는 법: 기록된 판 · 이긴 판 · 모임 판(회원 2명 이상) · 도감 레벨 오르기 · 미션 · 매일 첫 접속 (함께 해요 참여는 예전 기록만)
 *  - 쓰는 곳: 내 페이지 꾸미기 (배경 · 머리 테두리 · 머리 효과 · 이름 효과 · 칭호). 배경은 랭킹의 내 줄에도 깔린다 (v3.34)
 * 숫자는 여기 한 곳에서 바꾼다. 번 피스는 기록에서 늘 다시 계산하므로 기준을 바꾸면 지난 기록에도 적용된다.
 */
import type { DexLevel } from './mastery';
import { RUN_GAP } from './praise';

export const PIECE = '피스';

export const EARN = {
  game: 3,
  win: 2,
  crew: 2,
  /** 함께 해요에서 연 판·내전에 참여하고 그 시간에 실제로 한 판 (예전 기록만) */
  together: 20,
} as const;

/**
 * 출석 (v3.120): 매일 첫 접속. 이어서 올수록 커진다 — 1일째 5 · 2일째 7 · … · 6일째부터 15 (하루라도 빠지면 1일째부터).
 * 7·14·30·60·100일째에는 보너스. 출석 날짜만 남기고 피스는 늘 다시 계산한다.
 */
export const ATTEND = { base: 5, step: 2, cap: 15, milestones: { 7: 20, 14: 30, 30: 60, 60: 100, 100: 200 } as Record<number, number> } as const;
export const attendBase = (streak: number) => Math.min(ATTEND.base + ATTEND.step * (Math.max(1, streak) - 1), ATTEND.cap);
export const attendReward = (streak: number) => attendBase(streak) + (ATTEND.milestones[streak] ?? 0);
/** 출석 연출 단계 1~5: 1~2일 · 3~6일 · 7~13일 · 14~29일 · 30일부터 */
export const attendStage = (streak: number): 1 | 2 | 3 | 4 | 5 => (streak >= 30 ? 5 : streak >= 14 ? 4 : streak >= 7 ? 3 : streak >= 3 ? 2 : 1);
const dayNo = (d: string) => Math.floor(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000);
/** 출석 날짜('YYYY-MM-DD', 한국 날짜)들 → 마지막 날의 연속 일수와 모든 날의 출석 피스 합 */
export function attendOf(days: string[]): { streak: number; total: number } {
  const ns = [...new Set(days)].map(dayNo).sort((a, b) => a - b);
  let streak = 0, total = 0;
  for (let i = 0; i < ns.length; i++) {
    streak = i > 0 && ns[i] - ns[i - 1] === 1 ? streak + 1 : 1;
    total += attendReward(streak);
  }
  return { streak, total };
}

/**
 * 예전 피스 기준 (v3.120 전). 기준을 바꾼 순간의 잔액을 그대로 지키려고 회원마다 한 번 계산해 적어 둔다 (piece_snapshot).
 * 그 뒤에 버는 것만 새 기준.
 */
export const LEGACY = {
  game: 10, win: 5, crew: 5, together: 20, daily: 10,
  run: { step: 2, max: 10 },
  level: { 0: 0, 1: 5, 2: 10, 3: 20, 4: 30, 5: 100 } as Record<DexLevel, number>,
  /** 예전 미션 보상은 지금의 두 배 (지금 값은 절반으로 내렸다) */
  missionMult: 2,
} as const;

/** 친구 초대 보너스 (v3.107): 초대한 친구가 운영진 승인을 받으면 한 명마다. 단계 배율을 곱하지 않는 고정값 */
export const INVITE_BONUS = 300;

/** #PRSM 태그 보상 (v3.116): 롤 닉네임 태그가 #PRSM 이면 한 번만. 배율 밖 고정값, 받은 뒤 태그를 바꿔도 그대로 */
export const TAG_BONUS = { tag: 'PRSM', pieces: 5000 } as const;
export const hasPrismTag = (riotId: string | null | undefined) => typeof riotId === 'string' && riotId.split('#')[1]?.trim().toUpperCase() === TAG_BONUS.tag;

/**
 * 함께 연판 (v3.83): 멤버 2명 이상인 판을 이어서(다음 판이 50분 안에 시작) 할수록 판마다 더 준다.
 * 이어진 k번째 판 = step × (k − 1) — 2번째 +2 · 3번째 +4 · … · 10번째 +18, 10연판부터는 매 판 +18 그대로. 10연판 한 번이면 +90.
 */
export const RUN_BONUS = { step: 1, max: 5 } as const;
export function runBonusOf(times: number[], rb: { step: number; max: number } = RUN_BONUS) {
  const t = [...times].sort((a, b) => a - b);
  let sum = 0, k = 0;
  for (let i = 0; i < t.length; i++) {
    k = i > 0 && t[i] - t[i - 1] <= RUN_GAP ? k + 1 : 1;
    sum += rb.step * (Math.min(k, rb.max) - 1);
  }
  return sum;
}

/** 도감 레벨에 오를 때마다 (챔프·증강·아이템 각각, v3.120). 누적: 실버 0 · 골드 3 · 플래티넘 13 · 다이아몬드 33 · 마스터 93 */
export const LEVEL_REWARD: Record<DexLevel, number> = { 0: 0, 1: 0, 2: 3, 3: 10, 4: 20, 5: 60 };
export const levelTotal = (l: DexLevel, table: Record<DexLevel, number> = LEVEL_REWARD) => ([1, 2, 3, 4, 5] as DexLevel[]).filter((x) => x <= l).reduce<number>((s, x) => s + table[x], 0);

export type ShopSlot = 'bg' | 'frame' | 'fx' | 'name' | 'title';
export const SLOT_KO: Record<ShopSlot, string> = { bg: '배경', frame: '머리 테두리', fx: '머리 효과', name: '이름 효과', title: '칭호' };
export type ShopRarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITY_SHOP_KO: Record<ShopRarity, string> = { common: '일반', rare: '희귀', epic: '영웅', legendary: '전설' };
export type ShopItem = { id: string; slot: ShopSlot; name: string; price: number; desc: string; rarity: ShopRarity };

const it = (id: string, slot: ShopSlot, rarity: ShopRarity, price: number, name: string, desc: string): ShopItem => ({ id, slot, rarity, price, name, desc });
export const SHOP: ShopItem[] = [
  // 배경: 머리 뒤 그림 대신 깔리는 장면 (얼굴은 그대로 대표 스킨). 랭킹의 내 줄에도
  it('bg-dawn', 'bg', 'common', 300, '새벽 다리', '남색 하늘 끝이 분홍빛으로 밝아 온다'),
  it('bg-abyss', 'bg', 'common', 300, '울부짖는 심연', '차가운 푸른 안개가 깔린 다리'),
  it('bg-dusk', 'bg', 'common', 350, '노을 협곡', '붉은 노을이 지평선에 걸린다'),
  it('bg-starry', 'bg', 'rare', 600, '별 내리는 밤', '깊은 밤하늘에 별과 성운이 반짝인다'),
  it('bg-magma', 'bg', 'rare', 650, '용암 균열', '검은 바위 틈으로 용암이 숨 쉰다'),
  it('bg-crystal', 'bg', 'epic', 1000, '수정 동굴', '푸른 수정 결정 사이로 빛이 스친다'),
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
  // 칭호: 이름 위 한 줄. 상점에서 팔지 않고 미션·도감·활약으로 얻는다 (v3.99, 조건은 goods.ts TITLE_RULES). 값은 예전에 산 기록용
  it('title-night', 'title', 'common', 150, '밤의 단골', '오늘 밤도 한 판'),
  it('title-poro', 'title', 'common', 150, '포로 친구', '다리 위의 작은 친구들과 함께'),
  it('title-start', 'title', 'common', 200, '전설의 시작', '모든 장인은 첫 판부터'),
  it('title-bridge', 'title', 'rare', 300, '다리 위의 산책자', '울부짖는 심연이 내 집'),
  it('title-teamfight', 'title', 'rare', 350, '한타의 중심', '싸움은 늘 내 곁에서'),
  it('title-dice', 'title', 'rare', 350, '주사위의 신', '무작위도 내 편'),
  it('title-last', 'title', 'rare', 400, '끝까지 버티는 자', '마지막까지 서 있는 사람'),
  it('title-allround', 'title', 'epic', 500, '다재다능', '어느 역할이든 맡겨 줘'),
  it('title-alchemist', 'title', 'epic', 500, '증강 연금술사', '어떤 증강도 금으로'),
  it('title-artisan', 'title', 'epic', 600, '장인의 길', '한 챔프를 끝까지'),
  it('title-penta', 'title', 'epic', 600, '펜타킬 사냥꾼', '다섯은 기본'),
  it('title-ruler', 'title', 'legendary', 800, '칼바람의 지배자', '이 다리의 주인'),
  it('title-prism', 'title', 'legendary', 1000, '프리즘 수집가', '빛을 모으는 사람'),
];
/** 상점에서 파는 것 (칭호는 얻는 것, v3.99) */
export const forSale = (x: ShopItem) => x.slot !== 'title';
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
export type Earned = { games: number; wins: number; crew: number; levels: number; together: number; daily: number; missions?: number; run?: number;
  /** 출석 피스 (연속 출석으로 커진다, v3.120) · 지금 연속 일수 */ attend?: number; streak?: number;
  /** 예전 기준으로 다시 센 값 (기준을 바꾸는 순간 한 번 적어 두는 데만 쓴다) */ legacy?: { levels: number; run: number; missions: number }; /** 승인된 초대 친구 수 (보너스는 배율 밖, INVITE_BONUS) */ invites?: number; /** #PRSM 태그 보상을 받았는지 (TAG_BONUS, 배율 밖) */ tag?: boolean };
export const earnedTotal = (e: Earned) => e.games * EARN.game + e.wins * EARN.win + e.crew * EARN.crew + e.levels + e.together * EARN.together + (e.attend ?? 0) + (e.missions ?? 0) + (e.run ?? 0);
/** 예전 기준 합 (piece_snapshot 용) */
export const legacyTotal = (e: Earned) => e.games * LEGACY.game + e.wins * LEGACY.win + e.crew * LEGACY.crew + (e.legacy?.levels ?? 0) + e.together * LEGACY.together + e.daily * LEGACY.daily + (e.legacy?.missions ?? 0) + (e.legacy?.run ?? 0);

export type Shop = {
  balance: number; earned: Earned; spent: number; owned: string[]; deco: Deco; shared: boolean; rates?: import('./api').Rates;
  /** 꾸밈 밖 상품 (v3.99) — 예전 서버는 보내지 않는다 */
  uses?: ShopUses;
};
export type ShopUses = {
  /** 인사이트권: 종류 → 끝나는 시각 (없거나 지났으면 닫힘) */
  insight: Partial<Record<import('./goods').InsightKind, number>>;
  /** 연 도감 돋보기: 'c:챔프' · 'a:증강' */
  lens: string[];
  /** 명장면 액자를 가졌나 · 걸어 둔 판 */
  frame: boolean; pinned: number | null;
  /** 이번 주 남은 미션 다시 뽑기 */
  rerollsLeft: number;
  /** 얻은 칭호 (조건을 채운 것) + 칭호마다 진행 [지금, 목표] */
  titles: string[]; titleProgress: Record<string, [number, number]>;
  /** 나는 앱을 쓰는 멤버인가 (선물은 앱 사용자끼리) */
  app: boolean;
  /** 최근 받은 선물 */
  gifts: { item: string; from: string; fromNick: string; note: string | null; at: number }[];
};
/** 특별회원 할인 가격 (서버와 같은 계산) */
export const priceWith = (price: number, discount = 0) => Math.round(price * (1 - discount));

/** 공개 링크로 보는 그 사람의 강점 (모임 정보 없음) */
export type PublicProfile = {
  id: string; nick: string; intro: string; skin: number | null; deco: Deco;
  total: { n: number };
  /** 가장 많이 한 챔프 (대표 스킨이 없을 때 머리 그림) */
  main: number | null;
  masters: number[];
  levels: Record<DexLevel, number>;
  feats: { penta: number; quadra: number; dmgTop: number; takenTop: number };
};

/** 공개 웹 주소 (공유 링크는 웹으로: 앱이 없어도 열린다) */
export const SITE_URL = 'https://przm.web.app';
/** 공유 링크: 짧은 번호 (`/p/123`, v3.34) */
export const shareUrl = (code: string | number) => `${SITE_URL}/p/${encodeURIComponent(String(code))}`;
