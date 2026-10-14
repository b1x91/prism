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

export type Me = { id: string; nick: string; tier: 'guest' | 'member' | 'admin'; riotId: string | null; linked: boolean; consent: boolean; games: NW; skin: number | null; canScrim?: boolean; role?: DiscordRole | null; perms?: Perms; rolesKnown?: boolean };
/** 회원 얼굴 재료 (서버 FACE): 대표 스킨, 주 챔피언 */
export type FaceInfo = { skin?: number | null; main?: number | null };
export type Note = { id: number; text: string; createdAt: number; memberId?: string; nick: string; mine: 0 | 1; canDelete?: 0 | 1 } & FaceInfo;
export type Tip = { id: number; augmentId: number | null; text: string; createdAt: number; memberId?: string; nick: string; mine: 0 | 1; likes: number; liked: 0 | 1 } & FaceInfo;
export type ChampionInfo = { crew: NW; me: NW; topAugments: { id: number; n: number; w: number }[]; masters: ({ id: string; nick: string; n: number; w: number } & FaceInfo)[]; tips: Tip[] };
export type AugmentStats = { games: number; overall: { id: number; n: number; w: number }[]; champion: { id: number; n: number; w: number }[] };
export type Board = {
  totals: { linked: number; games: number; crewGames: number; crewGamesWeek: number };
  crewDex: number;
  records: { key: string; label: string; value: number; nick: string | null; championId?: number; at?: number; n?: number; w?: number }[];
  pairs: { a: string; b: string; sa?: number | null; sb?: number | null; n: number; w: number }[];
  newTips: { id: number; championId: number; augmentId: number | null; text: string; nick: string; createdAt: number }[];
  recent: { at: number; crew: { nick: string; championId: number; win: boolean; k: number; d: number; a: number }[] }[];
};
export type Links = { discord: string | null; kakao: string | null };

/** 같이 할 판 모집 */
export type PartyMember = { id: string; nick: string } & FaceInfo;
export type Party = { id: number; startAt: number; note: string; hostId: string; createdAt: number; members: PartyMember[]; mine: boolean; host: boolean };
export type Parties = { size: number; now: number; parties: Party[] };

/** 내전 */
export type ScrimMember = PartyMember & { team: 1 | 2 | null; n: number; w: number; rating: number };
export type Scrim = { id: number; startAt: number; note: string; hostId: string; lockedAt: number | null; confirmedAt: number | null; members: ScrimMember[]; waiting: PartyMember[]; mine: boolean; host: boolean; results: { gameId: number; at: number; duration: number; winner: 1 | 2 }[] };
export type Scrims = { size: number; wait: number; now: number; canHost: boolean; scrims: Scrim[] };

/** 포텐 멤버 (회원 전용) */
export type Prospect = { puuid: string; riotId: string | null; n: number; w: number; queued: number; customs: number; lastAt: number; main: number | null; mates: { nick: string; n: number }[] };
export type Prospects = { prospects: Prospect[]; queueMin: number };

/** 디스코드 역할 (가장 높은 것 하나) 과 앱 기능 권한 */
export type DiscordRole = { key: string; name: string; color: string; level: number };
export type Perms = { party: boolean; scrim: boolean; prospects: boolean; moderate: boolean };

/** 지금 디스코드 (서버 위젯) */
export type VoiceMember = { name: string; avatar: string; muted: boolean; deaf: boolean; memberId: string | null; skin: number | null; main: number | null };
export type OnlineMember = { name: string; avatar: string; status: string; memberId: string | null; skin: number | null; main: number | null };
export type DiscordNow = { enabled: false; invite: string | null } | { enabled: true; online: number; inVoice: number; invite: string | null; channels: { id: string; name: string; link: string; members: VoiceMember[] }[]; members: OnlineMember[] };
