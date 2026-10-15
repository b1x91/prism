/**
 * 앱의 흐름: 롤 클라이언트 확인 주기, 전적 정리, 챔프 선택, 업로드, 회원 대신 수집.
 * 원칙 (CLAUDE.md v3.1-4·5): 게임 중에는 롤에 요청 0, 확인 간격은 상황별.
 */
import { AUGMENT, isMayhemGame, mayhemGames, personalStats, toIngestGame, type Game, type Me, type Personal } from '@prism/core';
import { api, bridge } from './bridge';
import { VERSION } from './version';

// 대기 중에도 2초마다 단계만 본다 (챔프 선택에 들어가면 바로 알아채게). 최근 판 불러오기는 따로 드물게
const INTERVAL = { noClient: 20_000, inGame: 30_000, idle: 2_000, queue: 500, champSelect: 600, error: 10_000 };
const HISTORY_PAGES = 5; // 20판 × 5 = 최근 100판
const HISTORY_EVERY = 10 * 60_000;
const AFTER_GAME = 3 * 60_000; // 게임 직후 새 판이 뜰 때까지 30초마다 다시 읽는다
const CREW_EVERY = 30 * 60_000;
const CREW_STEP = 1_500; // 다른 회원 조회 사이 간격 (클라이언트 부하 방지)
const BATCH = 10;
const IDLE_PHASES = ['None', 'Lobby', 'EndOfGame', 'WaitingForStats', 'PreEndOfGame'];

export type Slot = { championId: number; puuid: string };
export type ChampSelect = { mine: number | null; bench: number[]; team: Slot[] };
export type CrewSelect = {
  champions: Record<number, { crew: { n: number; w: number }; topAugments: { id: number; n: number; w: number }[]; masters: { nick: string; n: number; w: number }[] }>;
  teammates: { puuid: string; nick: string; together: { n: number; w: number } }[];
} | null;

/** 이번 판 조합 (우리 팀은 나를 뺀 4명). 게임 위 작은 창과 localStorage 로 나눈다 */
export type MatchupState = { allies: number[]; enemies: number[]; source: 'champ-select' | 'game' | 'manual'; at: number };
export const MATCHUP_KEY = 'prism-matchup';

export type State = {
  status: 'starting' | 'no-client' | 'idle' | 'champ-select' | 'in-game' | 'error';
  message: string;
  phase: string;
  summoner: { puuid: string; riotId: string } | null;
  games: Game[];
  personal: Personal;
  champSelect: ChampSelect | null;
  crew: CrewSelect;
  lastChampion: number | null; // 마지막 챔프 선택의 내 챔프 (게임 중 가이드용)
  matchup: MatchupState | null;
  session: { configured: boolean; loggedIn: boolean };
  /** 첫 세션 확인이 끝났는지, 서버에 닿지 못했는지 (첫 화면 판단용) */
  sessionChecked: boolean;
  sessionError: string | null;
  me: Me | null;
  upload: { lastAt: number; stored: number; error: string | null };
  crewSync: { lastAt: number; running: boolean; games: number; error: string | null };
};

const stored = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const store = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장소 없음 */ } };

let state: State = {
  status: 'starting', message: '', phase: '', summoner: null, games: [], personal: personalStats([]), champSelect: null, crew: null,
  lastChampion: stored<number | null>('prism-last-champion', null), matchup: stored<MatchupState | null>(MATCHUP_KEY, null), session: { configured: false, loggedIn: false }, sessionChecked: false, sessionError: null, me: null,
  upload: { lastAt: 0, stored: 0, error: null }, crewSync: { lastAt: stored('prism-crew-sync-at', 0), running: false, games: 0, error: null },
};
const subs = new Set<() => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
export const getState = () => state;
export const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };

let historyAt = 0;
let refreshUntil = 0;
let wasInGame = false;
let crewKey = '';

export async function refreshSession() {
  const session = await bridge.session().catch(() => ({ configured: false, loggedIn: false }));
  let me: Me | null = null;
  let sessionError: string | null = null;
  if (session.loggedIn) {
    try { me = await api.get<Me>('/api/me'); }
    catch {
      // 로그인이 만료됐으면 Rust 가 토큰을 지운다 → 다시 물어보면 loggedIn=false. 그대로면 서버에 닿지 못한 것
      const again = await bridge.session().catch(() => session);
      if (again.loggedIn) sessionError = 'Prism 서버에 연결하지 못했습니다. 인터넷 연결을 확인해주세요.';
    }
  }
  set({ session: { ...session, loggedIn: Boolean(me) }, me, sessionChecked: true, sessionError });
  if (me?.consent && !state.games.length) void loadServerGames();
}

