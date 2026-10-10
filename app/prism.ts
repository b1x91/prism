/**
 * Prism 서버 연동: 로그인, 수집 동의, 전적 업로드, 회원 전적 대신 수집, 모임 기능 조회.
 * 업로드는 로그인 + 수집 동의 이후에만 한다.
 */
import { DEV_LOGIN, loadConfig, saveConfig, SERVER_URL } from './config.js';
import { loadHistory, MAYHEM_QUEUE, toIngestGame, type Game } from './history.js';
import { lcuGet, type LcuCreds } from './lcu.js';

const TIMEOUT_MS = 10_000;
const BATCH = 10; // 한 번에 올리는 판 수
const CREW_SYNC_EVERY_MS = 30 * 60_000;
const CREW_STEP_DELAY_MS = 1_500; // 다른 회원 전적 조회 사이 간격 (클라이언트 부하 방지)

export type PrismMe = { id: string; nick: string; tier: string; riotId: string | null; linked: boolean; consent: boolean; games: { n: number; w: number } };

export const prism = {
  configured: Boolean(SERVER_URL),
  loggedIn: false,
  me: null as PrismMe | null,
  error: null as string | null,
  upload: { lastAt: 0, sent: 0, stored: 0, lastError: null as string | null },
  crewSync: { lastAt: 0, running: false, members: 0, games: 0, lastError: null as string | null },
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** 서버 호출. 네트워크 오류는 1회 재시도. 401 이면 로그아웃 처리 */
export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!SERVER_URL) throw new ApiError(0, '서버 주소가 설정되지 않았습니다.');
  const { token } = await loadConfig();
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(SERVER_URL + path, {
        method: init.method ?? 'GET',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      if (attempt < 1) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw new ApiError(0, `서버 연결 실패: ${e instanceof Error ? e.message : e}`);
    }
    const data = (await res.json().catch(() => ({}))) as any;
    if (res.status === 401) {
      await saveConfig({ token: null });
      prism.loggedIn = false;
      prism.me = null;
    }
    if (!res.ok) throw new ApiError(res.status, data.error ?? `서버 오류 (${res.status})`);
    return data as T;
  }
}

/** callback 은 앱 로컬 주소 (nonce 포함). 서버가 code 를 붙여 돌려보낸다 */
export function loginUrl(callback: string) {
  const redirect = encodeURIComponent(callback);
  return DEV_LOGIN ? `${SERVER_URL}/auth/dev?id=${encodeURIComponent(process.env.PRISM_DEV_ID ?? 'dev-1')}&name=${encodeURIComponent(process.env.PRISM_DEV_NAME ?? '개발자')}&redirect=${redirect}` : `${SERVER_URL}/auth/discord/start?redirect=${redirect}`;
}

export async function finishLogin(code: string) {
  const { token } = await api<{ token: string }>('/api/app/token', { method: 'POST', body: { code } });
  await saveConfig({ token });
  await refreshMe();
}

export async function logout() {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  await saveConfig({ token: null });
  prism.loggedIn = false;
  prism.me = null;
}

export async function refreshMe() {
  if (!SERVER_URL || !(await loadConfig()).token) {
    prism.loggedIn = false;
    return;
  }
  try {
    prism.me = await api<PrismMe>('/api/me');
    prism.loggedIn = true;
    prism.error = null;
  } catch (e) {
    prism.error = e instanceof Error ? e.message : String(e);
  }
}

/** 수집 동의 (또는 철회). 동의할 때 지금 클라이언트에 로그인된 롤 계정을 연결한다 */
export async function setConsent(agree: boolean, account: { puuid: string; riotId: string } | null) {
  if (agree) {
    if (!account) throw new Error('롤 클라이언트를 켠 상태에서 동의해주세요. 연결할 계정을 확인해야 합니다.');
    await api('/api/me/riot', { method: 'POST', body: account });
  }
  await api('/api/me/consent', { method: 'POST', body: { agree } });
  await refreshMe();
}

const canUpload = () => prism.loggedIn && prism.me?.consent === true;

async function sendGames(creds: LcuCreds, gameIds: number[]) {
  const cfg = await loadConfig();
  const done = new Set(cfg.uploaded);
  const todo = gameIds.filter((id) => !done.has(id));
  for (let i = 0; i < todo.length; i += BATCH) {
    const games = [];
    for (const id of todo.slice(i, i + BATCH)) {
      const d = await lcuGet(creds, `/lol-match-history/v1/games/${id}`);
      if (Number(d?.queueId) === MAYHEM_QUEUE) games.push(toIngestGame(d));
    }
    if (games.length) {
      const r = await api<{ stored: number }>('/api/ingest', { method: 'POST', body: { source: 'lcu', games } });
      prism.upload.sent += games.length;
      prism.upload.stored += r.stored;
    }
    await saveConfig({ uploaded: [...(await loadConfig()).uploaded, ...todo.slice(i, i + BATCH)] });
  }
}

/** 내 아수라장 판 업로드 (상세 10명 포함) */
export async function uploadOwn(creds: LcuCreds, games: Game[]) {
  if (!canUpload()) return;
  try {
    await sendGames(
      creds,
      games.map((g) => g.gameId),
    );
    prism.upload.lastAt = Date.now();
    prism.upload.lastError = null;
  } catch (e) {
    prism.upload.lastError = e instanceof Error ? e.message : String(e);
  }
}

/**
 * 동의한 다른 회원의 최근 20판을 이 PC 의 클라이언트로 조회해 업로드한다.
 * 클라이언트가 한가할 때만 (shouldStop 이 true 가 되면 즉시 멈춘다). 30분에 1회.
 */
export async function syncCrew(creds: LcuCreds, myPuuid: string, shouldStop: () => Promise<boolean>) {
  if (!canUpload() || prism.crewSync.running) return;
  const cfg = await loadConfig();
  if (Date.now() - cfg.lastCrewSyncAt < CREW_SYNC_EVERY_MS) return;
  prism.crewSync.running = true;
  prism.crewSync.members = 0;
  prism.crewSync.games = 0;
  try {
    const { targets } = await api<{ targets: { puuid: string; lastPlayedAt: number | null }[] }>('/api/crew/targets');
    for (const t of targets) {
      if (t.puuid === myPuuid) continue;
      if (await shouldStop()) return;
      await new Promise((r) => setTimeout(r, CREW_STEP_DELAY_MS));
      const h = await loadHistory(creds, t.puuid, 1).catch(() => null);
      if (!h) continue;
      // 서버에 기록된 마지막 판 이후 것만 (하루 여유)
      const since = (t.lastPlayedAt ?? 0) - 86_400_000;
      const fresh = h.games.filter((g) => g.playedAt > since).map((g) => g.gameId);
      prism.crewSync.members++;
      if (fresh.length) {
        await sendGames(creds, fresh);
        prism.crewSync.games += fresh.length;
      }
    }
    await saveConfig({ lastCrewSyncAt: Date.now() });
    prism.crewSync.lastAt = Date.now();
    prism.crewSync.lastError = null;
  } catch (e) {
    prism.crewSync.lastError = e instanceof Error ? e.message : String(e);
  } finally {
    prism.crewSync.running = false;
  }
}
