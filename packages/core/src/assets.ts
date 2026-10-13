/**
 * 이미지 주소. 아이콘은 앱·웹이 함께 묶어 넣은 /img (scripts/fetch-icons.mjs),
 * 큰 일러스트는 CommunityDragon 에서 바로 불러온다.
 */
const CDRAGON = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/';
export const cdragon = (p: string | null | undefined) => (p ? CDRAGON + p.replace('/lol-game-data/assets/', '').toLowerCase() : '');
export const champIcon = (id: number) => `/img/champ/${id}.png`;
export const augIcon = (id: number) => `/img/aug/${id}.png`;
