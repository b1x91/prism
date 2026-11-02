/**
 * NOW (CLAUDE.md v3.126) — 지금 모이는 팟.
 *  - 회원 앱이 롤 클라이언트의 아수라장(2400) 로비를 읽어(GET 만) 알려 준다 → 팟이 저절로 생기고 채워진다. 큐 → '출발', 게임 → '게임 중', 끝나거나 로비를 떠나면 내려간다.
 *  - 팟은 동시에 세 개까지 보인다. 비회원은 이름(태그 없이)만 남겨 첫 글자 얼굴로 보인다 (v3.140, puuid 는 남기지 않는다).
 *  - 빈자리 + = 방장에게 알림. 방장 앱이 다음에 로비를 알릴 때 받아 오른쪽 아래 알림으로 띄운다 (게임 중이면 끝난 뒤). 같은 사람은 5분에 한 번, 10분 안에 안 들어오면 사라진다.
 *  - 회원마다 '로비를 NOW에 자동으로 올리기' (members.now_auto, 기본 켜짐).
 *  - 함께 게임 중 (v3.130): 로비를 알리지 않았어도, 게임이 시작될 때 회원 앱이 읽은 그 판의 10명 중 회원이 2명 이상이면 NOW 에 띄운다.
 *    비회원은 팀별 수만 센다. 게임이 끝나면(앱이 알리거나 50분이 지나면) 내려간다.
 */
import { FACE, HttpError, json, type Env, type Member } from './util.js';

const MAX_SHOWN = 3;
const LOBBY_STALE = 3 * 60_000;   // 앱이 이만큼 소식이 없으면 로비가 없어진 것으로
const GAME_STALE = 70 * 60_000;   // 게임 중 팟은 이만큼까지 둔다
const TOGETHER_STALE = 50 * 60_000; // 함께 게임 중은 끝났다는 소식이 없으면 이만큼 뒤에 내린다
const REQ_TTL = 10 * 60_000;
const REQ_AGAIN = 5 * 60_000;
const MAYHEM = 2400;

type Face = { id: string; nick: string; skin: number | null; main: number | null };
type Row = { id: string; leader_id: string | null; reporter_id: string; members: string; size: number; phase: string; created_at: number; updated_at: number; kind?: string; teams?: string | null };
type Team = { members: Face[]; size: number; guests: string[] };
export type NowScrim = { id: string; phase: NowLobby['phase']; size: number; since: number; leader: string | null; blue: Team; red: Team; requests: Face[]; series: { blue: number; red: number; games: number } };
export type NowLobby = { id: string; phase: 'lobby' | 'queue' | 'game'; size: number; since: number; leader: string | null; members: Face[]; requests: Face[] };
type GameFace = Face & { champ: number };
export type NowGame = { id: string; since: number; custom: boolean; blue: { members: GameFace[]; size: number }; red: { members: GameFace[]; size: number } };

const ids = (s: string): string[] => { try { const v = JSON.parse(s); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } };
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

async function prune(env: Env, now: number) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM now_lobbies WHERE (phase != 'game' AND updated_at < ?1) OR (phase = 'game' AND kind != 'game' AND updated_at < ?2) OR (kind = 'game' AND created_at < ?3)").bind(now - LOBBY_STALE, now - GAME_STALE, now - TOGETHER_STALE),
    env.DB.prepare('DELETE FROM now_requests WHERE at < ? OR lobby_id NOT IN (SELECT id FROM now_lobbies)').bind(now - REQ_TTL),
  ]);
}

