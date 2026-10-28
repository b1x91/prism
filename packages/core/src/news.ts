/**
 * 소식 피드 (CLAUDE.md v3.111): 운영진 공지·이벤트 + 저절로 생기는 소식(앱 새 버전·증강 패치·새 시즌).
 * 화면(`NewsView`)과 서버(`server/src/news.ts`)가 같이 쓴다.
 */
export type NewsKind = 'notice' | 'event' | 'update' | 'patch' | 'season';
export type NewsItem = {
  id: number; kind: NewsKind; title: string; body: string; data: Record<string, unknown> | null;
  pinned: boolean; at: number; edited: number | null; auto: boolean; author: string | null; hearts: number; mine: boolean;
};
export type NewsList = { items: NewsItem[]; readAt: number; canWrite: boolean };
/** 이름표 (거르기 칩·카드 꼬리표) */
export const NEWS_LABEL: Record<NewsKind, string> = { notice: '공지', event: '이벤트', update: '업데이트', patch: '패치', season: '시즌' };
/** 한 번에 보여 주는 소식 수 · 글자 수 한도 */
export const NEWS_LIMIT = 60;
export const NEWS_MAX = { title: 60, body: 2000 };
