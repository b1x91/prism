/**
 * Prism 앱 프로토타입 (v0) — 롤 옆에 켜두는 동반 앱.
 *
 * 하는 일: LCU 를 읽어 내 아수라장 전적과 챔프 선택 정보를 로컬 화면(127.0.0.1)에 보여준다.
 * 하지 않는 일: 서버로 전송하지 않는다. 클라이언트를 조작하지 않는다. 게임 중에는 아무 요청도 하지 않는다.
 *
 * 실행: npm run app  →  브라우저에서 http://127.0.0.1:5199
 */
import { exec } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discover, isGameRunning, lcuAsset, lcuGet, type LcuCreds } from './lcu.js';

const VERSION = '0.1.0';
const PORT = 5199;
const MAYHEM_QUEUE = 2400;
// 확인 간격 — 상황별로 다르게. 챔프 선택 때만 촘촘히 본다.
const INTERVAL_MS = {
  noClient: 20_000, // 클라이언트 꺼짐: OS 프로세스만 확인
  inGame: 30_000, // 게임 중: OS 프로세스만 확인, 롤에는 요청 없음
  idle: 15_000, // 대기·로비·매칭
  champSelect: 5_000, // 챔프 선택: 벤치 교체를 따라가야 해서 짧게
  error: 10_000,
};
const AFTER_GAME_RELOAD_MS = 30_000; // 게임 직후 새 판이 뜰 때까지 전적 재조회 간격
const HISTORY_PAGES = 5; // 20판 × 5 = 최근 100판까지
const AFTER_GAME_REFRESH_MS = 180_000; // 게임 종료 후 기록이 LCU 에 뜰 때까지 재조회하는 시간
const HERE = dirname(fileURLToPath(import.meta.url));
const DIAG_DIR = join(HERE, '..', 'diagnostics');

// ───────── 상태 ─────────

type Game = {
  gameId: number;
  playedAt: number;
  duration: number;
  championId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  items: number[];
  augments: number[];
  damageToChampions: number | null;
  damageTaken: number | null;
  goldEarned: number | null;
};

type ChampRecord = { championId: number; n: number; w: number };

type State = {
  status: 'no-client' | 'in-game' | 'ready' | 'error';
  message: string;
  phase: string | null;
  me: { gameName: string; tagLine: string } | null;
  games: Game[];
  scannedGames: number;
  queueCounts: Record<string, number>;
  fields: Record<string, number>; // 아수라장 판 중 해당 필드가 있는 판 수
  champSelect: { mine: ChampRecord | null; bench: ChampRecord[]; team: ChampRecord[] } | null;
  names: { champions: Record<number, string>; items: Record<number, string>; augments: Record<number, string> };
  icons: { champions: Record<number, string>; items: Record<number, string>; augments: Record<number, string> };
  updatedAt: number;
};

const state: State = {
  status: 'no-client',
  message: '롤 클라이언트를 찾는 중입니다.',
  phase: null,
  me: null,
  games: [],
  scannedGames: 0,
  queueCounts: {},
  fields: {},
  champSelect: null,
  names: { champions: {}, items: {}, augments: {} },
  icons: { champions: {}, items: {}, augments: {} },
  updatedAt: Date.now(),
};

let creds: LcuCreds | null = null;
let myPuuid: string | null = null;
let staticLoaded = false;
let wasInGame = false;
let refreshUntil = 0;
let lastHistoryAt = 0;
let lastRawPage: unknown = null;
let lastChampSelectRaw: unknown = null;

// ───────── LCU 데이터 해석 ─────────
// 필드 이름은 LCU 실측 전 추정이다. 없는 필드는 null/빈 배열로 두고 화면에 "없음"으로 표시한다.

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function toGame(g: any): Game | null {
  const p = g?.participants?.[0];
  const s = p?.stats;
  if (!p || !s) return null;
  const items = [0, 1, 2, 3, 4, 5].map((i) => num(s[`item${i}`]) ?? 0).filter((id) => id > 0);
  const augments = Object.keys(s)
    .filter((k) => /^playerAugment\d+$/.test(k))
    .sort()
    .map((k) => num(s[k]) ?? 0)
    .filter((id) => id > 0);
  return {
    gameId: Number(g.gameId),
    playedAt: Number(g.gameCreation),
    duration: Number(g.gameDuration),
    championId: Number(p.championId),
    win: s.win === true,
    kills: num(s.kills) ?? 0,
    deaths: num(s.deaths) ?? 0,
    assists: num(s.assists) ?? 0,
    items,
    augments,
    damageToChampions: num(s.totalDamageDealtToChampions),
    damageTaken: num(s.totalDamageTaken),
    goldEarned: num(s.goldEarned),
  };
}