async function faces(env: Env, list: string[]): Promise<Map<string, Face>> {
  if (!list.length) return new Map();
  const { results } = await env.DB.prepare(`SELECT m.id, m.nick, ${FACE('m')} FROM members m WHERE m.id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(list)).all<Face>();
  return new Map(results.map((f) => [f.id, f]));
}

/** POST /api/now/lobby — 앱이 읽은 내 로비 (없으면 id: null). 방장에게 온 새 요청을 돌려준다 */
export async function reportLobby(env: Env, me: Member, body: Record<string, unknown>) {
  const now = Date.now();
  const id = str(body.id, 80);
  const phase = body.phase === 'queue' || body.phase === 'game' ? body.phase : 'lobby';
  const queue = Number(body.queue);
  const scrim = body.kind === 'scrim';
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length <= 100).slice(0, 10) : []);
  const puuids = list(body.members);
  const t100 = list(body.team100), t200 = list(body.team200);
  const off = !(me as Member & { now_auto?: number }).now_auto;
  // 로비를 떠났거나 · 자동 올리기를 껐거나 · 아수라장 로비가 아니면 내가 알린 팟을 내린다
  if (!id || off || (!scrim && queue !== MAYHEM)) {
    await env.DB.prepare("DELETE FROM now_lobbies WHERE reporter_id = ? AND kind != 'game'").bind(me.id).run();
    return json({ requests: [] });
  }
  // 다른 로비로 옮겼으면 예전 팟은 내린다
  await env.DB.prepare("DELETE FROM now_lobbies WHERE reporter_id = ? AND id != ? AND kind != 'game'").bind(me.id, id).run();
  const allP = [...new Set([...puuids, ...t100, ...t200])];
  const { results } = allP.length
    ? await env.DB.prepare('SELECT id, riot_puuid AS p FROM members WHERE riot_puuid IN (SELECT value FROM json_each(?))').bind(JSON.stringify(allP)).all<{ id: string; p: string }>()
    : { results: [] as { id: string; p: string }[] };
  const byPuuid = new Map(results.map((r) => [r.p, r.id]));
  const members = [...new Set(puuids.map((p) => byPuuid.get(p)).filter((x): x is string => Boolean(x)))];
  if (!members.includes(me.id)) members.unshift(me.id);
  const leader = byPuuid.get(String(body.leader ?? '')) ?? null;
  const size = Math.max(members.length, Math.min(scrim ? 10 : 5, puuids.length || 1));
  // 내전: 팀마다 회원 ID 와 전체 인원 (비회원은 수만)
  // 비회원 이름 (태그 없이, 첫 글자 얼굴용 — v3.140). puuid 는 대조에만 쓰고 남기지 않는다
  const nameMap = body.names && typeof body.names === 'object' ? body.names as Record<string, unknown> : {};
  const guestsOf = (ps: string[]) => ps.filter((p) => !byPuuid.has(p)).map((p) => str(nameMap[p], 24)).filter((x): x is string => Boolean(x));
  const teamOf = (ps: string[]) => ({ m: [...new Set(ps.map((p) => byPuuid.get(p)).filter((x): x is string => Boolean(x)))], n: Math.min(5, ps.length), g: guestsOf(ps).slice(0, 5) });
  const teams = scrim ? JSON.stringify({ '100': teamOf(t100), '200': teamOf(t200) }) : JSON.stringify({ g: guestsOf(puuids).slice(0, 5) });
  await env.DB.prepare(
    `INSERT INTO now_lobbies (id, leader_id, reporter_id, members, size, phase, created_at, updated_at, kind, teams) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?8, ?9)
     ON CONFLICT(id) DO UPDATE SET leader_id = ?2, reporter_id = ?3, members = ?4, size = ?5, phase = ?6, updated_at = ?7, kind = ?8, teams = ?9`,
  ).bind(id, leader, me.id, JSON.stringify(members), size, phase, now, scrim ? 'scrim' : 'party', teams).run();
  // 이미 들어온 사람의 요청은 끝
  await env.DB.prepare('DELETE FROM now_requests WHERE lobby_id = ? AND member_id IN (SELECT value FROM json_each(?))').bind(id, JSON.stringify(members)).run();
  // 방장(방장이 회원이 아니면 알려 준 사람)에게만, 게임 중이 아닐 때 새 요청을 넘긴다
  const host = leader ?? me.id;
  if (host !== me.id || phase === 'game') return json({ requests: [] });
  const { results: reqs } = await env.DB.prepare(
    'SELECT r.member_id AS id, m.nick FROM now_requests r JOIN members m ON m.id = r.member_id WHERE r.lobby_id = ? AND r.notified_at = 0 AND r.at >= ?',
  ).bind(id, now - REQ_TTL).all<{ id: string; nick: string }>();
  if (reqs.length) await env.DB.prepare('UPDATE now_requests SET notified_at = ? WHERE lobby_id = ? AND notified_at = 0').bind(now, id).run();
  return json({ requests: reqs });
}

/** GET /api/now — 지금 모이는 팟 (세 개까지) */
export async function listNow(env: Env, me: Member) {
  const now = Date.now();
  await prune(env, now);
  const { results: rows } = await env.DB.prepare('SELECT * FROM now_lobbies ORDER BY created_at ASC').all<Row>();
  const scrimRows = rows.filter((r) => r.kind === 'scrim').slice(0, 1);
  // 함께 게임 중: 내전으로 이미 보이는 판은 빼고
  const scrimMembers = new Set(scrimRows.flatMap((r) => ids(r.members)));
  // 한 회원은 한 판에만 있을 수 있다 — 같은 판을 여러 앱이 따로 알렸거나(열쇠가 달라도) 끝난 판 줄이 남아 회원이 겹치면,
  // 가장 최근에 시작한 줄 하나만 남긴다 (같은 때면 회원이 많은 줄)
  const gameRows: Row[] = [];
  const claimed = new Set<string>();
  for (const r of rows.filter((r) => r.kind === 'game' && ids(r.members).filter((x) => scrimMembers.has(x)).length < 2).sort((a, b) => b.created_at - a.created_at || ids(b.members).length - ids(a.members).length)) {
    const m = ids(r.members);
    if (m.some((x) => claimed.has(x))) continue;
    m.forEach((x) => claimed.add(x));
    gameRows.push(r);
  }
  gameRows.sort((a, b) => a.created_at - b.created_at).splice(MAX_SHOWN);
  const inGame = gameRows.map((r) => new Set(ids(r.members)));
  // 로비에서 출발해 게임 중인 팟이 같은 판으로 이미 보이면 하나만
  const results = rows.filter((r) => r.kind !== 'scrim' && r.kind !== 'game')
    .filter((r) => !(r.phase === 'game' && inGame.some((g) => ids(r.members).every((x) => g.has(x)))))
    .slice(0, MAX_SHOWN);
  const reqRows = results.length || scrimRows.length
    ? (await env.DB.prepare('SELECT lobby_id AS l, member_id AS m FROM now_requests WHERE lobby_id IN (SELECT value FROM json_each(?)) ORDER BY at ASC').bind(JSON.stringify([...results, ...scrimRows].map((r) => r.id))).all<{ l: string; m: string }>()).results
    : [];
  const all = [...new Set([...[...results, ...scrimRows, ...gameRows].flatMap((r) => ids(r.members)), ...reqRows.map((r) => r.m)])];
  const face = await faces(env, all);
  const guestNames = (raw: string | null, k?: string): string[] => {
    try { const t = JSON.parse(raw ?? '{}'); const g = k ? t?.[k]?.g : t?.g; return Array.isArray(g) ? g.filter((x: unknown): x is string => typeof x === 'string') : []; } catch { return []; }
  };
  const lobbies: NowLobby[] = results.map((r) => {
    const mem = ids(r.members).map((x) => face.get(x)).filter((x): x is Face => Boolean(x));
    // 방장을 맨 앞에
    mem.sort((a, b) => Number(b.id === r.leader_id) - Number(a.id === r.leader_id));
    return {
      id: r.id, phase: (r.phase as NowLobby['phase']) ?? 'lobby', size: Math.max(r.size, mem.length), since: r.created_at, leader: r.leader_id,
      members: mem, guests: guestNames(r.teams ?? null),
      requests: reqRows.filter((q) => q.l === r.id).map((q) => face.get(q.m)).filter((x): x is Face => Boolean(x)),
    };
  });
  const scrims: NowScrim[] = [];
  for (const r of scrimRows) {
    let t: Record<string, { m: string[]; n: number }> = {};
    try { t = JSON.parse(r.teams ?? '{}'); } catch { /* 빈 팀 */ }
    const team = (k: string): Team => { const m = (t[k]?.m ?? []).map((x) => face.get(x)).filter((x): x is Face => Boolean(x)); return { members: m, size: Math.max(m.length, Number(t[k]?.n) || 0), guests: guestNames(r.teams ?? null, k) }; };
    scrims.push({
      id: r.id, phase: (r.phase as NowLobby['phase']) ?? 'lobby', size: r.size, since: r.created_at, leader: r.leader_id,
      blue: team('100'), red: team('200'),
      requests: reqRows.filter((q) => q.l === r.id).map((q) => face.get(q.m)).filter((x): x is Face => Boolean(x)),
      series: await seriesOf(env, ids(r.members), now),
    });
  }
  const games: NowGame[] = gameRows.map((r) => {
    let t: Record<string, { m: { id: string; c: number }[]; n: number }> = {};
    try { t = JSON.parse(r.teams ?? '{}'); } catch { /* 빈 팀 */ }
    const side = (k: string) => {
      const m = (t[k]?.m ?? []).map((x) => { const f = face.get(x.id); return f ? { ...f, champ: Number(x.c) || 0 } : null; }).filter((x): x is GameFace => Boolean(x));
      return { members: m, size: Math.max(m.length, Number(t[k]?.n) || 0) };
    };
    return { id: r.id, since: r.created_at, custom: r.size === 0, blue: side('100'), red: side('200') };
  });
  return json({ auto: Boolean((me as Member & { now_auto?: number }).now_auto ?? 1), lobbies, scrims, games });
}

/**
 * POST /api/now/game — 게임이 시작될 때 앱이 읽은 그 판의 사람들 (v3.130).
 * body: { key, queue, players: [{ puuid?, riotId?, team: 100|200, champ? }] } — 끝나면 { end: key }.
 * 회원만 얼굴로 남기고 비회원은 팀별 수만. 회원이 2명 이상일 때만 띄운다. 'NOW에 자동으로 올리기'를 끈 회원은 빼고 센다.
 */
export async function reportGame(env: Env, me: Member, body: Record<string, unknown>) {
  const now = Date.now();
  const end = str(body.end, 100);
  if (end) {
    await env.DB.prepare("DELETE FROM now_lobbies WHERE id = ? AND kind = 'game'").bind(`g:${end}`).run();
    return json({ ok: true });
  }
  const key = str(body.key, 100);
  if (!key) throw new HttpError(400, 'key');
  type P = { puuid: string | null; riot: string | null; team: '100' | '200'; champ: number };
  const players: P[] = (Array.isArray(body.players) ? body.players : []).slice(0, 10).map((x: any) => ({
    puuid: str(x?.puuid, 100), riot: str(x?.riotId, 60), team: Number(x?.team) === 200 ? '200' as const : '100' as const, champ: Number(x?.champ) || 0,
  }));
  if (!players.length) return json({ ok: true });
  const { results } = await env.DB.prepare(
    `SELECT id, riot_puuid AS p, lower(riot_id) AS r, now_auto AS a FROM members
      WHERE riot_puuid IN (SELECT value FROM json_each(?1)) OR lower(riot_id) IN (SELECT value FROM json_each(?2))`,
  ).bind(JSON.stringify(players.map((x) => x.puuid).filter(Boolean)), JSON.stringify(players.map((x) => x.riot?.toLowerCase()).filter(Boolean))).all<{ id: string; p: string | null; r: string | null; a: number }>();
  const who = (x: P) => results.find((m) => (x.puuid && m.p === x.puuid) || (x.riot && m.r === x.riot.toLowerCase()));
  const teams: Record<'100' | '200', { m: { id: string; c: number }[]; n: number }> = { '100': { m: [], n: 0 }, '200': { m: [], n: 0 } };
  for (const x of players) {
    teams[x.team].n++;
    const m = who(x);
    if (m && m.a !== 0 && !teams[x.team].m.some((y) => y.id === m.id)) teams[x.team].m.push({ id: m.id, c: x.champ });
  }
  const members = [...teams['100'].m, ...teams['200'].m].map((x) => x.id);
  const id = `g:${key}`;
  if (members.length < 2) {
    await env.DB.prepare("DELETE FROM now_lobbies WHERE id = ? AND kind = 'game'").bind(id).run();
    return json({ ok: true });
  }
  // size 칸에 '아수라장(1)·사용자 설정(0)'을 적어 둔다 (이 줄은 빈자리가 없다)
  const mayhem = Number(body.queue) === MAYHEM ? 1 : 0;
  await env.DB.prepare(
    `INSERT INTO now_lobbies (id, leader_id, reporter_id, members, size, phase, created_at, updated_at, kind, teams) VALUES (?1, NULL, ?2, ?3, ?4, 'game', ?5, ?5, 'game', ?6)
     ON CONFLICT(id) DO UPDATE SET reporter_id = ?2, members = ?3, size = ?4, updated_at = ?5, teams = ?6`,
  ).bind(id, me.id, JSON.stringify(members), mayhem, now, JSON.stringify(teams)).run();
  return json({ ok: true });
}

/**
 * 오늘의 내전 점수: 지난 6시간 기록된 사용자 설정 판(queue 0) 중 이 내전 회원이 3명 이상 함께한 판 —
 * 게임 진영(블루 100 / 레드 200)으로 승패를 센다 (v3.12-2 와 같은 기준).
 */
async function seriesOf(env: Env, members: string[], now: number) {
  if (members.length < 3) return { blue: 0, red: 0, games: 0 };
  const { results } = await env.DB.prepare(
    `SELECT g.team_totals AS t FROM matches g WHERE g.queue_id = 0 AND g.played_at >= ?1
       AND (SELECT COUNT(DISTINCT p.member_id) FROM participants p WHERE p.game_id = g.game_id AND p.member_id IN (SELECT value FROM json_each(?2))) >= 3`,
  ).bind(now - 6 * 3600_000, JSON.stringify(members)).all<{ t: string }>().catch(() => ({ results: [] as { t: string }[] }));
  let blue = 0, red = 0;
  for (const r of results) { try { const t = JSON.parse(r.t); if (t?.['100']?.win) blue++; else if (t?.['200']?.win) red++; } catch { /* 건너뜀 */ } }
  return { blue, red, games: results.length };
}

/** POST /api/now/:id/request — 빈자리 + (방장에게 알림) */
export async function requestJoin(env: Env, me: Member, id: string) {
  const now = Date.now();
  const r = await env.DB.prepare('SELECT * FROM now_lobbies WHERE id = ?').bind(id).first<Row>();
  if (!r || r.phase !== 'lobby' || now - r.updated_at > LOBBY_STALE) throw new HttpError(404, '이 팟은 이미 출발했거나 없어졌어요.');
  if (ids(r.members).includes(me.id)) throw new HttpError(400, '이미 이 팟에 있어요.');
  if (r.size >= (r.kind === 'scrim' ? 10 : 5)) throw new HttpError(400, '자리가 다 찼어요.');
  const old = await env.DB.prepare('SELECT at FROM now_requests WHERE lobby_id = ? AND member_id = ?').bind(id, me.id).first<{ at: number }>();
  // 같은 사람은 5분에 한 번만 다시 알린다 (그 사이에는 기다리는 자리만 그대로)
  if (!old || now - old.at >= REQ_AGAIN) {
    await env.DB.prepare('INSERT INTO now_requests (lobby_id, member_id, at, notified_at) VALUES (?1, ?2, ?3, 0) ON CONFLICT(lobby_id, member_id) DO UPDATE SET at = ?3, notified_at = 0').bind(id, me.id, now).run();
  }
  return json({ ok: true });
}

/** POST /api/me/now-auto — 로비를 NOW에 자동으로 올리기 */
export async function setNowAuto(env: Env, me: Member, on: unknown) {
  const v = on ? 1 : 0;
  await env.DB.prepare('UPDATE members SET now_auto = ? WHERE id = ?').bind(v, me.id).run();
  if (!v) await env.DB.prepare('DELETE FROM now_lobbies WHERE reporter_id = ?').bind(me.id).run();
  return json({ auto: Boolean(v) });
}

/**
 * GET /api/now/member/:id — 회원 페이지 맨 위 '지금 게임 중' 칸 (v3.136).
 * 앱이 알린 단계(app_phase: game·select)와 챔프 + 같은 판의 NOW 줄(함께 게임 중·내전·팟)에서 같은 팀·상대 팀 회원.
 * 비회원은 수만. 앱 소식이 끊기면(PRESENCE_TTL) 없음.
 */
export type MemberLive = {
  phase: 'game' | 'select'; champ: number | null; since: number; custom: boolean;
  allies: (Face & { champ: number | null })[]; foes: (Face & { champ: number | null })[];
  allySize: number; foeSize: number;
  /** 양 팀 10명 (v3.149, 앱이 1분마다 알린 것) */
  board?: LiveBoard | null;
};
export async function memberLive(env: Env, id: string) {
  const now = Date.now();
  const m = await env.DB.prepare('SELECT app_phase AS phase, app_champ AS champ, app_phase_at AS at, app_seen_at AS seen, app_lol AS lol FROM members WHERE id = ?')
    .bind(id).first<{ phase: string | null; champ: number | null; at: number | null; seen: number | null; lol: number | null }>();
  const lb = await liveBoard(env, id, now);
  const own = m && m.lol && now - (m.seen ?? 0) <= 150_000 && (m.phase === 'game' || m.phase === 'select');
  if (!own && !lb) return json({ live: null });
  const phase: 'game' | 'select' = own && m!.phase === 'select' && !lb ? 'select' : 'game';
  const live: MemberLive = { phase, champ: (own && m!.champ) || lb?.board.mine.find((p) => p.me)?.champ || null, since: (own && m!.at) || lb?.started || now, custom: false, allies: [], foes: [], allySize: 0, foeSize: 0, board: lb?.board ?? null };
  if (lb) { live.since = Math.min(live.since, lb.started); live.custom = lb.board.custom; }
  if (phase === 'game') {
    await prune(env, now);
    const row = await env.DB.prepare(
      `SELECT * FROM now_lobbies WHERE phase = 'game' AND EXISTS (SELECT 1 FROM json_each(members) WHERE value = ?1)
        ORDER BY (kind = 'game') DESC, updated_at DESC LIMIT 1`,
    ).bind(id).first<Row>();
    if (row) {
      type Side = { m: ({ id: string; c?: number } | string)[]; n: number };
      let t: Record<string, Side> = {};
      try { t = JSON.parse(row.teams ?? '{}'); } catch { /* 팀 없음 */ }
      const pick = (s?: Side) => (s?.m ?? []).map((x) => (typeof x === 'string' ? { id: x, c: 0 } : { id: x.id, c: Number(x.c) || 0 }));
      let mine: { id: string; c: number }[] = [], theirs: { id: string; c: number }[] = [], mineN = 0, theirN = 0;
      if (t['100'] || t['200']) {
        const a = pick(t['100']), b = pick(t['200']);
        const inA = a.some((x) => x.id === id);
        [mine, theirs] = inA ? [a, b] : [b, a];
        [mineN, theirN] = inA ? [Number(t['100']?.n) || a.length, Number(t['200']?.n) || b.length] : [Number(t['200']?.n) || b.length, Number(t['100']?.n) || a.length];
      } else {
        mine = ids(row.members).map((x) => ({ id: x, c: 0 }));
        mineN = Math.max(row.size, mine.length);
      }
      const face = await faces(env, [...mine, ...theirs].map((x) => x.id));
      const conv = (l: { id: string; c: number }[]) => l.filter((x) => x.id !== id).map((x) => { const f = face.get(x.id); return f ? { ...f, champ: x.c || null } : null; }).filter((x): x is Face & { champ: number | null } => Boolean(x));
      const me = mine.find((x) => x.id === id);
      if (me?.c) live.champ = me.c;
      live.allies = conv(mine); live.foes = conv(theirs);
      live.allySize = Math.max(0, mineN - 1); live.foeSize = theirN;
      live.custom = live.custom || row.kind === 'scrim' || (row.kind === 'game' && row.size === 0);
      live.since = Math.min(live.since, row.created_at);
    }
  }
  return json({ live });
}

// ───────── 회원 페이지 '지금 게임 중' 상세 (v3.149) ─────────

const LIVE_FRESH = 5 * 60_000;      // 1분마다 오므로 5분 소식이 없으면 끝난 것으로
type LiveP = { n: string; id?: string; c: number; t: '100' | '200'; lv: number; k: number; d: number; a: number; it: number[]; au: number[] };
const nums = (v: unknown, max: number) => (Array.isArray(v) ? v.map(Number).filter((x) => Number.isInteger(x) && x > 0 && x < 1e7).slice(0, max) : []);

/**
 * POST /api/me/live — 게임 중 회원 앱이 1분마다 (게임 시작 순간엔 롤 클라이언트, 그 뒤엔 라이브 클라이언트 데이터).
 * body: { key, queue, time, players: [{ puuid?, riotId?, team, champ, level?, k?, d?, a?, items?, augments? }] } · 끝나면 { end: true }.
 * 회원은 ID 로, 비회원은 이름(태그 없이)만 남긴다.
 */
export async function reportLive(env: Env, me: Member, body: Record<string, unknown>) {
  const now = Date.now();
  if (body.end) { await env.DB.prepare('DELETE FROM live_games WHERE member_id = ?').bind(me.id).run(); return json({ ok: true }); }
  const key = str(body.key, 100);
  if (!key) throw new HttpError(400, 'key');
  const raw = (Array.isArray(body.players) ? body.players : []).slice(0, 10) as any[];
  if (raw.length < 2) return json({ ok: true });
  const riots = raw.map((x) => str(x?.riotId, 60)?.toLowerCase()).filter(Boolean);
  const puuids = raw.map((x) => str(x?.puuid, 100)).filter(Boolean);
  const { results } = await env.DB.prepare(
    `SELECT id, riot_puuid AS p, lower(riot_id) AS r, now_auto AS a FROM members WHERE riot_puuid IN (SELECT value FROM json_each(?1)) OR lower(riot_id) IN (SELECT value FROM json_each(?2))`,
  ).bind(JSON.stringify(puuids), JSON.stringify(riots)).all<{ id: string; p: string | null; r: string | null; a: number }>();
  const players: LiveP[] = raw.map((x) => {
    const riot = str(x?.riotId, 60);
    // 알린 회원 자신은 내 롤 이름으로 먼저 (같은 이름이 둘이어도 나로)
    const mine = (x?.puuid && x.puuid === me.riot_puuid) || (riot && me.riot_id && riot.toLowerCase() === me.riot_id.toLowerCase());
    const m = mine ? { id: me.id, a: me.now_auto ?? 1 } : results.find((r) => (x?.puuid && r.p === x.puuid) || (riot && r.r === riot.toLowerCase()));
    return {
      n: (riot ?? '').split('#')[0].slice(0, 24) || '?', ...(m && m.a !== 0 ? { id: m.id } : {}),
      c: Number(x?.champ) || 0, t: Number(x?.team) === 200 ? '200' : '100', lv: Math.min(30, Math.max(0, Number(x?.level) || 0)),
      k: Math.min(99, Number(x?.k) || 0), d: Math.min(99, Number(x?.d) || 0), a: Math.min(99, Number(x?.a) || 0),
      it: nums(x?.items, 7), au: nums(x?.augments, 6),
    };
  });
  const members = [...new Set(players.map((p) => p.id).filter(Boolean))];
  const old = await env.DB.prepare('SELECT game_key AS k, started_at AS s FROM live_games WHERE member_id = ?').bind(me.id).first<{ k: string; s: number }>();
  const started = old && old.k === key ? old.s : now;
  await env.DB.prepare(
    `INSERT INTO live_games (member_id, game_key, queue, players, members, game_time, started_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT(member_id) DO UPDATE SET game_key = ?2, queue = ?3, players = ?4, members = ?5, game_time = ?6, started_at = ?7, updated_at = ?8`,
  ).bind(me.id, key, Number(body.queue) || 0, JSON.stringify(players), JSON.stringify(members), Math.max(0, Math.round(Number(body.time) || 0)), started, now).run();
  return json({ ok: true });
}

export type LiveBoardPlayer = { name: string; member: Face | null; champ: number; level: number; k: number; d: number; a: number; items: number[]; augments: number[]; me: boolean };
export type LiveBoard = { time: number; at: number; custom: boolean; mine: LiveBoardPlayer[]; theirs: LiveBoardPlayer[] };

/** 이 회원이 들어 있는 가장 최근 판 (본인 앱이 알렸거나, 같은 판 다른 회원 앱이 알린 것) */
async function liveBoard(env: Env, id: string, now: number): Promise<{ board: LiveBoard; started: number } | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM live_games WHERE updated_at > ?2 AND (member_id = ?1 OR EXISTS (SELECT 1 FROM json_each(members) WHERE value = ?1)) ORDER BY (member_id = ?1) DESC, updated_at DESC LIMIT 1`,
  ).bind(id, now - LIVE_FRESH).first<{ players: string; game_time: number; started_at: number; updated_at: number; queue: number; member_id: string }>().catch(() => null);
  if (!row) return null;
  let ps: LiveP[] = [];
  try { ps = JSON.parse(row.players); } catch { return null; }
  const me = ps.find((p) => p.id === id);
  const side = me?.t ?? '100';
  const face = await faces(env, ps.map((p) => p.id).filter((x): x is string => Boolean(x)));
  const conv = (p: LiveP): LiveBoardPlayer => ({ name: p.n, member: p.id ? face.get(p.id) ?? null : null, champ: p.c, level: p.lv, k: p.k, d: p.d, a: p.a, items: p.it ?? [], augments: p.au ?? [], me: p.id === id });
  const elapsed = row.game_time > 0 ? row.game_time + Math.round((now - row.updated_at) / 1000) : 0;
  return {
    board: { time: elapsed, at: row.updated_at, custom: row.queue !== MAYHEM, mine: ps.filter((p) => p.t === side).map(conv), theirs: ps.filter((p) => p.t !== side).map(conv) },
    started: row.started_at,
  };
}

/** NOW 에 지금 돌아가는 것(팟·내전·함께 게임 중)이 있는지 — 메뉴의 LIVE 표시용 (v3.137). 지우지 않고 세기만 */
export async function nowLiveCount(env: Env, now = Date.now()): Promise<number> {
  const r = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM now_lobbies WHERE (phase != 'game' AND updated_at >= ?1) OR (phase = 'game' AND kind != 'game' AND updated_at >= ?2) OR (kind = 'game' AND created_at >= ?3)",
  ).bind(now - LOBBY_STALE, now - GAME_STALE, now - TOGETHER_STALE).first<{ n: number }>().catch(() => null);
  return r?.n ?? 0;
}
