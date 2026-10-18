/**
 * Prism 서버 응답 형식과 호출 인터페이스.
 * 웹은 fetch + 브라우저 저장 토큰, 앱은 Rust 중계(토큰은 Rust 에만)로 같은 인터페이스를 구현한다.
 */
import type { NW } from './history';

export interface Api {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
  /** 1시간 안에 받아 둔 응답 (없으면 undefined) — 화면이 자리표시 없이 바로 그리려고 (withCache) */
  peek?<T>(path: string): T | undefined;
  /** 받아 둔 응답 지우기 (path 가 없으면 전부) */
  forget?(path?: string): void;
}

/**
 * 불러온 데이터를 1시간 동안 다시 쓴다 (v3.67): 메뉴를 옮길 때마다 자리표시를 띄우며 다시 받지 않게.
 * - 1시간이 지나면 다음에 그 화면을 열 때 새로 받는다 (그때만 자리표시)
 * - 쓰기(post·del)를 하면 전부 지운다 (산 꾸밈·받은 보상·새 판이 바로 보이게). 접속 상태 알림·진단은 예외
 * - 늘 새로 봐야 하는 것(내 정보·최근 판·지금 디스코드·관리자)은 담아 두지 않는다
 * - 당겨서 새로고침은 forget() 뒤 화면을 다시 그린다
 */
export const CACHE_TTL = 3600_000;
const LIVE_EXACT = new Set(['/api/me', '/api/me/games', '/api/crew/targets', '/links']);
const LIVE_PREFIX = ['/api/discord', '/api/crew/pulse', '/api/crew/app-members', '/api/me/presence', '/api/admin', '/app/'];
const KEEP_ON_WRITE = ['/api/me/presence', '/api/me/diag'];
export function withCache(api: Api, ttl = CACHE_TTL): Api {
  const memo = new Map<string, { at: number; data: unknown }>();
  const flying = new Map<string, Promise<unknown>>();
  const live = (p: string) => LIVE_EXACT.has(p) || LIVE_PREFIX.some((x) => p.startsWith(x));
  const fresh = (p: string) => { const m = memo.get(p); return m && Date.now() - m.at < ttl ? m : undefined; };
  const write = <T>(path: string, r: Promise<T>) => r.then((v) => { if (!KEEP_ON_WRITE.some((x) => path.startsWith(x))) memo.clear(); return v; });
  return {
    get<T>(path: string): Promise<T> {
      if (live(path)) return api.get<T>(path);
      const m = fresh(path);
      if (m) return Promise.resolve(m.data as T);
      const f = flying.get(path);
      if (f) return f as Promise<T>;
      const p = api.get<T>(path).then((data) => { memo.set(path, { at: Date.now(), data }); return data; }).finally(() => flying.delete(path));
      flying.set(path, p);
      return p;
    },
    post: (path, body) => write(path, api.post(path, body)),
    del: (path) => write(path, api.del(path)),
    peek<T>(path: string) { return live(path) ? undefined : (fresh(path)?.data as T | undefined); },
    forget(path?: string) { if (path) memo.delete(path); else memo.clear(); },
  };
}

/** 당겨서 새로고침 알림 (앱의 롤 기록 다시 읽기 같은 화면 밖 일도 이걸 듣는다) */
const refreshers = new Set<() => void>();
export function onPullRefresh(f: () => void): () => void { refreshers.add(f); return () => { refreshers.delete(f); }; }
export function emitPullRefresh(): void { refreshers.forEach((f) => f()); }

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export type Me = { id: string; nick: string; tier: 'guest' | 'member' | 'admin'; riotId: string | null; linked: boolean; consent: boolean; games: NW; skin: number | null; canScrim?: boolean; role?: DiscordRole | null; perms?: Perms; rolesKnown?: boolean; level?: number; rates?: Rates; presence?: import('./presence').Presence; rankingGate?: { have: number; need: number }; about?: import('./about').About | null };
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

