/**
 * 디스코드 역할 → 앱 기능 권한 (CLAUDE.md v3.11).
 * 역할 이름·색은 디스코드 서버 설정과 같게 둔다 (봇 없이 표시하려고 여기에 적는다).
 * 단계(level)가 높을수록 위 역할. 기능마다 필요한 최소 단계를 FEATURES 에서 정한다.
 */
import { HttpError, type Env, type Member } from './util.js';

export const ROLES = [
  { id: '794017302763798549', key: 'staff', name: '운영진', color: '#607d8b', level: 5 },
  { id: '794078111984910377', key: 'special', name: '특별회원', color: '#9b59b6', level: 4 },
  { id: '1404780135747555369', key: 'excellent', name: '우수회원', color: '#f1c40f', level: 3 },
  { id: '793740647227588609', key: 'regular', name: '정회원', color: '#e74c3c', level: 2 },
  { id: '793740647227588612', key: 'associate', name: '준회원', color: '#3498db', level: 1 },
] as const;

/**
 * 기능별 필요한 최소 단계 (CLAUDE.md v3.32). 단계 = 준회원 1 · 정회원 2 · 우수회원 3 · 운영진 5 (특별회원은 단계가 아니라 따로 붙는 혜택).
 * 역할이 없어도 디스코드 서버 회원이면 준회원과 같게 본다 (서버 미가입자는 로그인 자체가 안 된다).
 */
export const FEATURES = {
  party: 0, // 같이 할 판 열기·참여 (화면은 지금 없음)
  scrim: 3, // 내전 열기·팀 나누기 (화면은 지금 없음)
  prospects: 0, // 함께한 친구들 보기 (준회원은 5명까지)
  prospectsAll: 2, // 함께한 친구들 전체 (정회원 이상)
  rankingAll: 2, // 랭킹 전체 (준회원은 5위까지)
  moderate: 5, // 남의 글·팁 지우기, 함께한 친구 기록 지우기 (운영진)
  shop: 0, // 상점 사기·장착 (2026-10-18 모두에게 열림, v3.77)
  ranking: 5, // 랭킹 보기 — 회원이 RANKING_OPEN_MEMBERS 명 모이기 전까지는 운영진만 (모이면 자동으로 모두에게)
} as const;
/** 롤 계정을 연결한 회원이 이만큼 모이면 랭킹이 모두에게 열린다 */
export const RANKING_OPEN_MEMBERS = 30;
export type Feature = keyof typeof FEATURES;
/** 준회원이 볼 수 있는 랭킹·함께한 친구들 수 */
export const LIMITED = 5;

/** 단계별 혜택: 피스 모으는 배율 · 도감 경험치 배율 (높은 단계부터) */
export const RATES: { at: number; piece: number; dexXp: number }[] = [
  { at: 5, piece: 2, dexXp: 2 }, // 운영진
  { at: 3, piece: 1.5, dexXp: 1.5 }, // 우수회원
  { at: 2, piece: 1.5, dexXp: 1 }, // 정회원
  { at: 0, piece: 1, dexXp: 1 }, // 준회원
];
/** 특별회원 상점 할인 (운영진도 받는다) */
export const SPECIAL_DISCOUNT = 0.5;

export function rolesOf(m: Pick<Member, 'discord_roles'>): string[] {
  try { const r = JSON.parse(m.discord_roles ?? '[]'); return Array.isArray(r) ? r : []; } catch { return []; }
}

/** 가장 높은 역할 (없으면 null) */
export function topRole(m: Pick<Member, 'discord_roles'>) {
  const mine = new Set(rolesOf(m));
  const r = ROLES.find((x) => mine.has(x.id));
  return r ? { key: r.key, name: r.name, color: r.color, level: r.level } : null;
}

/** 단계 (특별회원 제외). 관리자(앱 운영자)는 늘 최고 단계 */
export const levelOf = (m: Pick<Member, 'tier' | 'discord_roles'>) => {
  if (m.tier === 'admin') return 99;
  const mine = new Set(rolesOf(m));
  return Math.max(0, ...ROLES.filter((r) => r.key !== 'special' && mine.has(r.id)).map((r) => r.level));
};
export const isSpecial = (m: Pick<Member, 'tier' | 'discord_roles'>) => levelOf(m) >= 5 || rolesOf(m).includes(ROLES.find((r) => r.key === 'special')!.id);
/** 이 회원의 혜택 */
export const ratesOf = (m: Pick<Member, 'tier' | 'discord_roles'>) => {
  const lv = levelOf(m);
  const r = RATES.find((x) => lv >= x.at)!;
  return { piece: r.piece, dexXp: r.dexXp, discount: isSpecial(m) ? SPECIAL_DISCOUNT : 0 };
};
export const can = (m: Pick<Member, 'tier' | 'discord_roles'>, f: Feature) => levelOf(m) >= FEATURES[f];
export const permsOf = (m: Pick<Member, 'tier' | 'discord_roles'>) => Object.fromEntries((Object.keys(FEATURES) as Feature[]).map((f) => [f, can(m, f)])) as Record<Feature, boolean>;

/** 랭킹 공개 여부: 운영진이거나, 롤 계정을 연결한 회원이 RANKING_OPEN_MEMBERS 명 이상 */
export async function rankingGate(env: Env, m: Pick<Member, 'tier' | 'discord_roles'>) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM members WHERE riot_puuid IS NOT NULL').first<{ n: number }>();
  const have = r?.n ?? 0;
  return { open: can(m, 'ranking') || have >= RANKING_OPEN_MEMBERS, have, need: RANKING_OPEN_MEMBERS };
}
export async function assertRanking(env: Env, m: Pick<Member, 'tier' | 'discord_roles'>) {
  if (!(await rankingGate(env, m)).open) throw new HttpError(403, `랭킹은 회원이 ${RANKING_OPEN_MEMBERS}명 모이면 열려요.`);
}
