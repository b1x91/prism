/**
 * 프로필 스킨 등급과 해금 기준 (Prism 에 기록된 내 판 수). 서버도 이 표로 검사한다.
 * 비싼 스킨일수록 많이 해야 쓸 수 있다. 숫자를 바꾸면 웹·앱·서버가 함께 바뀐다.
 */
export const SKIN_TIERS = [
  { name: '기본', need: 0 },
  { name: '일반', need: 5 },
  { name: '에픽', need: 15 },
  { name: '전설', need: 40 },
  { name: '신화', need: 80 },
  { name: '궁극', need: 150 },
  { name: '초월', need: 250 },
] as const;

export const skinNeed = (tier: number) => SKIN_TIERS[Math.max(0, Math.min(SKIN_TIERS.length - 1, tier))].need;
export const skinChampion = (skinId: number) => Math.floor(skinId / 1000);
