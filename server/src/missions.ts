/**
 * 미션·내 챔프/내 증강 (CLAUDE.md v3.27).
 *  - 미션 계산은 공용 core/missions.ts. 서버는 내 판(챔프·승·시각)만 넘긴다.
 *  - 즐겨찾기는 회원마다 챔프·증강 번호만 남긴다.
 */
import { ensureSnapshot } from './shop.js';
import { claimable, missionSplit, missionState, rerollsFrom, weekMissions, weekStart, type MGame, type Mission, type Rerolls } from '../../packages/core/src/missions.js';
import { REROLL_PER_WEEK, USE_PRICE } from '../../packages/core/src/goods.js';
import { priceFor, state as shopState } from './shop.js';
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
  return missionSplit(games, claims);
}

/** 미션 다시 뽑기 기록 (v3.99) */
export async function rerollsOf(env: Env, id: string): Promise<Rerolls> {
  const r = await env.DB.prepare("SELECT ref, at FROM piece_spend WHERE member_id = ? AND kind = 'reroll'").bind(id).all<{ ref: string; at: number }>().catch(() => ({ results: [] as { ref: string; at: number }[] }));
  return rerollsFrom(r.results);
}

export async function stateOf(env: Env, me: Member) {
  const [games, claims, rr] = await Promise.all([myGamesForMissions(env, me.id), claimsOf(env, me.id), rerollsOf(env, me.id)]);
  const st = missionState(games, claims, Date.now(), rr);
  const ws = weekStart(Date.now());
  const used = Object.values(rr.get(ws) ?? {}).reduce((a, x) => a + (x?.n ?? 0), 0);
  // 피스 배율(정회원 ×1.5 · 운영진 ×2)을 보상에 그대로 반영해서 보여 준다 (상점 잔액과 같은 계산)
  const r = ratesOf(me).piece;
  const x = (n: number) => Math.round(n * r);
  const xm = (m: Mission) => ({ ...m, reward: x(m.reward) });
  return {
    ...st, rate: r, earned: x(st.earned), ready: x(st.ready),
    reroll: { left: Math.max(0, REROLL_PER_WEEK - used), price: USE_PRICE.reroll },
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
  const [games, claims, rr] = await Promise.all([myGamesForMissions(env, me.id), claimsOf(env, me.id), rerollsOf(env, me.id)]);
  const open = claimable(games, claims, Date.now(), rr);
  const want = body.all ? [...open.keys()] : Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string' && open.has(x)).slice(0, 100) : [];
  if (!want.length) throw new HttpError(400, '받을 수 있는 보상이 없어요.');
  const now = Date.now();
  await ensureSnapshot(env, me); // 피스 기준을 바꾼 순간의 잔액을 먼저 적어 둔다 (v3.120)
  await env.DB.batch(want.map((id) => env.DB.prepare('INSERT OR IGNORE INTO mission_claims (member_id, mission_id, reward, at) VALUES (?, ?, ?, ?)').bind(me.id, id, open.get(id)!, now)));
  const base = want.reduce((s, id) => s + open.get(id)!, 0);
  return json({ gained: Math.round(base * ratesOf(me).piece), ids: want, state: await stateOf(env, me) });
}

/** 미션 다시 뽑기 (v3.99): { key } — 이번 주, 아직 못 이룬 미션만, 주 REROLL_PER_WEEK 번, 피스를 낸다 */
export async function rerollMission(req: Request, env: Env, me: Member) {
  const { key } = (await req.json().catch(() => ({}))) as { key?: string };
  if (key !== 'fresh' && key !== 'weak' && key !== 'spread') throw new HttpError(400, '잘못된 미션입니다.');
  const now = Date.now(), ws = weekStart(now);
  const [games, rr] = await Promise.all([myGamesForMissions(env, me.id), rerollsOf(env, me.id)]);
  const used = Object.values(rr.get(ws) ?? {}).reduce((a, x) => a + (x?.n ?? 0), 0);
  if (used >= REROLL_PER_WEEK) throw new HttpError(400, `다시 뽑기는 한 주에 ${REROLL_PER_WEEK}번까지예요.`);
  const m = weekMissions(games, ws, rr.get(ws)).missions.find((x) => x.key === key);
  if (!m || m.done) throw new HttpError(400, '이미 이룬 미션은 다시 뽑지 않아요.');
  const s = await shopState(env, me.id, me);
  const price = priceFor(USE_PRICE.reroll, s.rates.discount);
  if (s.balance < price) throw new HttpError(400, `피스가 ${price - s.balance}개 모자라요.`);
  await env.DB.prepare("INSERT INTO piece_spend (member_id, kind, ref, price, at) VALUES (?, 'reroll', ?, ?, ?)").bind(me.id, `${ws}:${key}`, price, now).run();
  return json(await stateOf(env, me));
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
