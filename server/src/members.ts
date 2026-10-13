/**
 * 회원끼리 보는 화면: 랭킹, 회원 페이지(분석). 로그인한 회원에게만 준다 (CLAUDE.md 2절 11).
 * 판수·승률만 순위로 쓴다. 딜량 순위·티어 표시는 하지 않는다 (CLAUDE.md 15절).
 */
import { HttpError, json, type Env, type Member } from './util.js';

export const RANK_MIN_WINRATE = 10; // 승률 순위는 10판 이상만

const KST = 9 * 3_600_000;
const monthStart = () => {
  const k = new Date(Date.now() + KST);
  return Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - KST;
};

/** 랭킹: 기록이 있는 회원 전부 (회원 100명 규모라 정렬은 화면에서). period=month 면 이번 달(KST)만 */
export async function ranking(env: Env, period: string | null) {
  const since = period === 'month' ? monthStart() : 0;
  const r = await env.DB.prepare(
    `SELECT m.id, m.nick, m.profile_skin AS skin, COUNT(*) AS n, SUM(p.win) AS w,
       (SELECT q.champion_id FROM participants q WHERE q.member_id = m.id AND q.played_at >= ?1
        GROUP BY q.champion_id ORDER BY COUNT(*) DESC, MAX(q.played_at) DESC LIMIT 1) AS mainChampion
     FROM participants p JOIN members m ON m.id = p.member_id
     WHERE p.played_at >= ?1 GROUP BY m.id ORDER BY n DESC`,
  )
    .bind(since)
    .all();
  return json({ period: since ? 'month' : 'all', minWinrate: RANK_MIN_WINRATE, rows: r.results });
}

/** 회원 페이지: 프로필 + 전체 기록 분석 재료 + (다른 사람이면) 나와 같이 한 판 */
export async function memberPage(env: Env, me: Member, id: string) {
  const m = await env.DB.prepare('SELECT id, nick, intro, tier, joined_at AS joinedAt, profile_skin AS skin, riot_id AS riotId FROM members WHERE id = ?')
    .bind(id)
    .first<{ id: string; nick: string; intro: string; tier: string; joinedAt: number; skin: number | null; riotId: string | null }>();
  if (!m) throw new HttpError(404, '없는 회원입니다.');
  const self = id === me.id;

  const champs = (mid: string) =>
    env.DB.prepare('SELECT champion_id AS id, COUNT(*) AS n, SUM(win) AS w, SUM(kills) AS k, SUM(deaths) AS d, SUM(assists) AS a FROM participants WHERE member_id = ? GROUP BY champion_id ORDER BY n DESC').bind(mid);
  const queries = [
    env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(win), 0) AS w, COALESCE(SUM(kills), 0) AS k, COALESCE(SUM(deaths), 0) AS d, COALESCE(SUM(assists), 0) AS a, MIN(played_at) AS first FROM participants WHERE member_id = ?').bind(id),
    champs(id),
    env.DB.prepare('SELECT augment_id AS id, COUNT(*) AS n, SUM(win) AS w FROM participant_augments WHERE member_id = ? GROUP BY augment_id ORDER BY n DESC').bind(id),
    env.DB.prepare(
      `SELECT p.game_id AS gameId, p.played_at AS playedAt, x.duration, p.champion_id AS championId, p.win, p.kills, p.deaths, p.assists, p.augments, p.items, p.dmg_champ AS damageToChampions, p.gold AS goldEarned, p.crew_count AS crewCount, x.queue_id AS queueId
       FROM participants p JOIN matches x ON x.game_id = p.game_id WHERE p.member_id = ? ORDER BY p.played_at DESC LIMIT 30`,
    ).bind(id),
    // 판수 순위 (나보다 많이 한 회원 수 + 1)
    env.DB.prepare(
      `SELECT COUNT(*) + 1 AS rank FROM (SELECT member_id, COUNT(*) AS n FROM participants GROUP BY member_id)
       WHERE n > (SELECT COUNT(*) FROM participants WHERE member_id = ?)`,
    ).bind(id),
  ];
  if (!self) {
    queries.push(
      // 같은 팀으로 한 판
      env.DB.prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(a.win), 0) AS w FROM participants a JOIN participants b
         ON a.game_id = b.game_id AND a.team_id = b.team_id WHERE a.member_id = ? AND b.member_id = ?`,
      ).bind(me.id, id),
      // 상대 팀으로 만난 판 (w = 내가 이긴 판)
      env.DB.prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(a.win), 0) AS w FROM participants a JOIN participants b
         ON a.game_id = b.game_id AND a.team_id <> b.team_id WHERE a.member_id = ? AND b.member_id = ?`,
      ).bind(me.id, id),
      champs(me.id),
    );
  }
  const [total, champions, augments, recent, rank, together, against, viewerChampions] = await env.DB.batch(queries);
  return json({
    member: { ...m, riotId: self ? m.riotId : null, self },
    total: total.results[0],
    rank: (rank.results[0] as { rank: number }).rank,
    champions: champions.results,
    augments: augments.results,
    recent: recent.results.map((g: any) => ({ ...g, win: g.win === 1, augments: g.augments ? JSON.parse(g.augments) : [], items: g.items ? JSON.parse(g.items) : [], custom: g.queueId !== 2400 })),
    ...(self ? {} : { together: together.results[0], against: against.results[0], viewer: { champions: viewerChampions.results } }),
  });
}
