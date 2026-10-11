/**
 * Prism 앱 (v0.2) — 롤 옆에 켜두는 동반 앱.
 *
 * 혼자서도: 내 증강 기록, 아수라장 도감, 챔프 선택 벤치 비교 (LCU 만으로 계산)
 * Prism 회원이면: 케미, 모임 챔피언·증강 통계, 장인, 한 줄 팁, 모임 보드 (서버)
 *
 * 원칙: LCU 는 읽기만. 게임 중에는 롤에 아무 요청도 하지 않는다.
 *       서버 업로드는 디스코드 로그인 + 수집 동의 이후에만.
 *
 * 실행: npm run app  →  http://127.0.0.1:5199
 */
import { exec } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureTraits, getAsset, loadCachedStatics, loadStaticsFromCdragon, loadStaticsFromClient, statics } from './assets.js';
import { chat, deleteChat, sendChat, startChat, stopChat, subscribe } from './chat.js';
import { SERVER_URL } from './config.js';
import { loadHistory, personalStats, type Game, type Personal } from './history.js';
import { discover, isGameRunning, lcuGet, type LcuCreds } from './lcu.js';
import { api, ApiError, finishLogin, loginUrl, logout, prism, refreshMe, setConsent, syncCrew, uploadOwn } from './prism.js';

const VERSION = '0.3.0';
const PORT = 5199;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const HERE = dirname(fileURLToPath(import.meta.url));
const DIAG_DIR = join(HERE, '..', 'diagnostics');

// 확인 간격 — 상황별로 다르게. 챔프 선택 때만 촘촘히 본다.
const INTERVAL_MS = {
  noClient: 20_000, // 클라이언트 꺼짐: OS 프로세스만 확인
  inGame: 30_000, // 게임 중: OS 프로세스만 확인, 롤에는 요청 없음
  idle: 15_000, // 대기·로비·매칭
  champSelect: 5_000, // 챔프 선택: 벤치 교체를 따라가야 해서 짧게
  error: 10_000,
};
const AFTER_GAME_REFRESH_MS = 180_000; // 게임 종료 후 기록이 LCU 에 뜰 때까지 재조회하는 시간
const AFTER_GAME_RELOAD_MS = 30_000;

// ───────── 상태 ─────────

type ChampSelect = {
  mine: number | null;
  bench: number[];
  team: number[];
  teammatePuuids: string[];
  teamSlots: { championId: number; puuid: string }[]; // 팀원 칸 순서 그대로 (챔피언과 puuid 짝)
  crew: any | null; // 서버 /api/champselect 응답
  traits: Record<number, unknown>; // 챔피언 성향 (팀 밸런스용)
};

