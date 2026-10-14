/**
 * 포텐 멤버 (CLAUDE.md v3.10): 회원과 같은 팀으로 3판 이상, 또는 사용자 설정·내전 판을 1판 이상 함께한 비회원.
 * 회원 전용. 가입해서 롤 계정을 연결하고 동의하면 그동안의 판이 그 사람의 기록으로 옮겨진다 (adoptProspect).
 */
import { HttpError, json, type Env, type Member } from './util.js';

const QUEUE_MIN = 3;

export async function listProspects(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT puuid, MAX(riot_id) AS riotId, COUNT(*) AS n, SUM(win) AS w,
       SUM(CASE WHEN custom = 0 AND with_members > 0 THEN 1 ELSE 0 END) AS queued,
       SUM(custom) AS customs, MAX(played_at) AS lastAt,
       (SELECT champion_id FROM prospect_games x WHERE x.puuid = g.puuid GROUP BY champion_id ORDER BY COUNT(*) DESC LIMIT 1) AS main
     FROM prospect_games g GROUP BY puuid
     HAVING MAX(riot_id) IS NOT NULL AND (queued >= ? OR customs >= 1)
     ORDER BY queued + customs * 3 DESC, lastAt DESC LIMIT 50`,
  ).bind(QUEUE_MIN).all<{ puuid: string; riotId: string | null; n: number; w: number; queued: number; customs: number; lastAt: number; main: number | null }>();
  // 누구와 같이 했는지 (같은 팀이었던 회원, 많이 한 순 3명)
  const mates = new Map<string, { nick: string; n: number }[]>();
  if (results.length) {
    const { results: rows } = await env.DB.prepare(
      `SELECT g.puuid, m.nick, COUNT(*) AS n FROM prospect_games g
       JOIN participants p ON p.game_id = g.game_id AND p.team_id = g.team_id JOIN members m ON m.id = p.member_id
       WHERE g.puuid IN (${results.map(() => '?').join(',')}) GROUP BY g.puuid, m.id ORDER BY n DESC`,
    ).bind(...results.map((r) => r.puuid)).all<{ puuid: string; nick: string; n: number }>();
    for (const r of rows) {
      const l = mates.get(r.puuid) ?? [];
      if (l.length < 3) l.push({ nick: r.nick, n: r.n });
      mates.set(r.puuid, l);
    }
  }
  return json({ prospects: results.map((r) => ({ ...r, mates: mates.get(r.puuid) ?? [] })), queueMin: QUEUE_MIN });
}

/** 관리자: 기록 지우기 (본인이 원하지 않을 때) */
export async function deleteProspect(env: Env, me: Member, puuid: string) {
  if (me.tier !== 'admin') throw new HttpError(403, '관리자만 지울 수 있습니다.');
  await env.DB.prepare('DELETE FROM prospect_games WHERE puuid = ?').bind(puuid).run();
  return json({ ok: true });
}

/** 가입한 사람이 동의하면: 포텐 시절의 판을 그 회원 기록으로 옮긴다 */
export async function adoptProspect(env: Env, memberId: string, puuid: string) {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO participants (game_id, member_id, champion_id, team_id, win, kills, deaths, assists, dmg_champ, dmg_taken, gold, items, augments, played_at, crew_count)
       SELECT game_id, ?1, champion_id, team_id, win, kills, deaths, assists, dmg_champ, dmg_taken, gold, items, augments, played_at, crew_count + 1
       FROM prospect_games WHERE puuid = ?2`,
    ).bind(memberId, puuid),
    env.DB.prepare(
      `INSERT OR IGNORE INTO participant_augments (game_id, member_id, augment_id, champion_id, win)
       SELECT g.game_id, ?1, j.value, g.champion_id, g.win FROM prospect_games g, json_each(g.augments) j
       WHERE g.puuid = ?2 AND g.augments IS NOT NULL`,
    ).bind(memberId, puuid),
    env.DB.prepare('UPDATE matches SET crew_count = crew_count + 1 WHERE game_id IN (SELECT game_id FROM prospect_games WHERE puuid = ?)').bind(puuid),
    env.DB.prepare('UPDATE members SET last_played_at = MAX(COALESCE(last_played_at, 0), COALESCE((SELECT MAX(played_at) FROM prospect_games WHERE puuid = ?1), 0)) WHERE id = ?2').bind(puuid, memberId),
    env.DB.prepare('DELETE FROM prospect_games WHERE puuid = ?').bind(puuid),
  ]);
}