async function loadStatic(c: LcuCreds) {
  const tryGet = async (path: string) => {
    try {
      return await lcuGet<any[]>(c, path);
    } catch {
      return [];
    }
  };
  const [champs, items, augs] = await Promise.all([
    tryGet('/lol-game-data/assets/v1/champion-summary.json'),
    tryGet('/lol-game-data/assets/v1/items.json'),
    tryGet('/lol-game-data/assets/v1/cherry-augments.json'),
  ]);
  for (const x of champs) {
    if (x.id > 0) {
      state.names.champions[x.id] = x.name;
      if (x.squarePortraitPath) state.icons.champions[x.id] = x.squarePortraitPath;
    }
  }
  for (const x of items) {
    state.names.items[x.id] = x.name;
    if (x.iconPath) state.icons.items[x.id] = x.iconPath;
  }
  for (const x of augs) {
    state.names.augments[x.id] = x.nameTRA ?? x.name ?? `#${x.id}`;
    if (x.augmentSmallIconPath) state.icons.augments[x.id] = x.augmentSmallIconPath;
  }
  staticLoaded = true;
}

async function loadHistory(c: LcuCreds) {
  if (!myPuuid) return;
  const games: Game[] = [];
  const queueCounts: Record<string, number> = {};
  let scanned = 0;
  for (let page = 0; page < HISTORY_PAGES; page++) {
    const beg = page * 20;
    const res = await lcuGet<any>(c, `/lol-match-history/v1/products/lol/${myPuuid}/matches?begIndex=${beg}&endIndex=${beg + 19}`);
    if (page === 0) lastRawPage = res;
    const list: any[] = res?.games?.games ?? [];
    for (const g of list) {
      scanned++;
      const q = Number(g.queueId);
      queueCounts[q] = (queueCounts[q] ?? 0) + 1;
      if (q !== MAYHEM_QUEUE) continue;
      const parsed = toGame(g);
      if (parsed) games.push(parsed);
    }
    if (list.length < 20) break;
  }
  // 페이지가 겹쳐 올 수 있으므로 gameId 로 중복 제거
  const seen = new Set<number>();
  state.games = games.filter((g) => !seen.has(g.gameId) && seen.add(g.gameId)).sort((a, b) => b.playedAt - a.playedAt);
  state.scannedGames = scanned;
  state.queueCounts = queueCounts;
  state.fields = {
    '아이템': state.games.filter((g) => g.items.length > 0).length,
    '증강': state.games.filter((g) => g.augments.length > 0).length,
    '챔피언 딜량': state.games.filter((g) => g.damageToChampions !== null).length,
    '받은 딜': state.games.filter((g) => g.damageTaken !== null).length,
    '골드': state.games.filter((g) => g.goldEarned !== null).length,
  };
  lastHistoryAt = Date.now();
}

function recordOf(championId: number): ChampRecord {
  const gs = state.games.filter((g) => g.championId === championId);
  return { championId, n: gs.length, w: gs.filter((g) => g.win).length };
}

async function loadChampSelect(c: LcuCreds) {
  const s = await lcuGet<any>(c, '/lol-champ-select/v1/session');
  lastChampSelectRaw = s;
  const me = (s.myTeam ?? []).find((m: any) => m.cellId === s.localPlayerCellId);
  const bench: number[] = (s.benchChampions ?? []).map((b: any) => Number(b.championId ?? b)).concat((s.benchChampionIds ?? []).map(Number));
  const team: number[] = (s.myTeam ?? []).filter((m: any) => m.cellId !== s.localPlayerCellId).map((m: any) => Number(m.championId));
  state.champSelect = {
    mine: me?.championId ? recordOf(Number(me.championId)) : null,
    bench: [...new Set(bench)].filter((id) => id > 0).map(recordOf),
    team: team.filter((id) => id > 0).map(recordOf),
  };
}

// ───────── 주기 확인 ─────────

/** 한 번 확인하고, 다음 확인까지 기다릴 시간을 돌려준다. */
async function tick(): Promise<number> {
  state.updatedAt = Date.now();

  // 게임 중이면 롤 쪽으로 아무 요청도 하지 않는다
  if (await isGameRunning()) {
    wasInGame = true;
    state.status = 'in-game';
    state.message = '게임 중입니다. 끝날 때까지 롤 클라이언트에 아무 요청도 보내지 않습니다.';
    state.champSelect = null;
    return INTERVAL_MS.inGame;
  }

  creds ??= await discover();
  if (!creds) {
    state.status = 'no-client';
    state.message = '롤 클라이언트가 꺼져 있습니다. 클라이언트를 켜면 자동으로 연결됩니다.';
    return INTERVAL_MS.noClient;
  }

  try {
    if (!myPuuid) {
      const me = await lcuGet<any>(creds, '/lol-summoner/v1/current-summoner');
      myPuuid = me.puuid;
      state.me = { gameName: me.gameName ?? me.displayName ?? '?', tagLine: me.tagLine ?? '' };
    }
    if (!staticLoaded) await loadStatic(creds);
    if (lastHistoryAt === 0) await loadHistory(creds);

    if (wasInGame) {
      wasInGame = false;
      refreshUntil = Date.now() + AFTER_GAME_REFRESH_MS;
    }
    // 게임 직후에는 새 판이 기록될 때까지 다시 읽는다
    if (Date.now() < refreshUntil && Date.now() - lastHistoryAt > AFTER_GAME_RELOAD_MS) await loadHistory(creds);

    state.phase = await lcuGet<string>(creds, '/lol-gameflow/v1/gameflow-phase');
    if (state.phase === 'ChampSelect') await loadChampSelect(creds);
    else state.champSelect = null;

    state.status = 'ready';
    state.message = '연결됨';
    return state.phase === 'ChampSelect' ? INTERVAL_MS.champSelect : INTERVAL_MS.idle;
  } catch (e) {
    // 클라이언트 재시작 등으로 포트·토큰이 바뀌었을 수 있으므로 다시 찾는다
    creds = null;
    myPuuid = null;
    staticLoaded = false;
    lastHistoryAt = 0;
    state.status = 'error';
    state.message = `클라이언트 연결 오류: ${e instanceof Error ? e.message : e}`;
    return INTERVAL_MS.error;
  }
}

