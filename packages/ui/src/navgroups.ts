/**
 * 메뉴 묶음 (CLAUDE.md v3.115). 메뉴가 늘어 한 줄로 길어진 것을 셋으로 나눈다 — 앱 사이드바·웹 상단·휴대폰 메뉴 공용.
 *  플레이 = 게임·챔프·증강 · 성장 = 도감·미션·랭킹 · 모임 = 멤버·소식·운영
 */
export const NAV_GROUPS: { key: string; label: string; paths: string[] }[] = [
  { key: 'play', label: '플레이', paths: ['/', '/champions', '/augments'] },
  { key: 'grow', label: '성장', paths: ['/dex', '/missions', '/ranking'] },
  { key: 'crew', label: '모임', paths: ['/crew', '/news', '/staff'] },
];

/** [주소, …] 목록을 묶음 순서대로 나눈다 (묶음에 없는 주소는 마지막 묶음 뒤에) */
export function groupNav<T extends [string, ...unknown[]]>(items: T[]): { key: string; label: string; items: T[] }[] {
  const out = NAV_GROUPS.map((g) => ({ key: g.key, label: g.label, items: items.filter((x) => g.paths.includes(x[0])) }));
  const rest = items.filter((x) => !NAV_GROUPS.some((g) => g.paths.includes(x[0])));
  if (rest.length) out[out.length - 1].items.push(...rest);
  return out.filter((g) => g.items.length);
}
