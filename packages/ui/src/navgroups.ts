/**
 * 메뉴 묶음 (CLAUDE.md v3.115 → v3.142). 앱 사이드바·웹 상단·휴대폰 메뉴 공용.
 *  게임 = 분석·챔프·증강·랭킹 · 성장(도감·미션) · 모임(멤버·소식·초대) · 운영 (v3.173: 랭킹은 허브 밖 주요 메뉴)
 * 같은 계열 화면은 메뉴 하나(허브)로 묶고, 그 안에서 탭으로 오간다. 문의는 내 메뉴·설정으로.
 */
import type { IconName } from './icons';

export type HubTab = { to: string; label: string; icon: IconName; hint: string; /** 이 탭으로 보는 다른 주소 (예: 할 일 › 가입 신청 전체 보드) */ also?: string[] };
export type Hub = { key: string; label: string; icon: IconName; tabs: HubTab[] };

/** 허브: 메뉴 하나 = 화면 여러 개 (탭). 주소는 그대로 둔다 */
export const HUBS: Hub[] = [
  { key: 'grow', label: '성장', icon: 'sprout', tabs: [
    { to: '/dex', label: '도감', icon: 'book', hint: '만난 챔프·증강·아이템을 모아요' },
    { to: '/missions', label: '미션', icon: 'target', hint: '이번 주 미션·도전 보상' },
  ] },
  { key: 'crew', label: '모임', icon: 'users', tabs: [
    { to: '/crew', label: '멤버', icon: 'users', hint: '지금 접속·NOW·아카이브' },
    { to: '/news', label: '소식', icon: 'megaphone', hint: '공지·이벤트·업데이트' },
    { to: '/invite', label: '초대', icon: 'gift', hint: '친구를 부르면 300 피스' },
  ] },
  // 운영 (v3.160, 운영진만 — 메뉴 자체가 운영진에게만 보인다)
  { key: 'staff', label: '운영', icon: 'shield', tabs: [
    { to: '/staff', label: '대시보드', icon: 'chart', hint: '이번 주 Prism 현황' },
    { to: '/staff/members', label: '멤버', icon: 'users', hint: '전체 멤버 · 단계 · 특별회원' },
    { to: '/staff/todo', label: '할 일', icon: 'check', hint: '승인 대기 · 정회원 심사 · 가입 신청', also: ['/staff/join'] },
    { to: '/staff/inquiries', label: '문의', icon: 'talk', hint: '문의 묶음 · 바로 답장' },
  ] },
];

export const NAV_GROUPS: { key: string; label: string; paths: string[] }[] = [
  { key: 'play', label: '게임', paths: ['/', '/play', '/champions', '/augments', '/ranking'] },
  { key: 'more', label: '성장 · 모임', paths: ['/dex', '/crew', '/staff'] },
];

/** 이 주소의 탭: 가장 길게 맞는 탭 (/staff/members 가 /staff 로 잡히지 않게) */
export function tabOf<T extends { to: string; also?: string[] }>(tabs: T[], path: string): T | undefined {
  const len = (t: T) => Math.max(-1, ...[t.to, ...(t.also ?? [])].filter((p) => path === p || path.startsWith(`${p}/`)).map((p) => p.length));
  return tabs.map((t) => [t, len(t)] as const).filter(([, n]) => n >= 0).sort((a, b) => b[1] - a[1])[0]?.[0];
}
/** 이 주소가 속한 허브 (상세 주소 /ranking/… 포함) */
export function hubOf(path: string): Hub | null {
  return HUBS.find((h) => tabOf(h.tabs, path)) ?? null;
}
/** 메뉴 항목 주소가 허브의 첫 탭이면 그 허브 */
export const hubAt = (to: string): Hub | null => HUBS.find((h) => h.tabs[0].to === to) ?? null;

/** 허브 메뉴(대제목)를 누르면 늘 첫 번째 탭으로 (v3.147 — 예전엔 마지막에 본 탭) */
export function hubHref(h: Hub, allowed?: (to: string) => boolean): string {
  return h.tabs.find((t) => !allowed || allowed(t.to))?.to ?? h.tabs[0].to;
}
/** [주소, …] 목록을 묶음 순서대로 나눈다 (묶음에 없는 주소는 마지막 묶음 뒤에) */
export function groupNav<T extends [string, ...unknown[]]>(items: T[]): { key: string; label: string; items: T[] }[] {
  const out = NAV_GROUPS.map((g) => ({ key: g.key, label: g.label, items: items.filter((x) => g.paths.includes(x[0])) }));
  const rest = items.filter((x) => !NAV_GROUPS.some((g) => g.paths.includes(x[0])));
  if (rest.length) out[out.length - 1].items.push(...rest);
  return out.filter((g) => g.items.length);
}
