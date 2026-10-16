/**
 * 미션·내 챔프/내 증강 (CLAUDE.md v3.27).
 *  - 미션 계산은 공용 core/missions.ts. 서버는 내 판(챔프·승·시각)만 넘긴다.
 *  - 즐겨찾기는 회원마다 챔프·증강 번호만 남긴다.
 */
import { claimable, missionPieces, missionState, type MGame, type Mission } from '../../packages/core/src/missions.js';
import { HttpError, json, type Env, type Member } from './util.js';
import { ratesOf } from './roles.js';

export async function myGamesForMissions(env: Env, id: string): Promise<MGame[]> {
  const r = await env.DB.prepare('SELECT champion_id AS c, win AS w, played_at AS t FROM participants WHERE member_id = ?').bind(id).all<MGame>();
  return r.results;
}

/** 받은 미션 (번호 → 받은 기본 보상) */
async function claimsOf(env: Env, id: string): Promise<Map<string, number>> {
  const r = await env.DB.prepare('SELECT mission_id AS id, reward FROM mission_claims WHERE member_id = ?').bind(id).all<{ id: string; reward: number }>();
  return new Map(r.results.map((x) => [x.id, x.reward]));
}

export async function missionPiecesOf(env: Env, id: string) {
  const [games, claims] = await Promise.all([myGamesForMissions(env, id), claimsOf(env, id)]);
  return missionPieces(games, claims);
}

export async function stateOf(env: Env, me: Member) {
  const [games, claims] = await Promise.all([myGamesForMissions(env, me.id), claimsOf(env, me.id)]);
  const st = missionState(games, claims);
  // 피스 배율(정회원 ×1.5 · 운영진 ×2)을 보상에 그대로 반영해서 보여 준다 (상점 잔액과 같은 계산)
  const r = ratesOf(me).piece;
  const x = (n: number) => Math.round(n * r);
  const xm = (m: Mission) => ({ ...m, reward: x(m.reward) });
  return {
    ...st, rate: r, earned: x(st.earned), ready: x(st.ready),
    week: { ...st.week, missions: st.week.missions.map(xm) },
    past: st.past.map(xm),
    pioneer: st.pioneer.map((p) => ({ ...p, steps: p.steps.map((q) => ({ ...q, reward: x(q.reward) })) })),
  };
}

export async function getMissions(env: Env, me: Member) {
  return json(await stateOf(env, me));
}

/** 미션 보상 받기: { ids: [...] } 또는 { all: true }. 깼고 아직 안 받은 것만 받는다 */
export async function claimMissions(req: Request, env: Env, me: Member) {
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; all?: unknown };
  const [games, claims] = await Promise.all([myGamesForMissions(env, me.id), claimsOf(env, me.id)]);
  const open = claimable(games, claims);
  const want = body.all ? [...open.keys()] : Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string' && open.has(x)).slice(0, 100) : [];
  if (!want.length) throw new HttpError(400, '받을 수 있는 보상이 없어요.');
  const now = Date.now();
  await env.DB.batch(want.map((id) => env.DB.prepare('INSERT OR IGNORE INTO mission_claims (member_id, mission_id, reward, at) VALUES (?, ?, ?, ?)').bind(me.id, id, open.get(id)!, now)));
  const base = want.reduce((s, id) => s + open.get(id)!, 0);
  return json({ gained: Math.round(base * ratesOf(me).piece), ids: want, state: await stateOf(env, me) });
}

export async function getFavs(env: Env, me: Member) {
  const r = await env.DB.prepare('SELECT kind, item_id AS id FROM favorites WHERE member_id = ? ORDER BY at').bind(me.id).all<{ kind: string; id: number }>();
  return json({ champs: r.results.filter((x) => x.kind === 'champ').map((x) => x.id), augs: r.results.filter((x) => x.kind === 'aug').map((x) => x.id) });
}

export async function setFav(req: Request, env: Env, me: Member) {
  const { kind, id, on } = (await req.json().catch(() => ({}))) as { kind?: string; id?: number; on?: boolean };
  if (kind !== 'champ' && kind !== 'aug') throw new HttpError(400, '잘못된 종류입니다.');
  if (!Number.isInteger(id) || (id as number) <= 0) throw new HttpError(400, '잘못된 번호입니다.');
  if (on) await env.DB.prepare('INSERT OR IGNORE INTO favorites (member_id, kind, item_id, at) VALUES (?, ?, ?, ?)').bind(me.id, kind, id, Date.now()).run();
  else await env.DB.prepare('DELETE FROM favorites WHERE member_id = ? AND kind = ? AND item_id = ?').bind(me.id, kind, id).run();
  return getFavs(env, me);
}

/** 이 챔프·증강을 '좋아요'한 회원 수 */
export async function favCount(env: Env, kind: string | null, id: number) {
  if (kind !== 'champ' && kind !== 'aug') throw new HttpError(400, '잘못된 종류입니다.');
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM favorites WHERE kind = ? AND item_id = ?').bind(kind, id).first<{ n: number }>();
  return json({ n: r?.n ?? 0 });
}
