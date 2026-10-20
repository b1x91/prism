/** 게임 데이터 (npm run data:mayhem 으로 생성). 앱·웹 모두 이 파일을 묶어 넣는다 */
import augData from '../data/mayhem-augments.json';
import champData from '../data/mayhem-champions.json';
import itemData from '../data/items.json';
import type { ChampionProfile, MayhemAugment } from './synergy';

export const DATA_VERSION = (augData.version as string).split('.').slice(0, 2).join('.');
export const AUGMENTS = augData.augments as MayhemAugment[];

/**
 * 패치 사이 (v3.101): 데이터에는 라이브 증강 + 다음 패치에 나올 증강(added) + 빠질·빠진 증강(removed)이 함께 있다.
 * 다음 패치가 적용되는 시각(next.at, 한국 서버 점검이 끝나는 때)을 지나면 저절로 넘어간다 — 다시 배포하지 않아도.
 */
export const NEXT_PATCH = ((augData as { next?: { version: string; at: number | null } }).next ?? null);
export const patchLive = (now = Date.now()) => !NEXT_PATCH || (NEXT_PATCH.at != null && now >= NEXT_PATCH.at);
const LIVE = patchLive();
/** 지금 게임에서 실제로 나오는 증강인지 */
export const inGame = (a: MayhemAugment) => {
  if (a.disabled) return false;
  if (a.added && NEXT_PATCH && a.added === NEXT_PATCH.version && !LIVE) return false; // 아직 안 나옴
  if (a.removed && !(NEXT_PATCH && a.removed === NEXT_PATCH.version && !LIVE)) return false; // 이미 빠짐
  return true;
};
/** 다음 패치에 나올 예정 (아직 게임에 없음) */
export const isUpcoming = (a: MayhemAugment) => Boolean(a.added && NEXT_PATCH && a.added === NEXT_PATCH.version && !LIVE && !a.disabled);
/** 다음 패치에서 빠질 예정 (아직 게임에 있음) */
export const isLeaving = (a: MayhemAugment) => Boolean(a.removed && NEXT_PATCH && a.removed === NEXT_PATCH.version && !LIVE);
/** 가장 최근 패치에 새로 나온(나올) 증강 — '새로운 증강' 거르기 */
export const NEWEST_PATCH = AUGMENTS.reduce<string | null>((m, a) => (a.added && (!m || verNewer(a.added, m)) ? a.added : m), null);
export const isNewAugment = (a: MayhemAugment) => Boolean(NEWEST_PATCH && a.added === NEWEST_PATCH && !a.disabled && !a.removed);
function verNewer(a: string, b: string) { const [x, y] = [a.split('.').map(Number), b.split('.').map(Number)]; return x[0] !== y[0] ? x[0] > y[0] : x[1] > y[1]; }
/** 지금 게임에 있는 증강 (가이드·3개 비교·추천·도감 목표) */
export const ACTIVE_AUGMENTS = AUGMENTS.filter(inGame);
/** 증강 탭 목록: 지금 게임에 있는 것 + 곧 나올 것 */
export const LISTED_AUGMENTS = AUGMENTS.filter((a) => inGame(a) || isUpcoming(a));
export const AUGMENT = Object.fromEntries(AUGMENTS.map((a) => [a.id, a])) as Record<number, MayhemAugment>;
export const CHAMPIONS = champData.champions as unknown as Record<number, ChampionProfile>;
export const CHAMPION_LIST = Object.entries(CHAMPIONS)
  .map(([id, c]) => ({ id: Number(id), ...c }))
  .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
export const GAME_DATA = { augments: ACTIVE_AUGMENTS, champions: CHAMPIONS };

/** 아이템 이름·아이콘·가격 (npm run data:items) */
export type ItemInfo = { name: string; icon: string; price: number };
export const ITEM: Record<number, ItemInfo> = Object.fromEntries(
  Object.entries(itemData.items as unknown as Record<string, [string, string, number]>).map(([id, [name, icon, price]]) => [Number(id), { name, icon, price }]),
);

/** 아이템 능력치·효과 (마우스를 올렸을 때만 필요해서 따로 불러온다) */
export type ItemDetail = { stats: string[]; effects: [string, string][] };
let itemDetail: Promise<Record<number, ItemDetail>> | null = null;
export function loadItemDetail(): Promise<Record<number, ItemDetail>> {
  itemDetail ??= import('../data/items-detail.json').then((m) => {
    const raw = ((m.default ?? m) as unknown as { items: Record<string, [string[], [string, string][]]> }).items;
    return Object.fromEntries(Object.entries(raw).map(([id, [stats, effects]]) => [Number(id), { stats, effects }]));
  });
  return itemDetail;
}
