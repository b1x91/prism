/**
 * 나를 소개해요 (v3.47): 온보딩에서 받는 소개 — 좋아하는 역할 · 자주 접속하는 요일·시간대 · MBTI (모두 필수).
 * 처음 채우면 서버가 디스코드 '멤버 환영' 채널에 소개 카드를 한 번 올린다 (server/src/about.ts).
 */
export const ABOUT_ROLES = ['marksman', 'mage', 'assassin', 'fighter', 'tank', 'support'] as const;
export const ABOUT_DAYS = ['월', '화', '수', '목', '금', '토', '일'] as const;
export const ABOUT_TIMES = [
  { key: 'day', label: '낮', sub: '12~18시' },
  { key: 'eve', label: '저녁', sub: '18~21시' },
  { key: 'night', label: '밤', sub: '21~24시' },
  { key: 'dawn', label: '새벽', sub: '24시~' },
] as const;
export const MBTI_LIST = ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'] as const;

/** insta: 인스타그램 아이디 (선택, v3.106 — '@'·주소 없이 아이디만) */
export type About = { roles: string[]; days: string[]; times: string[]; mbti: string; insta?: string };

/** 인스타그램 아이디만 남긴다: '@abc', 'instagram.com/abc/' → 'abc'. 아이디 규칙(영문·숫자·.·_ 30자)에 안 맞으면 '' */
export function cleanInsta(v: unknown): string {
  if (typeof v !== 'string') return '';
  const s = v.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s : '';
}

/** 서버·화면 공통 검사: 고른 값만 남기고 순서를 맞춘다. 하나라도 비면 null */
export function cleanAbout(x: unknown): About | null {
  const o = (x ?? {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, all: readonly T[]) => all.filter((a) => Array.isArray(v) && v.includes(a));
  const roles = pick(o.roles, ABOUT_ROLES);
  const days = pick(o.days, ABOUT_DAYS);
  const times = pick(o.times, ABOUT_TIMES.map((t) => t.key));
  const mbti = typeof o.mbti === 'string' && (MBTI_LIST as readonly string[]).includes(o.mbti.toUpperCase()) ? o.mbti.toUpperCase() : '';
  const insta = cleanInsta(o.insta);
  return roles.length && days.length && times.length && mbti ? { roles, days, times, mbti, ...(insta ? { insta } : {}) } : null;
}

/** "화·목·토 · 밤" 처럼 (매일·주말·평일은 줄여서) */
export function aboutWhen(a: About): string {
  const d = a.days.length === 7 ? '매일' : a.days.join('') === '토일' ? '주말' : a.days.join('') === '월화수목금' ? '평일' : a.days.join('·');
  const t = a.times.map((k) => ABOUT_TIMES.find((x) => x.key === k)?.label).filter(Boolean).join('·');
  return `${d} · ${t}`;
}
