/**
 * 메뉴 묶음 (CLAUDE.md v3.115 → v3.142). 앱 사이드바·웹 상단·휴대폰 메뉴 공용.
 *  게임 = 분석·챔프·증강 · 성장 · 모임 = 성장(도감·미션·랭킹) · 모임(멤버·소식·초대) · 운영
 * 같은 계열 화면은 메뉴 하나(허브)로 묶고, 그 안에서 탭으로 오간다. 문의는 내 메뉴·설정으로.
 */
import type { IconName } from './icons';

export type HubTab = { to: string; label: string; icon: IconName; hint: string };
export type Hub = { key: string; label: string; icon: IconName; tabs: HubTab[] };

/** 허브: 메뉴 하나 = 화면 여러 개 (탭). 주소는 그대로 둔다 */
export const HUBS: Hub[] = [
  { key: 'grow', label: '성장', icon: 'sprout', tabs: [
    { to: '/dex', label: '도감', icon: 'book', hint: '만난 챔프·증강·아이템을 모아요' },
    { to: '/missions', label: '미션', icon: 'target', hint: '이번 주 미션·도전 보상' },
    { to: '/ranking', label: '랭킹', icon: 'trophy', hint: 'Prism 점수 순위·장인' },
  ] },
  { key: 'crew', label: '모임', icon: 'users', tabs: [
    { to: '/crew', label: '멤버', icon: 'users', hint: '지금 접속·NOW·아카이브' },
    { to: '/news', label: '소식', icon: 'megaphone', hint: '공지·이벤트·업데이트' },
    { to: '/invite', label: '초대', icon: 'gift', hint: '친구를 부르면 300 피스' },
  ] },
];

export const NAV_GROUPS: { key: string; label: string; paths: string[] }[] = [
  { key: 'play', label: '게임', paths: ['/', '/champions', '/augments'] },
  { key: 'more', label: '성장 · 모임', paths: ['/dex', '/crew', '/staff'] },
];

/** 이 주소가 속한 허브 (상세 주소 /ranking/… 포함) */
export function hubOf(path: string): Hub | null {
  return HUBS.find((h) => h.tabs.some((t) => path === t.to || path.startsWith(`${t.to}/`))) ?? null;
}
/** 메뉴 항목 주소가 허브의 첫 탭이면 그 허브 */
export const hubAt = (to: string): Hub | null => HUBS.find((h) => h.tabs[0].to === to) ?? null;

const KEY = (h: Hub) => `prism-hub-${h.key}`;
/** 허브 메뉴를 누르면 그 허브에서 마지막으로 본 탭으로 */
export function hubHref(h: Hub, allowed?: (to: string) => boolean): string {
  try {
    const v = localStorage.getItem(KEY(h));
    if (v && h.tabs.some((t) => t.to === v) && (!allowed || allowed(v))) return v;
  } catch { /* 저장 막힘 */ }
  return h.tabs[0].to;
}
export function rememberHub(path: string): void {
  const h = hubOf(path);
  const t = h?.tabs.find((x) => path === x.to || path.startsWith(`${x.to}/`));
  if (h && t) { try { localStorage.setItem(KEY(h), t.to); } catch { /* 저장 막힘 */ } }
}

/** [주소, …] 목록을 묶음 순서대로 나눈다 (묶음에 없는 주소는 마지막 묶음 뒤에) */
export function groupNav<T extends [string, ...unknown[]]>(items: T[]): { key: string; label: string; items: T[] }[] {
  const out = NAV_GROUPS.map((g) => ({ key: g.key, label: g.label, items: items.filter((x) => g.paths.includes(x[0])) }));
  const rest = items.filter((x) => !NAV_GROUPS.some((g) => g.paths.includes(x[0])));
  if (rest.length) out[out.length - 1].items.push(...rest);
  return out.filter((g) => g.items.length);
}
