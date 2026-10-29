/**
 * NOW (CLAUDE.md v3.126) — 지금 모이는 팟.
 *  - 회원 앱이 롤 클라이언트의 아수라장(2400) 로비를 읽어(GET 만) 알려 준다 → 팟이 저절로 생기고 채워진다. 큐 → '출발', 게임 → '게임 중', 끝나거나 로비를 떠나면 내려간다.
 *  - 팟은 동시에 세 개까지 보인다. 비회원은 수만 센다 (puuid·이름을 남기지 않는다).
 *  - 빈자리 + = 방장에게 알림. 방장 앱이 다음에 로비를 알릴 때 받아 오른쪽 아래 알림으로 띄운다 (게임 중이면 끝난 뒤). 같은 사람은 5분에 한 번, 10분 안에 안 들어오면 사라진다.
 *  - 회원마다 '로비를 NOW에 자동으로 올리기' (members.now_auto, 기본 켜짐).
 */
import { FACE, HttpError, json, type Env, type Member } from './util.js';

const MAX_SHOWN = 3;
const LOBBY_STALE = 3 * 60_000;   // 앱이 이만큼 소식이 없으면 로비가 없어진 것으로
const GAME_STALE = 70 * 60_000;   // 게임 중 팟은 이만큼까지 둔다
const REQ_TTL = 10 * 60_000;
const REQ_AGAIN = 5 * 60_000;
const MAYHEM = 2400;

type Face = { id: string; nick: string; skin: number | null; main: number | null };
type Row = { id: string; leader_id: string | null; reporter_id: string; members: string; size: number; phase: string; created_at: number; updated_at: number };
export type NowLobby = { id: string; phase: 'lobby' | 'queue' | 'game'; size: number; since: number; leader: string | null; members: Face[]; requests: Face[] };

const ids = (s: string): string[] => { try { const v = JSON.parse(s); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } };
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

async function prune(env: Env, now: number) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM now_lobbies WHERE (phase != 'game' AND updated_at < ?1) OR (phase = 'game' AND updated_at < ?2)").bind(now - LOBBY_STALE, now - GAME_STALE),
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
  const puuids = Array.isArray(body.members) ? body.members.filter((x): x is string => typeof x === 'string' && x.length <= 100).slice(0, 10) : [];
  const off = !(me as Member & { now_auto?: number }).now_auto;
  // 로비를 떠났거나 · 자동 올리기를 껐거나 · 아수라장 로비가 아니면 내가 알린 팟을 내린다
  if (!id || off || queue !== MAYHEM) {
    await env.DB.prepare('DELETE FROM now_lobbies WHERE reporter_id = ?').bind(me.id).run();
    return json({ requests: [] });
  }
  // 다른 로비로 옮겼으면 예전 팟은 내린다
  await env.DB.prepare('DELETE FROM now_lobbies WHERE reporter_id = ? AND id != ?').bind(me.id, id).run();
  const { results } = puuids.length
    ? await env.DB.prepare('SELECT id, riot_puuid AS p FROM members WHERE riot_puuid IN (SELECT value FROM json_each(?))').bind(JSON.stringify(puuids)).all<{ id: string; p: string }>()
    : { results: [] as { id: string; p: string }[] };
  const byPuuid = new Map(results.map((r) => [r.p, r.id]));
  const members = [...new Set(puuids.map((p) => byPuuid.get(p)).filter((x): x is string => Boolean(x)))];
  if (!members.includes(me.id)) members.unshift(me.id);
  const leader = byPuuid.get(String(body.leader ?? '')) ?? null;
  const size = Math.max(members.length, Math.min(5, puuids.length || 1));
  await env.DB.prepare(
    `INSERT INTO now_lobbies (id, leader_id, reporter_id, members, size, phase, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
     ON CONFLICT(id) DO UPDATE SET leader_id = ?2, reporter_id = ?3, members = ?4, size = ?5, phase = ?6, updated_at = ?7`,
  ).bind(id, leader, me.id, JSON.stringify(members), size, phase, now).run();
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
  const { results } = await env.DB.prepare('SELECT * FROM now_lobbies ORDER BY created_at ASC LIMIT ?').bind(MAX_SHOWN).all<Row>();
  const reqRows = results.length
    ? (await env.DB.prepare('SELECT lobby_id AS l, member_id AS m FROM now_requests WHERE lobby_id IN (SELECT value FROM json_each(?)) ORDER BY at ASC').bind(JSON.stringify(results.map((r) => r.id))).all<{ l: string; m: string }>()).results
    : [];
  const all = [...new Set([...results.flatMap((r) => ids(r.members)), ...reqRows.map((r) => r.m)])];
  const face = await faces(env, all);
  const lobbies: NowLobby[] = results.map((r) => {
    const mem = ids(r.members).map((x) => face.get(x)).filter((x): x is Face => Boolean(x));
    // 방장을 맨 앞에
    mem.sort((a, b) => Number(b.id === r.leader_id) - Number(a.id === r.leader_id));
    return {
      id: r.id, phase: (r.phase as NowLobby['phase']) ?? 'lobby', size: Math.max(r.size, mem.length), since: r.created_at, leader: r.leader_id,
      members: mem,
      requests: reqRows.filter((q) => q.l === r.id).map((q) => face.get(q.m)).filter((x): x is Face => Boolean(x)),
    };
  });
  return json({ auto: Boolean((me as Member & { now_auto?: number }).now_auto ?? 1), lobbies });
}

/** POST /api/now/:id/request — 빈자리 + (방장에게 알림) */
export async function requestJoin(env: Env, me: Member, id: string) {
  const now = Date.now();
  const r = await env.DB.prepare('SELECT * FROM now_lobbies WHERE id = ?').bind(id).first<Row>();
  if (!r || r.phase !== 'lobby' || now - r.updated_at > LOBBY_STALE) throw new HttpError(404, '이 팟은 이미 출발했거나 없어졌어요.');
  if (ids(r.members).includes(me.id)) throw new HttpError(400, '이미 이 팟에 있어요.');
  if (r.size >= 5) throw new HttpError(400, '자리가 다 찼어요.');
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