/** 롤이 꺼져 있어 클라이언트에서 전적을 못 읽을 때: Prism 에 저장된 내 판으로 채운다 (롤이 켜지면 클라이언트 기록으로 바뀐다) */
async function loadServerGames() {
  try {
    const { games } = await api.get<{ games: Game[] }>('/api/me/games');
    if (!state.games.length && games.length) set({ games, personal: personalStats(games) });
  } catch { /* 다음 기회에 */ }
}

// 확인용 정보(diagnostics)에 넣을 마지막 원본. 화면에는 쓰지 않는다
const raw: { page: unknown; champSelect: unknown } = { page: null, champSelect: null };

async function loadHistory(puuid: string, pages: number) {
  const out: any[] = [];
  for (let p = 0; p < pages; p++) {
    const res = await bridge.lcuGet(`/lol-match-history/v1/products/lol/${puuid}/matches?begIndex=${p * 20}&endIndex=${p * 20 + 19}`);
    if (p === 0 && puuid === state.summoner?.puuid) raw.page = res;
    out.push(res);
    if ((res?.games?.games ?? []).length < 20) break;
  }
  return mayhemGames(out).games;
}

const UPLOADED = 'prism-uploaded-f1';
const canUpload = () => Boolean(state.me?.consent);

async function sendGames(ids: number[]) {
  // 보냈음 = 서버가 받아들인 판만. 거절된 판(봇 섞인 커스텀 등)은 앱 버전마다 한 번만 다시 본다
  // (-f1: 도감 역할 챌린지 기록을 채우려고 예전에 보낸 판도 한 번 다시 보낸다. 서버는 같은 판을 다시 저장하지 않고 빈 기록만 채운다)
  const done = new Set<number>(stored(UPLOADED, []));
  const skipKey = `prism-skipped-${VERSION}`;
  const skipped = new Set<number>(stored(skipKey, []));
  const todo = ids.filter((id) => !done.has(id) && !skipped.has(id));
  for (let i = 0; i < todo.length; i += BATCH) {
    const part = todo.slice(i, i + BATCH);
    const games = [];
    for (const id of part) {
      const d = await bridge.lcuGet(`/lol-match-history/v1/games/${id}`);
      if (isMayhemGame(d)) games.push(toIngestGame(d));
    }
    const accepted = new Set<number>();
    if (games.length) {
      const r = await api.post<{ stored: number; accepted?: number[] }>('/api/ingest', { source: 'lcu', games });
      set({ upload: { ...state.upload, stored: state.upload.stored + r.stored } });
      (r.accepted ?? []).forEach((x) => accepted.add(x));
    }
    store(UPLOADED, [...stored<number[]>(UPLOADED, []), ...part.filter((x) => accepted.has(x))].slice(-2000));
    store(skipKey, [...stored<number[]>(skipKey, []), ...part.filter((x) => !accepted.has(x))].slice(-2000));
  }
}

async function uploadOwn() {
  if (!canUpload()) return;
  try { await sendGames(state.games.map((g) => g.gameId)); set({ upload: { ...state.upload, lastAt: Date.now(), error: null } }); }
  catch (e) { set({ upload: { ...state.upload, error: e instanceof Error ? e.message : String(e) } }); }
}

/** 한가할 때(대기·로비) 동의한 다른 회원의 최근 20판을 대신 올린다. 바빠지면 즉시 멈춘다 */
async function syncCrew() {
  if (!canUpload() || state.crewSync.running || Date.now() - state.crewSync.lastAt < CREW_EVERY || !state.summoner) return;
  set({ crewSync: { ...state.crewSync, running: true, games: 0 } });
  let games = 0;
  try {
    const { targets } = await api.get<{ targets: { puuid: string; lastPlayedAt: number | null }[] }>('/api/crew/targets');
    for (const t of targets) {
      if (t.puuid === state.summoner.puuid) continue;
      const st = await bridge.lcuStatus();
      if (st.inGame) return;
      const phase = await bridge.lcuGet<string>('/lol-gameflow/v1/gameflow-phase').catch(() => 'Unknown');
      if (!IDLE_PHASES.includes(phase)) return;
      await new Promise((r) => setTimeout(r, CREW_STEP));
      const list = await loadHistory(t.puuid, 1).catch(() => null);
      if (!list) continue;
      const since = (t.lastPlayedAt ?? 0) - 86_400_000;
      const fresh = list.filter((g) => g.playedAt > since).map((g) => g.gameId);
      if (fresh.length) { await sendGames(fresh); games += fresh.length; }
    }
    store('prism-crew-sync-at', Date.now());
    set({ crewSync: { lastAt: Date.now(), running: false, games, error: null } });
  } catch (e) {
    set({ crewSync: { ...state.crewSync, running: false, error: e instanceof Error ? e.message : String(e) } });
  } finally {
    if (state.crewSync.running) set({ crewSync: { ...state.crewSync, running: false } });
  }
}

