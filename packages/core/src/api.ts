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
const LIVE_PREFIX = ['/api/now', '/api/news', '/api/discord', '/api/staff', '/api/me/invite', '/api/members/lookup', '/api/members/search', '/api/me/inquiry', '/api/inquiry/', '/api/crew/pulse', '/api/crew/app-members', '/api/me/presence', '/api/admin', '/app/'];
/** 다른 화면이 담아 둔 데이터를 바꾸지 않는 쓰기 — 아무것도 지우지 않는다.
 *  게임 중 1분마다 보내는 지금 판(/api/me/live)·챔프 선택 조회·소식 읽음·하트처럼 자주 오는 쓰기가 전부 지우면 다음 화면마다 자리표시가 깜빡였다 (v3.185) */
const KEEP_ON_WRITE = ['/api/me/presence', '/api/me/diag', '/api/now', '/api/me/live', '/api/champselect', '/api/news', '/api/me/now-auto', '/api/me/shopview'];
/** 그 기능의 데이터만 바뀌는 쓰기 — 그 주소들만 지운다. body 로 지울 주소를 좁힐 수 있다 */
const SCOPED_WRITES: [string, (body: unknown) => string[]][] = [
  ['/api/me/favs', (b) => { const x = b as { kind?: string; id?: number } | undefined; return ['/api/me/favs', x?.kind && x.id ? `/api/favs/count?kind=${x.kind}&id=${x.id}` : '/api/favs/']; }],
  ['/api/me/highlights', () => ['/api/me/highlights']],
  ['/api/tips', () => ['/api/tips']],
  ['/api/notes', () => ['/api/notes']],
];
/** 내 얼굴·테두리·이름·피스가 바뀔 수 있는 쓰기 — 끝나면 사이드바·상단의 내 정보를 다시 받는다 */
const ME_WRITES = ['/api/me/equip', '/api/me/profile', '/api/me/skin', '/api/me/about', '/api/me/riot', '/api/shop/', '/api/me/missions/claim', '/api/me/weekly/claim'];
const meSubs = new Set<() => void>();
export function onMeChanged(f: () => void): () => void { meSubs.add(f); return () => { meSubs.delete(f); }; }
let meTimer: ReturnType<typeof setTimeout> | null = null;
/** 꾸미기 저장처럼 쓰기가 여러 번 이어져도 한 번만 다시 받는다 */
export function emitMeChanged(): void { if (meTimer) clearTimeout(meTimer); meTimer = setTimeout(() => { meTimer = null; meSubs.forEach((f) => f()); }, 200); }
export function withCache(api: Api, ttl = CACHE_TTL): Api {
  const memo = new Map<string, { at: number; data: unknown }>();
  const flying = new Map<string, Promise<unknown>>();
  const live = (p: string) => LIVE_EXACT.has(p) || LIVE_PREFIX.some((x) => p.startsWith(x));
  const fresh = (p: string) => { const m = memo.get(p); return m && Date.now() - m.at < ttl ? m : undefined; };
  const write = <T>(path: string, body: unknown, r: Promise<T>) => r.then((v) => {
    const scoped = SCOPED_WRITES.find(([x]) => path.startsWith(x));
    if (scoped) { const pre = scoped[1](body); for (const k of [...memo.keys()]) if (pre.some((x) => k.startsWith(x))) memo.delete(k); }
    // 판 보내기는 새로 저장된 판이 있을 때만 (이미 있는 판뿐이면 바뀐 게 없다)
    else if (path === '/api/ingest' && (v as { stored?: number } | null)?.stored === 0) { /* 그대로 */ }
    else if (!KEEP_ON_WRITE.some((x) => path.startsWith(x))) memo.clear();
    if (ME_WRITES.some((x) => path.startsWith(x))) emitMeChanged();
    return v;
  });
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
    post: (path, body) => write(path, body, api.post(path, body)),
    del: (path) => write(path, undefined, api.del(path)),
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

export type Me = { id: string; nick: string; tier: 'guest' | 'member' | 'admin'; riotId: string | null; linked: boolean; consent: boolean; games: NW; skin: number | null; canScrim?: boolean; role?: DiscordRole | null; perms?: Perms; rolesKnown?: boolean; level?: number; rates?: Rates; presence?: import('./presence').Presence; rankingGate?: { have: number; need: number }; about?: import("./about").About | null; pending?: boolean; newsUnread?: number; /** 운영진만: 운영 화면에서 아직 못 본 처리할 멤버 수 (v3.125) */ staffUnread?: number; /** 운영진만: 할 일 · 답을 기다리는 문의 수 (v3.160) */ staffTodo?: number; staffInq?: number; /** 로비를 NOW에 자동으로 올리기 (v3.126) */ nowAuto?: boolean; /** NOW 에 돌아가는 팟·내전·함께 게임 중 수 — 멤버 메뉴 LIVE (v3.137) */ nowLive?: number; /** 장착한 프로필 테두리 상품 id (v3.153) */ frame?: string | null; /** 연결한 롤 계정들 (v3.155, 메인이 맨 앞) */ accounts?: RiotAccount[]; accountMax?: number };
export type RiotAccount = { puuid: string; riotId: string | null; main: boolean; /** 이 시각 이후 판만 기록 (0 = 처음부터) */ since?: number };
/** NOW (v3.126): 지금 모이는 팟 */
export type NowFace = { id: string; nick: string; skin: number | null; main: number | null };
/** guests: 비회원 이름(태그 없이) — 첫 글자 얼굴 (v3.140). 예전 앱이 알린 로비는 없을 수 있다 */
export type NowLobby = { id: string; phase: 'lobby' | 'queue' | 'game'; size: number; since: number; leader: string | null; members: NowFace[]; requests: NowFace[]; guests?: string[] };
export type NowTeam = { members: NowFace[]; size: number; guests?: string[] };
/** 내전 중 (v3.127): 사용자 설정 로비 · 오늘의 점수(지난 6시간 기록된 사용자 설정 판, 게임 진영 기준) */
export type NowScrim = { id: string; phase: NowLobby['phase']; size: number; since: number; leader: string | null; blue: NowTeam; red: NowTeam; requests: NowFace[]; series: { blue: number; red: number; games: number } };
/** 함께 게임 중 (v3.130): 로비 없이도, 같은 판에 회원이 2명 이상이면. champ = 그 판의 챔프 */
export type NowGameSide = { members: (NowFace & { champ: number })[]; size: number };
export type NowGame = { id: string; since: number; custom: boolean; blue: NowGameSide; red: NowGameSide };
/** 내전 팀 나누기 (프리즘 빛 갈래, v3.135). people 순서 = 빛이 지나가는 순서, id 가 없으면 손님 */
export type NowDraw = { id: number; lobby: string; host: string; start: number; people: { key: string; id: string | null; team: 'blue' | 'red'; score: number; nick?: string; skin?: number | null; main?: number | null }[]; balanced: boolean; confirmed: boolean };
export type NowDrawRes = { draw: NowDraw | null; now: number };
/** 회원 페이지 맨 위 '지금 게임 중' (v3.136) */
export type MemberLive = {
  phase: 'game' | 'select'; champ: number | null; since: number; custom: boolean;
  allies: (NowFace & { champ: number | null })[]; foes: (NowFace & { champ: number | null })[];
  allySize: number; foeSize: number;
  /** 양 팀 10명 (v3.149) — 게임 중 회원 앱이 1분마다 알린 것. 비회원은 이름(태그 없이)만 */
  board?: LiveBoard | null;
};
export type LiveBoardPlayer = { name: string; member: NowFace | null; champ: number; level: number; k: number; d: number; a: number; items: number[]; augments: number[]; me: boolean };
export type LiveBoard = { time: number; at: number; custom: boolean; mine: LiveBoardPlayer[]; theirs: LiveBoardPlayer[] };
export type NowList = { auto: boolean; lobbies: NowLobby[]; scrims?: NowScrim[]; games?: NowGame[] };
/** 회원 얼굴 재료 (서버 FACE): 대표 스킨, 주 챔피언 */
export type FaceInfo = { skin?: number | null; main?: number | null };
export type Note = { id: number; text: string; createdAt: number; memberId?: string; nick: string; mine: 0 | 1; canDelete?: 0 | 1 } & FaceInfo;
export type Tip = { id: number; augmentId: number | null; text: string; createdAt: number; memberId?: string; nick: string; mine: 0 | 1; likes: number; liked: 0 | 1 } & FaceInfo;
export type ChampionInfo = { crew: NW; me: NW; items?: import('./build').CrewItems; topAugments: { id: number; n: number; w: number }[]; masters: ({ id: string; nick: string; n: number; w: number } & FaceInfo)[]; tips: Tip[] };
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
export type Perms = { party: boolean; scrim: boolean; prospects: boolean; moderate: boolean; shop?: boolean; prospectsAll?: boolean; rankingAll?: boolean; ranking?: boolean; manage?: boolean };
/** 단계별 혜택: 피스 배율 · 도감 경험치 배율 · 상점 할인(특별회원) */
export type Rates = { piece: number; dexXp: number; discount: number; /** 관리자 — 출시 기간 새 상품에도 원래 할인 (v3.123) */ admin?: boolean };

/** 지금 디스코드 (서버 위젯) */
export type VoiceMember = { name: string; avatar: string; muted: boolean; deaf: boolean; memberId: string | null; skin: number | null; main: number | null };
export type OnlineMember = { name: string; avatar: string; status: string; memberId: string | null; skin: number | null; main: number | null };
export type DiscordNow = { enabled: false; invite: string | null } | { enabled: true; online: number; inVoice: number; invite: string | null; channels: { id: string; name: string; link: string; invite: string | null; members: VoiceMember[] }[]; members: OnlineMember[] };

/** 장인 (도감 마스터 여정, server/src/artisans.ts) */
export type Artisan = { id: string; nick: string; pending?: boolean; master: boolean; done: number; total: number; n: number; w: number; special: boolean } & FaceInfo;
export type Artisans = { artisans: Artisan[] };
export type ArtisanRank = { id: string; nick: string; pending?: boolean; masters: number; masterIds: number[]; caught: number; goals: number; best: { id: number; done: number; w: number } | null } & FaceInfo;
export type ArtisanRanking = { champions: ArtisanRank[]; augments: ArtisanRank[]; items?: ArtisanRank[]; limited?: { champions: number; augments: number; items?: number } };

/** 멤버 근황 (v3.74): 지금 접속한 멤버 + 최근 3일 근황 */
export type PulseNow = { id: string; nick: string; riot?: string | null; skin: number | null; main: number | null; presence: import('./presence').Presence; phase: '' | 'lobby' | 'select' | 'game'; champ: number; since: number };
export type PulseItem =
  | { kind: 'session'; at: number; id: string; nick: string; skin: number | null; main: number | null; n: number; w: number; champ: number; day: 'today' | 'yesterday' | 'before' }
  | { kind: 'multi'; at: number; id: string; nick: string; skin: number | null; main: number | null; multi: number; champ: number; win: boolean }
  | { kind: 'streak'; at: number; id: string; nick: string; skin: number | null; main: number | null; streak: number }
  | { kind: 'together'; at: number; members: { id: string; nick: string; skin: number | null; main: number | null }[]; n: number; w: number; run?: number; bonus?: number; multis?: { id: string; nick: string; multi: number; champ: number; win: boolean }[]; praise?: import('./praise').Praise[];
      /** v3.182 — 이 날 함께한 판의 승패(시간순) · 첫 판·마지막 판 시각 · 처음부터 함께한 날·통산 판 · 둘이면 듀오 등급 (예전 서버는 없음) */
      seq?: boolean[]; from?: number; to?: number; days?: number; total?: number; bond?: { grade: number; name: string } | null }
  | { kind: 'first'; at: number; id: string; nick: string; skin: number | null; main: number | null; champ: number }
  | { kind: 'firsts'; at: number; members: { id: string; nick: string; skin: number | null; main: number | null }[] }
  | { kind: 'joined'; at: number; id: string; nick: string; skin: number | null; main: number | null };
/** 앱을 쓰는 멤버 (v3.84): collected = 이 멤버의 앱이 모은 판, games = 본인 판, crew = 멤버 2명 이상 판 */
export type AppMember = { id: string; nick: string; /** 롤 이름#태그 (친구 추가용 복사, v3.133) */ riot?: string | null; skin: number | null; main: number | null; about: import('./about').About | null; joined: number; collected: number; games: number; crew: number; presence: import('./presence').Presence; pending?: boolean };
export type PulseFace = { id: string; nick: string; skin: number | null; main: number | null };
/** 오늘(KST) 요약. games = 서로 다른 판 수, n·w = 멤버별 판·승 합 (예전 서버는 없음) */
export type PulseToday = { players: PulseFace[]; games: number; n: number; w: number };
/** 최근 접속 (지금은 나가 있는 멤버, 14일, 마지막 접속 순). 예전 서버는 없음 */
export type PulseSeen = PulseFace & { at: number; riot?: string | null };
export type Pulse = { now: PulseNow[]; recent?: PulseSeen[]; feed: PulseItem[]; today?: PulseToday; at: number };

/** 운영 (v3.107, 운영진만): 멤버 목록 */
export type StaffMember = {
  id: string; nick: string; discordName: string; skin: number | null; main: number | null; joined: number; seen: number; riotId: string | null;
  games: number; level: number; special: boolean; pending: boolean; app: boolean; admin: boolean; rolesKnown: boolean; role: DiscordRole | null;
  staffGames: number; review: boolean; wins: number; recent: number; score: number; lastPlayed: number | null; inviter: { id: string; nick: string } | null; invitedCount: number; approvedAt: number | null;
  /** v3.160 — 최근 8주 주별 판 수 · 자주 함께한 멤버(최근 15주) · 첫 판 시각. 예전 서버는 없음 */
  wk?: number[]; mates?: (StaffFace & { n: number })[]; firstPlayed?: number | null;
};
export type StaffFace = { id: string; nick: string; skin: number | null; main: number | null };
/** 운영 대시보드 (v3.109) */
export type StaffOverview = {
  weeks: { start: number; games: number; crew: number; active: number }[];
  kpi: { members: number; joinedWeek: number; active: number; activePrev: number; crew: number; crewPrev: number; online: number; app: number; linked: number };
  levels: { pending: number; none: number; associate: number; regular: number; excellent: number; staff: number };
  stars: (StaffFace & { n: number; w: number; crew: number; score: number })[];
  care: (StaffFace & { kind: 'pending' | 'review' | 'quiet' | 'away'; days: number; n?: number })[];
  careTotal: number;
  /** v3.159 — 없을 수 있다 (예전 서버) */
  periods?: Record<'week' | 'w4' | 'w8', { now: StaffSpan; prev: StaffSpan }>;
  /** 최근 4주 · [시간대 5][요일 7] 서로 다른 판 */
  heat?: number[][];
  funnel?: { joined: number; linked: number; app: number; played: number; crew3: number; regular: number };
  memberWeeks?: number[];
  /** 이번 주 지난 시간(ms) */
  weekInto?: number;
  /** v3.160 — 날짜별 서로 다른 판 (오늘까지 63일, 한국 날짜) · 오늘(한국 날짜 번호) · 시간대별(0~23시, 최근 4주) */
  daily?: number[]; today?: number; hours?: number[];
  rings?: { active: number; base: number; activePrev: number; crew: number; games: number; crewPrevRate: number | null; settled: number; joined: number; app: number; linked: number; total: number };
  picks?: (StaffFace & { n: number; w: number; crew: number; days: number; mates: number; score: number; pts: Record<import('./staff').PickKey, number>; total: number })[];
  /** 가입부터 그 단계까지 평균 일 */
  funnelDays?: { app: number | null; played: number | null };
};
export type StaffSpan = { active: number; games: number; crew: number; joined: number };
export type StaffMembers = { members: StaffMember[]; reviewNeed: number; inviteBonus: number; overview?: StaffOverview; /** 가입 신청 (v3.148) */ applications?: { new: number; interview: number; confirmed: number }; /** 답을 기다리는 문의 (v3.159) */ inquiries?: number };
/** 친구 초대 (v3.107) */
export type MyInvite = { code: string; bonus: number; rewarded: number; friends: { id: string; nick: string; skin: number | null; main: number | null; joined: number; approved: boolean; pending?: boolean; rewardedAt: number | null }[] };
export type LookupMember = { id: string; nick: string; skin: number | null; main: number | null };
