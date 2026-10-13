/** 게임 데이터 (npm run data:mayhem 으로 생성). 앱·웹 모두 이 파일을 묶어 넣는다 */
import augData from '../data/mayhem-augments.json';
import champData from '../data/mayhem-champions.json';
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