async function loadChampSelect() {
  const s = await bridge.lcuGet<any>('/lol-champ-select/v1/session');
  raw.champSelect = s;
  const myTeam: any[] = s?.myTeam ?? [];
  const me = myTeam.find((m) => m.cellId === s.localPlayerCellId);
  const bench = [...(s?.benchChampions ?? []).map((b: any) => Number(b.championId ?? b)), ...(s?.benchChampionIds ?? []).map(Number)].filter((id) => id > 0);
  const team = myTeam.filter((m) => m.cellId !== s.localPlayerCellId).map((m) => ({ championId: Number(m.championId) || 0, puuid: String(m.puuid ?? '') }));
  const cs: ChampSelect = { mine: Number(me?.championId) > 0 ? Number(me.championId) : null, bench: [...new Set<number>(bench)], team };
  if (cs.mine && cs.mine !== state.lastChampion) store('prism-last-champion', cs.mine);
  // 우리 팀 조합 (상대는 게임이 시작될 때). 새 챔프 선택이 시작되면 지난 판 상대는 지운다
  const fresh = !state.champSelect || !state.matchup;
  const allies = team.map((t) => t.championId).filter((id) => id > 0);
  // 0.6초마다 읽으므로, 바뀐 게 없으면 화면을 다시 그리지 않는다
  if (!fresh && JSON.stringify(cs) === JSON.stringify(state.champSelect) && JSON.stringify(allies) === JSON.stringify(state.matchup!.allies)) return;
  set({ champSelect: cs, lastChampion: cs.mine ?? state.lastChampion });
  setMatchup({ allies, enemies: fresh ? [] : state.matchup!.enemies, source: fresh ? 'champ-select' : state.matchup!.source, at: Date.now() });
  // 챔피언·팀원 구성이 바뀌었을 때만 서버에 묻는다 (모임 기록·같은 팀 회원 케미)
  const ids = [cs.mine, ...cs.bench].filter((x): x is number => Boolean(x));
  const puuids = team.map((t) => t.puuid).filter(Boolean);
  const key = JSON.stringify([ids.slice().sort(), puuids.slice().sort()]);
  if (state.me && key !== crewKey) {
    crewKey = key;
    api.post<CrewSelect>('/api/champselect', { championIds: ids, teammatePuuids: puuids }).then((crew) => set({ crew })).catch(() => {});
  }
}

function setMatchup(m: MatchupState) {
  store(MATCHUP_KEY, m);
  set({ matchup: m });
}

/** 게임 정보에서 양 팀 챔피언. 내 팀은 내 PUUID(없으면 내 챔피언)로 찾는다 */
async function loadMatchup() {
  const d = await bridge.lcuGet<any>('/lol-gameflow/v1/session');
  const one: any[] = d?.gameData?.teamOne ?? [], two: any[] = d?.gameData?.teamTwo ?? [];
  const champ = (p: any) => Number(p?.championId) || 0;
  const sel = new Map<string, number>((d?.gameData?.playerChampionSelections ?? []).map((x: any) => [String(x.puuid ?? x.summonerInternalName ?? ''), Number(x.championId) || 0]));
  const withChamp = (t: any[]) => t.map((p) => champ(p) || sel.get(String(p.puuid ?? '')) || 0);
  const a = withChamp(one), b = withChamp(two);
  if (!a.some(Boolean) || !b.some(Boolean)) return;
  const me = state.summoner?.puuid;
  const mineIsTwo = me ? two.some((p) => p.puuid === me) : b.includes(state.lastChampion ?? -1);
  const [mineT, theirs] = mineIsTwo ? [b, a] : [a, b];
  let removed = false;
  const allies = mineT.filter((id) => { if (!removed && id === state.lastChampion) { removed = true; return false; } return id > 0; });
  setMatchup({ allies: allies.slice(0, 4), enemies: theirs.filter((id) => id > 0).slice(0, 5), source: 'game', at: Date.now() });
}

