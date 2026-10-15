/** 표시용 문구·검색 도우미 */
export const RARITY_KO = { prismatic: '프리즘', gold: '골드', silver: '실버' } as const;
export const LEVEL_KO = { best: '잘 맞음', good: '무난', weak: '안 맞음', none: '조건 없음' } as const;
export const ROLE_KO: Record<string, string> = { marksman: '원딜', mage: '마법사', assassin: '암살자', fighter: '전사', tank: '탱커', support: '서포터' };

export const pct = (w: number, n: number) => (n ? `${Math.round((w / n) * 100)}%` : '–');
export const ago = (t: number) => {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
};
export const shortDate = (t: number) => (t ? new Date(t).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '');

/** 한글 초성 검색: "ㅇㄹ" → 아리 */
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
export const initials = (s: string) =>
  [...s].map((ch) => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch; }).join('');
export const matchName = (name: string, q: string) => {
  const t = q.trim().replace(/\s/g, '');
  if (!t) return true;
  const n = name.replace(/\s/g, '');
  return n.includes(t) || initials(n).includes(t);
};

/** 좁은 자리용 이름: 롤 이름의 '#태그'를 뗀다 (전체 이름은 공용 NickName — 내 페이지 머리·랭킹 등) */
export const shortNick = (nick: string | null | undefined) => {
  const s = nick ?? '';
  const i = s.lastIndexOf('#');
  return i > 0 ? s.slice(0, i) : s;
};
