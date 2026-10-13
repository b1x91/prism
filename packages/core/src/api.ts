/**
 * Prism 서버 응답 형식과 호출 인터페이스.
 * 웹은 fetch + 브라우저 저장 토큰, 앱은 Rust 중계(토큰은 Rust 에만)로 같은 인터페이스를 구현한다.
 */
import type { NW } from './history';

export interface Api {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export type Me = { id: string; nick: string; tier: 'guest' | 'member' | 'admin'; riotId: string | null; linked: boolean; consent: boolean; games: NW };
export type Note = { id: number; text: string; createdAt: number; nick: string; mine: 0 | 1 };
export type Tip = { id: number; augmentId: number | null; text: string; createdAt: number; nick: string; mine: 0 | 1; likes: number; liked: 0 | 1 };
export type ChampionInfo = { crew: NW; me: NW; topAugments: { id: number; n: number; w: number }[]; masters: { id: string; nick: string; n: number; w: number }[]; tips: Tip[] };
export type AugmentStats = { games: number; overall: { id: number; n: number; w: number }[]; champion: { id: number; n: number; w: number }[] };
export type Board = {
  totals: { linked: number; games: number; crewGames: number; crewGamesWeek: number };
  crewDex: number;
  records: { key: string; label: string; value: number; nick: string | null; championId?: number; at?: number; n?: number; w?: number }[];
  pairs: { a: string; b: string; n: number; w: number }[];
  newTips: { id: number; championId: number; augmentId: number | null; text: string; nick: string; createdAt: number }[];
  recent: { at: number; crew: { nick: string; championId: number; win: boolean; k: number; d: number; a: number }[] }[];
};
export type Links = { discord: string | null; kakao: string | null };