/** 3개 비교 화면에서 직접 고친 조합 */
export function editMatchup(m: { allies: number[]; enemies: number[] }) {
  setMatchup({ ...m, source: 'manual', at: Date.now() });
}

async function tick(): Promise<number> {
  const st = await bridge.lcuStatus().catch(() => ({ client: false, inGame: false }));
  if (st.inGame) {
    wasInGame = true;
    set({ status: 'in-game', message: '게임 중', champSelect: null });
    return INTERVAL.inGame;
  }
  if (!st.client) {
    set({ status: 'no-client', message: '롤 클라이언트를 켜면 자동으로 연결됩니다.', champSelect: null, summoner: null });
    return INTERVAL.noClient;
  }
  try {
    if (!state.summoner) {
      const s = await bridge.lcuGet<any>('/lol-summoner/v1/current-summoner');
      set({ summoner: { puuid: s.puuid, riotId: `${s.gameName ?? s.displayName ?? '?'}#${s.tagLine ?? ''}` } });
      historyAt = 0;
    }
    if (wasInGame) { wasInGame = false; refreshUntil = Date.now() + AFTER_GAME; }
    // 단계를 먼저 본다 — 최근 판 불러오기가 길어져도 챔프 선택을 늦게 알아채지 않게
    const phase = await bridge.lcuGet<string>('/lol-gameflow/v1/gameflow-phase');
    // 게임이 시작되는 순간(게임 창이 뜨기 전) 양 팀 챔피언을 한 번 읽는다. 창이 뜨면 Rust 가 요청을 막는다
    const starting = phase === 'GameStart' || phase === 'InProgress' || phase === 'Reconnect';
    if (starting && state.matchup?.source !== 'game') await loadMatchup().catch(() => {});
    if (phase === 'ChampSelect') await loadChampSelect();
    else { if (state.champSelect) set({ champSelect: null }); crewKey = ''; }
    const status = phase === 'ChampSelect' ? 'champ-select' : 'idle';
    if (state.phase !== phase || state.status !== status || state.message) set({ phase, status, message: '' });
    // 최근 판은 챔프 선택·게임 시작이 아닐 때만 (오래 걸릴 수 있다)
    const stale = Date.now() - historyAt > (Date.now() < refreshUntil ? 30_000 : HISTORY_EVERY);
    if (stale && phase !== 'ChampSelect' && !starting) {
      const games = await loadHistory(state.summoner!.puuid, HISTORY_PAGES);
      historyAt = Date.now();
      set({ games, personal: personalStats(games) });
      void uploadOwn();
    }
    if (phase === 'None' || phase === 'Lobby') void syncCrew();
    if (starting && state.matchup?.source !== 'game') return 1500; // 놓치지 않게 잠깐 자주
    // 큐를 돌리는 중(매칭·수락 대기)이면 챔프 선택에 들어가는 순간을 바로 잡도록 자주 본다
    if (phase === 'Matchmaking' || phase === 'ReadyCheck') return INTERVAL.queue;
    return phase === 'ChampSelect' ? INTERVAL.champSelect : INTERVAL.idle;
  } catch (e) {
    set({ status: 'error', message: e instanceof Error ? e.message : String(e), summoner: null });
    return INTERVAL.error;
  }
}

/** 접속 상태 점: 앱이 떠 있는지(트레이면 아님)·롤이 켜져 있는지를 서버에 알린다. 바뀌면 바로, 아니면 60초마다 */
const LOL_ON = new Set<State['status']>(['idle', 'champ-select', 'in-game']);
let presenceKey = '';
let presenceAt = 0;
export async function windowOpen() {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return await getCurrentWindow().isVisible();
  } catch {
    return document.visibilityState === 'visible';
  }
}
async function pingPresence() {
  if (!state.me) return;
  const lol = LOL_ON.has(state.status);
  const open = await windowOpen();
  const key = `${lol}-${open}`;
  const now = Date.now();
  if (key === presenceKey && now - presenceAt < 60_000) return;
  presenceKey = key;
  presenceAt = now;
  await api.post('/api/me/presence', { via: 'app', lol, open }).catch(() => { presenceKey = ''; });
}

