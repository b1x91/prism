/**
 * 이번 주 도전 (CLAUDE.md v3.90). 규칙은 공용 core/weekly.ts. 서버는 내 판(같은 팀 멤버 포함)과
 * 주마다 모임 전체가 함께 이긴 판 수만 넘기고, 받기는 미션 받기와 같은 표(mission_claims)에 남긴다.
 */
import { WEEKLY, weekStart, weeklyClaimable, weeklyState, type WGame } from '../../packages/core/src/index.js';
import { FACE, HttpError, json, type Env, type Member } from './util.js';
import { ratesOf } from './roles.js';

/** 내 판: 시각 · 승 · 같은 팀이었던 다른 멤버 */
async function myGames(env: Env, id: string): Promise<WGame[]> {
  const r = await env.DB.prepare(
    `SELECT p.played_at AS t, p.win AS w,
       (SELECT group_concat(q.member_id) FROM participants q WHERE q.game_id = p.game_id AND q.team_id = p.team_id AND q.member_id <> p.member_id) AS mates
     FROM participants p WHERE p.member_id = ?`,
  ).bind(id).all<{ t: number; w: number; mates: string | null }>();
  return r.results.map((x) => ({ t: x.t, w: x.w ? 1 : 0, mates: x.mates ? x.mates.split(',') : [] }));
}

/** 주마다 모임 전체가 함께 이긴 판 (멤버 2명 이상 같은 팀으로 이긴 서로 다른 판) */
async function goalWins(env: Env, since: number): Promise<Map<number, number>> {
  const r = await env.DB.prepare(
    `SELECT game_id AS g, MIN(played_at) AS t FROM participants WHERE played_at >= ? AND win = 1
     GROUP BY game_id, team_id HAVING COUNT(*) >= 2`,
  ).bind(since).all<{ g: string; t: number }>();
  const out = new Map<number, number>();
  const seen = new Set<string>();
  for (const x of r.results) { if (seen.has(x.g)) continue; seen.add(x.g); const ws = weekStart(x.t); out.set(ws, (out.get(ws) ?? 0) + 1); }
  return out;
}

async function claimsOf(env: Env, id: string): Promise<Map<string, number>> {
  const r = await env.DB.prepare("SELECT mission_id AS id, reward FROM mission_claims WHERE member_id = ? AND mission_id LIKE 'cw:%'").bind(id).all<{ id: string; reward: number }>();
  return new Map(r.results.map((x) => [x.id, x.reward]));
}

async function inputs(env: Env, id: string) {
  const games = await myGames(env, id);
  const first = games.length ? Math.min(...games.map((g) => g.t)) : Date.now();
  const [goal, claims] = await Promise.all([goalWins(env, weekStart(first)), claimsOf(env, id)]);
  return { games, goal, claims };
}

type Face = { id: string; nick: string; skin: number | null; main: number | null };

export async function weeklyOf(env: Env, me: Member) {
  const { games, goal, claims } = await inputs(env, me.id);
  const st = weeklyState(games, goal, claims);
  const rate = ratesOf(me).piece;
  const x = (n: number) => Math.round(n * rate);
  const ids = [...new Set([...st.pairs.map((p) => p.member), ...st.bonds.map((b) => b.member), ...st.bondNext.map((b) => b.member)])];
  const faces = new Map<string, Face>();
  if (ids.length) {
    const r = await env.DB.prepare(`SELECT m.id, m.nick, ${FACE('m')} FROM members m WHERE m.id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<Face>();
    for (const f of r.results) faces.set(f.id, f);
  }
  const sx = <T extends { steps: { reward: number }[] }>(t: T) => ({ ...t, steps: t.steps.map((s) => ({ ...s, reward: x(s.reward) })) });
  // 모두의 목표에 보탠 멤버 수 (이번 주)
  const ws = st.week.start;
  const helpers = await env.DB.prepare(
    `SELECT COUNT(DISTINCT p.member_id) AS n FROM participants p WHERE p.played_at >= ? AND p.win = 1
       AND EXISTS (SELECT 1 FROM participants q WHERE q.game_id = p.game_id AND q.team_id = p.team_id AND q.member_id <> p.member_id)`,
  ).bind(ws).first<{ n: number }>();
  return {
    ...st, rate,
    streak: sx(st.streak), crewStreak: sx(st.crewStreak), wins: sx(st.wins), goal: { ...sx(st.goal), helpers: helpers?.n ?? 0 },
    pairs: st.pairs.map((p) => ({ ...p, reward: x(WEEKLY.pair.reward), face: faces.get(p.member) ?? null })),
    bonds: st.bonds.map((b) => ({ ...b, reward: x(b.reward), face: faces.get(b.member) ?? null })),
    bondNext: st.bondNext.map((b) => ({ ...b, reward: x(b.reward), face: faces.get(b.member) ?? null })),
    past: st.past.map((p) => ({ ...p, reward: x(p.reward) })),
    ready: x(st.ready),
  };
}

export async function getWeekly(env: Env, me: Member) {
  return json(await weeklyOf(env, me));
}

/** 도전 보상 받기: { ids: [...] } 또는 { all: true }. 이뤘고 아직 안 받은 것만 */
export async function claimWeekly(req: Request, env: Env, me: Member) {
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; all?: unknown };
  const { games, goal, claims } = await inputs(env, me.id);
  const open = weeklyClaimable(games, goal, claims);
  const want = body.all ? [...open.keys()] : Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === 'string' && open.has(v)).slice(0, 100) : [];
  if (!want.length) throw new HttpError(400, '받을 수 있는 보상이 없어요.');
  const now = Date.now();
  await env.DB.batch(want.map((id) => env.DB.prepare('INSERT OR IGNORE INTO mission_claims (member_id, mission_id, reward, at) VALUES (?, ?, ?, ?)').bind(me.id, id, open.get(id)!, now)));
  const base = want.reduce((s, id) => s + open.get(id)!, 0);
  return json({ gained: Math.round(base * ratesOf(me).piece), ids: want, state: await weeklyOf(env, me) });
}