const state = {
  status: 'no-client' as 'no-client' | 'in-game' | 'ready' | 'error',
  message: '롤 클라이언트를 찾는 중입니다.',
  phase: null as string | null,
  me: null as { gameName: string; tagLine: string } | null,
  games: [] as Game[],
  personal: null as Personal | null,
  scannedGames: 0,
  queueCounts: {} as Record<string, number>,
  fields: {} as Record<string, number>,
  champSelect: null as ChampSelect | null,
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
let champSelectKey = '';
let loginNonce: string | null = null; // 다른 사이트가 /auth/done 으로 남의 code 를 밀어넣지 못하게

// ───────── LCU ─────────


async function refreshHistory(c: LcuCreds) {
  if (!myPuuid) return;
  const h = await loadHistory(c, myPuuid);
  lastRawPage = h.firstPage;
  state.games = h.games;
  state.scannedGames = h.scanned;
  state.queueCounts = h.queueCounts;
  state.personal = personalStats(h.games);
  const n = (f: (g: Game) => boolean) => h.games.filter(f).length;
  state.fields = {
    '아이템': n((g) => g.items.length > 0),
    '증강': n((g) => g.augments.length > 0),
    '챔피언 딜량': n((g) => g.damageToChampions !== null),
    '받은 딜': n((g) => g.damageTaken !== null),
    '골드': n((g) => g.goldEarned !== null),
  };
  lastHistoryAt = Date.now();
  // 업로드는 화면 갱신을 막지 않도록 뒤에서
  void uploadOwn(c, h.games);
}

async function loadChampSelect(c: LcuCreds) {
  const s = await lcuGet<any>(c, '/lol-champ-select/v1/session');
  lastChampSelectRaw = s;
  const myTeam: any[] = s.myTeam ?? [];
  const me = myTeam.find((m) => m.cellId === s.localPlayerCellId);
  const bench = [...(s.benchChampions ?? []).map((b: any) => Number(b.championId ?? b)), ...(s.benchChampionIds ?? []).map(Number)].filter((id) => id > 0);
  const others = myTeam.filter((m) => m.cellId !== s.localPlayerCellId);
  const cs: ChampSelect = {
    mine: Number(me?.championId) > 0 ? Number(me.championId) : null,
    bench: [...new Set(bench)],
    team: others.map((m) => Number(m.championId)).filter((id) => id > 0),
    teammatePuuids: others.map((m) => String(m.puuid ?? '')).filter(Boolean),
    teamSlots: others.map((m) => ({ championId: Number(m.championId) || 0, puuid: String(m.puuid ?? '') })),
    crew: state.champSelect?.crew ?? null,
    traits: state.champSelect?.traits ?? {},
  };
  state.champSelect = cs;
  // 역할·피해 유형·단단함 등 성향 (팀 밸런스 계산용). 처음 보는 챔피언만 읽고 저장한다
  await ensureTraits([cs.mine ?? 0, ...cs.bench, ...cs.team], c);
  cs.traits = Object.fromEntries([cs.mine ?? 0, ...cs.bench, ...cs.team].filter((id) => statics.traits[id]).map((id) => [id, statics.traits[id]]));

  // 챔피언·팀원 구성이 바뀌었을 때만 서버에 묻는다
  const ids = [cs.mine, ...cs.bench].filter((x): x is number => x !== null);
  const key = JSON.stringify([ids.slice().sort(), cs.teammatePuuids.slice().sort()]);
  if (prism.loggedIn && key !== champSelectKey) {
    champSelectKey = key;
    api('/api/champselect', { method: 'POST', body: { championIds: ids, teammatePuuids: cs.teammatePuuids } })
      .then((r) => state.champSelect && (state.champSelect.crew = r))
      .catch(() => {});
  }
}

/** 다른 회원 대신 수집을 멈춰야 하는가: 게임이 시작됐거나 챔프 선택 중이면 */
async function busy() {
  if (await isGameRunning()) return true;
  if (!creds) return true;
  const phase = await lcuGet<string>(creds, '/lol-gameflow/v1/gameflow-phase').catch(() => 'Unknown');
  return !['None', 'Lobby', 'EndOfGame', 'WaitingForStats', 'PreEndOfGame'].includes(phase);
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
    // 캐시가 비어 있으면 공개 서버에서 챔피언 목록을 받아 둔다 (클라이언트 없이도 썸네일·이름 표시)
    void loadStaticsFromCdragon();
    return INTERVAL_MS.noClient;
  }

  try {
    if (!myPuuid) {
      const me = await lcuGet<any>(creds, '/lol-summoner/v1/current-summoner');
      myPuuid = me.puuid;
      state.me = { gameName: me.gameName ?? me.displayName ?? '?', tagLine: me.tagLine ?? '' };
    }
    // 패치가 바뀌었을 수 있으므로 접속할 때마다 클라이언트에서 최신 목록을 받아 캐시를 갱신한다
    if (!staticLoaded) staticLoaded = await loadStaticsFromClient(creds);
    if (lastHistoryAt === 0) await refreshHistory(creds);

    if (wasInGame) {
      wasInGame = false;
      refreshUntil = Date.now() + AFTER_GAME_REFRESH_MS;
    }
    if (Date.now() < refreshUntil && Date.now() - lastHistoryAt > AFTER_GAME_RELOAD_MS) await refreshHistory(creds);

    state.phase = await lcuGet<string>(creds, '/lol-gameflow/v1/gameflow-phase');
    if (state.phase === 'ChampSelect') await loadChampSelect(creds);
    else {
      state.champSelect = null;
      champSelectKey = '';
    }

    state.status = 'ready';
    state.message = '연결됨';
    // 한가할 때 다른 회원 전적 대신 수집 (30분에 1회, 바쁘면 즉시 멈춤)
    if (state.phase === 'None' || state.phase === 'Lobby') void syncCrew(creds, myPuuid!, busy);
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

const PERSONAL_KEYS = new Set(['gameName', 'tagLine', 'summonerName', 'displayName', 'internalName', 'riotIdGameName', 'riotIdTagline', 'summonerId', 'accountId', 'currentAccountId', 'profileIcon', 'matchHistoryUri', 'nameVisibilityType', 'obfuscatedPuuid', 'obfuscatedSummonerId']);

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
    staticCounts: { champions: Object.keys(statics.champions).length, items: Object.keys(statics.items).length, augments: Object.keys(statics.augments).length },
    unknownAugmentIds: [...new Set(state.games.flatMap((g) => g.augments))].filter((id) => !statics.augments[id]),
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

const send = (res: ServerResponse, status: number, data: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
}

/** 브라우저 화면 → 서버 중계. 토큰은 앱만 갖고 있고 화면에는 내보내지 않는다 */
async function proxy(res: ServerResponse, path: string, init: { method?: string; body?: unknown } = {}) {
  try {
    send(res, 200, await api(path, init));
  } catch (e) {
    send(res, e instanceof ApiError && e.status ? e.status : 502, { error: e instanceof Error ? e.message : String(e) });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', ORIGIN);
  const p = url.pathname;
  const m = req.method ?? 'GET';

  // 다른 사이트가 이 로컬 화면에 요청을 보내지 못하게 (브라우저가 붙이는 Origin 검사)
  const origin = req.headers.origin;
  if (m !== 'GET' && origin && origin !== ORIGIN && origin !== `http://localhost:${PORT}`) return send(res, 403, { error: 'forbidden' });

  try {
    if (p === '/' && m === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(await readFile(join(HERE, 'public', 'index.html')));
    }
    if (p === '/api/state') return send(res, 200, { ...state, prism, chat: { connected: chat.connected, online: chat.online.length }, server: SERVER_URL, version: VERSION });
    if (p === '/api/static') return send(res, 200, statics);
    if (p === '/api/export' && m === 'POST') return send(res, 200, { file: await exportDiagnostics() });

    if (p === '/asset') {
      // 캐시 → 클라이언트(게임 중 아닐 때) → 공개 서버 순서. 게임 중에도 캐시된 썸네일은 보인다
      const r = await getAsset(url.searchParams.get('path') ?? '', creds, state.status === 'in-game');
      if (!r) return send(res, 404, { error: '아이콘 없음' });
      res.writeHead(200, { 'Content-Type': r.type, 'Cache-Control': 'max-age=86400' });
      return res.end(r.body);
    }

    // 글꼴 (Pretendard, 앱에 포함)
    if (p === '/fonts/PretendardVariable.woff2') {
      res.writeHead(200, { 'Content-Type': 'font/woff2', 'Cache-Control': 'max-age=31536000' });
      return res.end(await readFile(join(HERE, 'public', 'fonts', 'PretendardVariable.woff2')));
    }

    // 로고 등 정적 파일 (brand 폴더만)
    if (p.startsWith('/brand/')) {
      const name = basename(p);
      const type = { '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' }[extname(name)];
      if (!type) return send(res, 404, { error: 'not found' });
      const file = await readFile(join(HERE, 'public', 'brand', name)).catch(() => null);
      if (!file) return send(res, 404, { error: 'not found' });
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'max-age=86400' });
      return res.end(file);
    }

    // 채팅: 화면은 SSE 로 받고, 보내기·지우기는 POST
    if (p === '/api/chat/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      const off = subscribe((e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
      const keep = setInterval(() => res.write(': keep\n\n'), 25_000);
      req.on('close', () => {
        off();
        clearInterval(keep);
      });
      return;
    }
    if (p === '/api/chat/send' && m === 'POST') {
      const { text } = await readBody(req);
      try {
        sendChat(String(text ?? ''));
        return send(res, 200, { ok: true });
      } catch (e) {
        return send(res, 503, { error: e instanceof Error ? e.message : String(e) });
      }
    }
    if (p === '/api/chat/delete' && m === 'POST') {
      const { id } = await readBody(req);
      if (Number.isInteger(id)) deleteChat(id);
      return send(res, 200, { ok: true });
    }

    // 로그인
    if (p === '/auth/login') {
      if (!SERVER_URL) return send(res, 400, { error: '서버 주소가 설정되지 않았습니다.' });
      loginNonce = randomBytes(16).toString('hex');
      res.writeHead(302, { Location: loginUrl(`${ORIGIN}/auth/done?n=${loginNonce}`) });
      return res.end();
    }
    if (p === '/auth/done') {
      const code = url.searchParams.get('code');
      const ok = loginNonce !== null && url.searchParams.get('n') === loginNonce;
      loginNonce = null;
      if (!ok) prism.error = '로그인 요청이 맞지 않습니다. 앱에서 다시 로그인해주세요.';
      else if (code) await finishLogin(code).then(startChat).catch((e) => (prism.error = e instanceof Error ? e.message : String(e)));
      res.writeHead(302, { Location: '/#prism' });
      return res.end();
    }

    // Prism (서버)
    if (p === '/api/prism/logout' && m === 'POST') {
      stopChat();
      await logout();
      return send(res, 200, { ok: true });
    }
    if (p === '/api/prism/consent' && m === 'POST') {
      const { agree } = await readBody(req);
      const account = myPuuid && state.me ? { puuid: myPuuid, riotId: `${state.me.gameName}#${state.me.tagLine}` } : null;
      try {
        await setConsent(agree === true, account);
        if (agree === true && creds) void refreshHistory(creds);
        return send(res, 200, { ok: true });
      } catch (e) {
        return send(res, e instanceof ApiError && e.status ? e.status : 400, { error: e instanceof Error ? e.message : String(e) });
      }
    }
    if (p === '/api/prism/profile' && m === 'POST') return proxy(res, '/api/me/profile', { method: 'POST', body: await readBody(req) }).then(refreshMe);
    if (p === '/api/prism/board') return proxy(res, '/api/board');
    if (p === '/api/prism/tips' && m === 'POST') return proxy(res, '/api/tips', { method: 'POST', body: await readBody(req) });
    const champ = p.match(/^\/api\/prism\/champions\/(\d+)$/);
    if (champ) return proxy(res, `/api/champions/${champ[1]}`);
    const like = p.match(/^\/api\/prism\/tips\/(\d+)\/like$/);
    if (like && m === 'POST') return proxy(res, `/api/tips/${like[1]}/like`, { method: 'POST' });
    const tip = p.match(/^\/api\/prism\/tips\/(\d+)$/);
    if (tip && m === 'DELETE') return proxy(res, `/api/tips/${tip[1]}`, { method: 'DELETE' });

    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

// 다른 PC 에서 접근하지 못하도록 127.0.0.1 에만 연다
server.listen(PORT, '127.0.0.1', async () => {
  await loadCachedStatics();
  console.log(`Prism 앱 v${VERSION} — ${ORIGIN}`);
  console.log(SERVER_URL ? `Prism 서버: ${SERVER_URL}` : 'Prism 서버 미설정 — 혼자 쓰는 기능만 동작합니다.');
  console.log('종료하려면 Ctrl+C');
  await refreshMe();
  if (prism.loggedIn) startChat();
  if (process.platform === 'win32' && !process.env.PRISM_NO_OPEN) exec(`start "" "${ORIGIN}"`);
  loop();
});