let started = false;
export function start() {
  if (started) return;
  started = true;
  void refreshSession().then(pingPresence);
  setInterval(() => void pingPresence(), 10_000);
  document.addEventListener('visibilitychange', () => void pingPresence());
  void loop();
  // Rust 가 롤 단계 변화를 알려 주면 기다리지 않고 바로 다시 읽는다 (창이 트레이에 있어 타이머가 늦어도)
  import('@tauri-apps/api/event').then(({ listen }) => listen('lcu-phase', () => void checkNow())).catch(() => {});
}

/** 확인 고리: 다음 확인을 예약해 두고, '지금 확인'을 누르면 기다리지 않고 바로 다시 본다 */
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
async function loop() {
  if (running) return;
  running = true;
  clearTimeout(timer);
  const wait = await tick().catch(() => INTERVAL.error);
  running = false;
  timer = setTimeout(loop, wait);
}
/** 게임 화면의 '지금 확인': 롤 상태(챔프 선택 등)를 바로 다시 읽는다 */
export async function checkNow() {
  clearTimeout(timer);
  await loop();
}

/** 수집 동의 (지금 클라이언트에 로그인된 롤 계정을 연결) / 철회 */
export async function setConsent(agree: boolean) {
  if (agree) {
    if (!state.summoner) throw new Error('롤 클라이언트를 켠 상태에서 동의해주세요.');
    await api.post('/api/me/riot', { puuid: state.summoner.puuid, riotId: state.summoner.riotId });
  }
  await api.post('/api/me/consent', { agree });
  await refreshSession();
  if (agree) void uploadOwn();
}

const PERSONAL_KEYS = new Set(['gameName', 'tagLine', 'summonerName', 'displayName', 'internalName', 'riotIdGameName', 'riotIdTagline', 'summonerId', 'accountId', 'currentAccountId', 'profileIcon', 'matchHistoryUri', 'nameVisibilityType', 'obfuscatedPuuid', 'obfuscatedSummonerId']);

/** 다른 플레이어 식별 정보를 지운다. 내 PUUID 는 ME, 다른 PUUID 는 P1, P2 … */
function anonymize(data: unknown): unknown {
  const alias = new Map<string, string>();
  const walk = (v: any, key = ''): any => {
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    if (key === 'puuid' && typeof v === 'string' && v) {
      if (v === state.summoner?.puuid) return 'ME';
      if (!alias.has(v)) alias.set(v, `P${alias.size + 1}`);
      return alias.get(v);
    }
    return PERSONAL_KEYS.has(key) ? '(익명)' : v;
  };
  return walk(data);
}

/**
 * 실제 클라이언트 응답 모양 확인용 (증강 필드·팀원 puuid 등 미검증 항목). 다른 플레이어 정보는 지운다.
 * 게임 중에는 만들지 않는다.
 */
export async function diagnostics(version: string): Promise<string> {
  const st = await bridge.lcuStatus();
  if (st.inGame) throw new Error('게임이 끝난 뒤에 다시 눌러주세요.');
  if (!st.client || !state.summoner) throw new Error('롤 클라이언트를 켠 뒤에 다시 눌러주세요.');
  const latest = state.games[0];
  const detail = latest ? await bridge.lcuGet(`/lol-match-history/v1/games/${latest.gameId}`).catch((e) => ({ error: String(e) })) : null;
  const augs = [...new Set(state.games.flatMap((g) => g.augments))];
  // 게임 위 작은 창(자동 인식) 상태: 켜짐·위치, 인식기, 마지막으로 읽은 글자와 증강
  const vision = await bridge.visionGet().catch((e) => ({ error: String(e) }));
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    appVersion: version,
    visionReady: Boolean(state.me?.consent),
    vision,
    phase: state.phase,
    mayhemGames: state.games.length,
    gamesWithAugments: state.personal.augmentGames,
    unknownAugmentIds: augs.filter((id) => !AUGMENT[id]),
    knownAugmentIds: augs.filter((id) => AUGMENT[id]).length,
    firstPageRaw: anonymize(raw.page),
    latestMayhemDetailRaw: anonymize(detail),
    champSelectRaw: anonymize(raw.champSelect),
  }, null, 2);
}
