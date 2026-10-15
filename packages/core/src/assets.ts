/**
 * 이미지 주소. 아이콘은 앱·웹이 함께 묶어 넣은 /img (scripts/fetch-icons.mjs),
 * 큰 일러스트는 CommunityDragon 에서 바로 불러온다.
 */
const CDRAGON = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/';
export const cdragon = (p: string | null | undefined) => (p ? CDRAGON + p.replace('/lol-game-data/assets/', '').toLowerCase() : '');
export const champIcon = (id: number) => `/img/champ/${id}.png`;
export const augIcon = (id: number) => `/img/aug/${id}.png`;
import augCenters from '../data/aug-centers.json';
/** 아이콘 무늬를 가운데로 옮길 양 (그림 폭 대비 %, scripts/aug-centers.py). 게임 아이콘은 무늬가 가운데에 있지 않은 것이 많다 */
export const augShift = (id: number): [number, number] => ((augCenters as Record<string, number[]>)[id] as [number, number] | undefined) ?? [0, 0];
