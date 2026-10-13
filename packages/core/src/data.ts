/** 게임 데이터 (npm run data:mayhem 으로 생성). 앱·웹 모두 이 파일을 묶어 넣는다 */
import augData from '../data/mayhem-augments.json';
import champData from '../data/mayhem-champions.json';
import itemData from '../data/items.json';
import type { ChampionProfile, MayhemAugment } from './synergy';

export const DATA_VERSION = (augData.version as string).split('.').slice(0, 2).join('.');
export const AUGMENTS = augData.augments as MayhemAugment[];
export const ACTIVE_AUGMENTS = AUGMENTS.filter((a) => !a.disabled);
export const AUGMENT = Object.fromEntries(AUGMENTS.map((a) => [a.id, a])) as Record<number, MayhemAugment>;
export const CHAMPIONS = champData.champions as unknown as Record<number, ChampionProfile>;
export const CHAMPION_LIST = Object.entries(CHAMPIONS)
  .map(([id, c]) => ({ id: Number(id), ...c }))
  .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
export const GAME_DATA = { augments: AUGMENTS, champions: CHAMPIONS };

/** 아이템 이름·아이콘·가격 (npm run data:items) */
export type ItemInfo = { name: string; icon: string; price: number };
export const ITEM: Record<number, ItemInfo> = Object.fromEntries(
  Object.entries(itemData.items as unknown as Record<string, [string, string, number]>).map(([id, [name, icon, price]]) => [Number(id), { name, icon, price }]),
);
