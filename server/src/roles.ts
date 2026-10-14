/**
 * 디스코드 역할 → 앱 기능 권한 (CLAUDE.md v3.11).
 * 역할 이름·색은 디스코드 서버 설정과 같게 둔다 (봇 없이 표시하려고 여기에 적는다).
 * 단계(level)가 높을수록 위 역할. 기능마다 필요한 최소 단계를 FEATURES 에서 정한다.
 */
import type { Member } from './util.js';

export const ROLES = [
  { id: '794017302763798549', key: 'staff', name: '운영진', color: '#607d8b', level: 5 },
  { id: '794078111984910377', key: 'special', name: '특별회원', color: '#9b59b6', level: 4 },
  { id: '1404780135747555369', key: 'excellent', name: '우수회원', color: '#f1c40f', level: 3 },
  { id: '793740647227588609', key: 'regular', name: '정회원', color: '#e74c3c', level: 2 },
  { id: '793740647227588612', key: 'associate', name: '준회원', color: '#3498db', level: 1 },
] as const;

/** 기능별 필요한 최소 단계 (0 = 디스코드 서버 회원이면 누구나) */
export const FEATURES = {
  party: 0, // 같이 할 판 열기·참여
  scrim: 3, // 내전 열기·팀 나누기 (우수회원 이상)
  prospects: 2, // 포텐 멤버 보기 (정회원 이상)
  moderate: 5, // 남의 글·팁 지우기, 남의 판·내전 취소, 포텐 기록 지우기 (운영진)
} as const;
export type Feature = keyof typeof FEATURES;

export function rolesOf(m: Pick<Member, 'discord_roles'>): string[] {
  try { const r = JSON.parse(m.discord_roles ?? '[]'); return Array.isArray(r) ? r : []; } catch { return []; }
}

/** 가장 높은 역할 (없으면 null) */
export function topRole(m: Pick<Member, 'discord_roles'>) {
  const mine = new Set(rolesOf(m));
  const r = ROLES.find((x) => mine.has(x.id));
  return r ? { key: r.key, name: r.name, color: r.color, level: r.level } : null;
}

/** 관리자(앱 운영자)는 늘 최고 단계 */
export const levelOf = (m: Member) => (m.tier === 'admin' ? 99 : topRole(m)?.level ?? 0);
export const can = (m: Member, f: Feature) => levelOf(m) >= FEATURES[f];
export const permsOf = (m: Member) => Object.fromEntries((Object.keys(FEATURES) as Feature[]).map((f) => [f, can(m, f)])) as Record<Feature, boolean>;
