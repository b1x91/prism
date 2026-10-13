/**
 * 개발용: 브라우저에서 앱 화면을 볼 때 Rust 명령 대신 응답하는 작은 서버 (127.0.0.1:5199).
 * 롤 클라이언트는 모의 데이터. 서버는 로컬 wrangler(8787, DEV_LOGIN=1)를 쓴다.
 *   node apps/desktop/dev-bridge.mjs        장면 바꾸기: POST /scene {"scene":"champ-select"|"in-game"|"idle"|"no-client"}
 * 배포 앱에는 들어가지 않는다.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const SERVER = process.env.PRISM_SERVER ?? 'http://127.0.0.1:8787';
const champs = Object.keys(JSON.parse(readFileSync(new URL('../../packages/core/data/mayhem-champions.json', import.meta.url))).champions).map(Number);
const augs = JSON.parse(readFileSync(new URL('../../packages/core/data/mayhem-augments.json', import.meta.url))).augments.map((a) => a.id);
let scene = process.env.SCENE ?? 'champ-select';
let token = null;
let auto = false;

// 결정적 의사난수 (스크린샷이 매번 같게)
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const ME = { puuid: 'puuid-me', gameName: '하제', tagLine: 'KR1' };
const FAV = [222, 103, 99, 51, 25, 89];
const games = Array.from({ length: 34 }, (_, i) => {
  const win = rnd() < 0.56;
  const stats = { win, kills: Math.floor(rnd() * 18), deaths: Math.floor(rnd() * 10), assists: Math.floor(rnd() * 30), goldEarned: 12000 + Math.floor(rnd() * 6000), totalDamageDealtToChampions: 20000 + Math.floor(rnd() * 40000), totalDamageTaken: 15000 + Math.floor(rnd() * 30000) };
  [1, 2, 3, 4].forEach((k) => { stats[`playerAugment${k}`] = pick(augs); });
  return { gameId: 7100000000 + i, queueId: i % 5 === 4 ? 450 : 2400, gameCreation: Date.now() - i * 5.5 * 3600_000, gameDuration: 900 + Math.floor(rnd() * 700), participants: [{ championId: rnd() < 0.4 ? pick(FAV) : pick(champs), stats }] };
});
const CS = {
  localPlayerCellId: 0,
  myTeam: [{ cellId: 0, championId: 222, puuid: ME.puuid }, { cellId: 1, championId: 54, puuid: 'puuid-m2' }, { cellId: 2, championId: 103, puuid: 'p3' }, { cellId: 3, championId: 0, puuid: 'p4' }, { cellId: 4, championId: 22, puuid: 'p5' }],
  benchChampions: [12, 99, 89, 412, 67, 25, 41, 86, 63, 157].map((championId) => ({ championId })),
};

const lcu = (path) => {
  if (path === '/lol-summoner/v1/current-summoner') return ME;
  if (path === '/lol-gameflow/v1/gameflow-phase') return scene === 'champ-select' ? 'ChampSelect' : 'Lobby';
  if (path === '/lol-champ-select/v1/session') return CS;
  const d = path.match(/^\/lol-match-history\/v1\/games\/(\d+)$/);
  if (d) {
    const g = games.find((x) => x.gameId === +d[1]);
    if (!g) throw '없는 판';
    const ps = Array.from({ length: 10 }, (_, i) => ({ participantId: i + 1, teamId: i < 5 ? 100 : 200, championId: i ? pick(champs) : g.participants[0].championId, stats: i ? { win: (i < 5) === g.participants[0].stats.win, kills: 5, deaths: 5, assists: 10 } : g.participants[0].stats }));
    return { gameId: g.gameId, queueId: g.queueId, gameCreation: g.gameCreation, gameDuration: g.gameDuration, participants: ps, participantIdentities: ps.map((p) => ({ participantId: p.participantId, player: p.participantId === 1 ? ME : { puuid: `other-${p.participantId}` } })) };
  }
  const m = path.match(/matches\?begIndex=(\d+)&endIndex=(\d+)/);
  if (m) return { games: { games: games.slice(+m[1], +m[2] + 1) } };
  throw '허용되지 않은 경로';
};

async function api({ method, path, body }) {
  const r = await fetch(SERVER + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) token = null;
  if (!r.ok) throw d.error ?? `서버 오류 (${r.status})`;
  return d;
}

async function login() {
  const back = 'http://127.0.0.1:5199/done';
  const r = await fetch(`${SERVER}/auth/dev?id=me1&name=${encodeURIComponent('하제')}&redirect=${encodeURIComponent(back)}`, { redirect: 'manual' });
  const code = new URL(r.headers.get('location')).searchParams.get('code');
  token = (await api({ method: 'POST', path: '/api/app/token', body: { code } })).token;
}

const CMD = {
  lcu_status: () => ({ client: scene !== 'no-client', inGame: scene === 'in-game' }),
  lcu_get: ({ path }) => lcu(path),
  session: () => ({ configured: true, loggedIn: Boolean(token) }),
  login,
  logout: () => { token = null; return null; },
  open_url: () => null,
  autostart: ({ enable }) => { if (enable !== undefined) auto = enable; return auto; },
  api,
};

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.end();
  let raw = '';
  for await (const c of req) raw += c;
  const args = raw ? JSON.parse(raw) : {};
  const name = req.url.slice(1);
  const send = (status, v) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(v ?? null)); };
  if (name === 'scene') { scene = args.scene; return send(200, { scene }); }
  if (!CMD[name]) return send(404, { error: 'unknown' });
  try { send(200, await CMD[name](args)); } catch (e) { send(400, { error: typeof e === 'string' ? e : e.message }); }
}).listen(5199, '127.0.0.1', () => console.log(`dev-bridge :5199 · scene=${scene}`));
