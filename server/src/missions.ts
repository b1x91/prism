/**
 * 미션·내 챔프/내 증강 (CLAUDE.md v3.27).
 *  - 미션 계산은 공용 core/missions.ts. 서버는 내 판(챔프·승·시각)만 넘긴다.
 *  - 즐겨찾기는 회원마다 챔프·증강 번호만 남긴다.
 */
import { missionPieces, missionState, type MGame } from '../../packages/core/src/missions.js';
import { HttpError, json, type Env, type Member } from './util.js';
import { ratesOf } from './roles.js';

export async function myGamesForMissions(env: Env, id: string): Promise<MGame[]> {
  const r = await env.DB.prepare('SELECT champion_id AS c, win AS w, played_at AS t FROM participants WHERE member_id = ?').bind(id).all<MGame>();
  return r.results;
}

export async function missionPiecesOf(env: Env, id: string) {
  return missionPieces(await myGamesForMissions(env, id));
}

export async function getMissions(env: Env, me: Member) {
  const st = missionState(await myGamesForMissions(env, me.id));
  // 피스 배율(정회원 ×1.5 · 운영진 ×2)을 보상에 그대로 반영해서 보여 준다 (상점 잔액과 같은 계산)
  const r = ratesOf(me).piece;
  const x = (n: number) => Math.round(n * r);
  return json({
    ...st, rate: r, earned: x(st.earned),
    week: { ...st.week, missions: st.week.missions.map((m) => ({ ...m, reward: x(m.reward) })) },
    pioneer: st.pioneer.map((p) => ({ ...p, steps: p.steps.map((q) => ({ ...q, reward: x(q.reward) })) })),
  });
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