async function loop() {
  const next = await tick().catch((e) => {
    console.error('[tick]', e);
    return INTERVAL_MS.error;
  });
  setTimeout(loop, next);
}

// ───────── 진단 파일 ─────────

const PERSONAL_KEYS = new Set(['gameName', 'tagLine', 'summonerName', 'displayName', 'internalName', 'riotIdGameName', 'riotIdTagline', 'summonerId', 'accountId', 'currentAccountId', 'profileIcon', 'matchHistoryUri']);

/** 다른 플레이어 식별 정보를 지운다. 내 PUUID 는 ME, 다른 PUUID 는 P1, P2 … */
function anonymize(data: unknown): unknown {
  const alias = new Map<string, string>();
  const walk = (v: any, key = ''): any => {
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    if (key === 'puuid' && typeof v === 'string' && v) {
      if (v === myPuuid) return 'ME';
      if (!alias.has(v)) alias.set(v, `P${alias.size + 1}`);
      return alias.get(v);
    }
    if (PERSONAL_KEYS.has(key)) return '(익명)';
    return v;
  };
  return walk(data);
}

async function exportDiagnostics(): Promise<string> {
  if (!creds) throw new Error('롤 클라이언트가 연결되어 있지 않습니다.');
  if (await isGameRunning()) throw new Error('게임 중에는 진단 파일을 만들지 않습니다.');
  const latest = state.games[0];
  const detail = latest ? await lcuGet(creds, `/lol-match-history/v1/games/${latest.gameId}`).catch((e) => ({ error: String(e) })) : null;
  const payload = {
    exportedAt: new Date().toISOString(),
    appVersion: VERSION,
    phase: state.phase,
    scannedGames: state.scannedGames,
    queueCounts: state.queueCounts,
    mayhemGames: state.games.length,
    fields: state.fields,
    staticCounts: {
      champions: Object.keys(state.names.champions).length,
      items: Object.keys(state.names.items).length,
      augments: Object.keys(state.names.augments).length,
    },
    unknownAugmentIds: [...new Set(state.games.flatMap((g) => g.augments))].filter((id) => !state.names.augments[id]),
    firstPageRaw: anonymize(lastRawPage),
    latestMayhemDetailRaw: anonymize(detail),
    champSelectRaw: anonymize(lastChampSelectRaw),
  };
  await mkdir(DIAG_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const file = join(DIAG_DIR, `prism-diagnostic-${stamp}.json`);
  await writeFile(file, JSON.stringify(payload, null, 2));
  return file;
}

// ───────── 로컬 화면 ─────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(await readFile(join(HERE, 'public', 'index.html')));
    }
    if (url.pathname === '/api/state') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ...state, version: VERSION }));
    }
    if (url.pathname === '/api/export' && req.method === 'POST') {
      const file = await exportDiagnostics();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ file }));
    }
    if (url.pathname === '/asset') {
      // 게임 중에는 아이콘도 클라이언트에서 받지 않는다
      if (!creds || state.status === 'in-game') throw new Error('클라이언트 미연결');
      const r = await lcuAsset(creds, url.searchParams.get('path') ?? '');
      res.writeHead(200, { 'Content-Type': r.type || 'image/png', 'Cache-Control': 'max-age=86400' });
      return res.end(r.body);
    }
    res.writeHead(404).end();
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
  }
});

// 다른 PC 에서 접근하지 못하도록 127.0.0.1 에만 연다
server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`Prism 앱 v${VERSION} — ${url}`);
  console.log('서버로 보내는 데이터는 없습니다. 종료하려면 Ctrl+C');
  if (process.platform === 'win32' && !process.env.PRISM_NO_OPEN) exec(`start "" "${url}"`);
  loop();
});