/** 함께한 친구들 (회원 전용) */
export type Prospect = { puuid: string; riotId: string | null; n: number; w: number; queued: number; customs: number; lastAt: number; main: number | null; mates: { nick: string; n: number }[] };
export type Prospects = { prospects: Prospect[]; queueMin: number; limited?: { total: number } };

/** 디스코드 역할 (가장 높은 것 하나) 과 앱 기능 권한 */
export type DiscordRole = { key: string; name: string; color: string; level: number };
export type Perms = { party: boolean; scrim: boolean; prospects: boolean; moderate: boolean; shop?: boolean; prospectsAll?: boolean; rankingAll?: boolean; ranking?: boolean };
/** 단계별 혜택: 피스 배율 · 도감 경험치 배율 · 상점 할인(특별회원) */
export type Rates = { piece: number; dexXp: number; discount: number };

/** 지금 디스코드 (서버 위젯) */
export type VoiceMember = { name: string; avatar: string; muted: boolean; deaf: boolean; memberId: string | null; skin: number | null; main: number | null };
export type OnlineMember = { name: string; avatar: string; status: string; memberId: string | null; skin: number | null; main: number | null };
export type DiscordNow = { enabled: false; invite: string | null } | { enabled: true; online: number; inVoice: number; invite: string | null; channels: { id: string; name: string; link: string; invite: string | null; members: VoiceMember[] }[]; members: OnlineMember[] };

/** 장인 (도감 마스터 여정, server/src/artisans.ts) */
export type Artisan = { id: string; nick: string; master: boolean; done: number; total: number; n: number; w: number; special: boolean } & FaceInfo;
export type Artisans = { artisans: Artisan[] };
export type ArtisanRank = { id: string; nick: string; masters: number; masterIds: number[]; caught: number; goals: number; best: { id: number; done: number; w: number } | null } & FaceInfo;
export type ArtisanRanking = { champions: ArtisanRank[]; augments: ArtisanRank[]; limited?: { champions: number; augments: number } };

/** 멤버 근황 (v3.74): 지금 접속한 멤버 + 최근 3일 근황 */
export type PulseNow = { id: string; nick: string; skin: number | null; main: number | null; presence: import('./presence').Presence; phase: '' | 'lobby' | 'select' | 'game'; champ: number; since: number };
export type PulseItem =
  | { kind: 'session'; at: number; id: string; nick: string; skin: number | null; main: number | null; n: number; w: number; champ: number; day: 'today' | 'yesterday' | 'before' }
  | { kind: 'multi'; at: number; id: string; nick: string; skin: number | null; main: number | null; multi: number; champ: number; win: boolean }
  | { kind: 'streak'; at: number; id: string; nick: string; skin: number | null; main: number | null; streak: number }
  | { kind: 'together'; at: number; members: { id: string; nick: string; skin: number | null; main: number | null }[]; n: number; w: number; run?: number; bonus?: number; multis?: { id: string; nick: string; multi: number; champ: number; win: boolean }[]; praise?: import('./praise').Praise[] }
  | { kind: 'first'; at: number; id: string; nick: string; skin: number | null; main: number | null; champ: number }
  | { kind: 'firsts'; at: number; members: { id: string; nick: string; skin: number | null; main: number | null }[] }
  | { kind: 'joined'; at: number; id: string; nick: string; skin: number | null; main: number | null };
/** 앱을 쓰는 멤버 (v3.84): collected = 이 멤버의 앱이 모은 판, games = 본인 판, crew = 멤버 2명 이상 판 */
export type AppMember = { id: string; nick: string; skin: number | null; main: number | null; about: import('./about').About | null; joined: number; collected: number; games: number; crew: number; presence: import('./presence').Presence };
export type PulseFace = { id: string; nick: string; skin: number | null; main: number | null };
/** 오늘(KST) 요약. games = 서로 다른 판 수, n·w = 멤버별 판·승 합 (예전 서버는 없음) */
export type PulseToday = { players: PulseFace[]; games: number; n: number; w: number };
export type Pulse = { now: PulseNow[]; feed: PulseItem[]; today?: PulseToday; at: number };
