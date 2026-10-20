/**
 * 회원끼리 보는 화면: 랭킹, 회원 페이지(분석). 로그인한 회원에게만 준다 (CLAUDE.md 2절 11).
 * 판수·승률·Prism 점수(승률을 판수만큼 믿은 값)로 순위를 낸다. 딜량 순위·롤 티어·MMR 표시는 하지 않는다 (CLAUDE.md 15절).
 */
import { parseDeco } from '../../packages/core/src/shop.js';
import { pinnedOf } from './goods.js';
import { cleanAbout } from '../../packages/core/src/about.js';
import { HttpError, json, type Env, type Member } from './util.js';
import { can, LIMITED, topRole } from './roles.js';
import { presenceOf } from '../../packages/core/src/presence.js';
import { byScore, seasonOf } from '../../packages/core/src/ranking.js';

export const RANK_MIN_WINRATE = 10; // 승률 순위는 10판 이상만

const KST = 9 * 3_600_000;
const monthStart = () => {
  const k = new Date(Date.now() + KST);
  return Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - KST;
};

/**
 * 랭킹: 기록이 있는 회원 전부. period=season 이면 이번 시즌(분기, KST)만, month 면 이번 달만(예전 앱).
 * by=score 면 점수(승률을 판수만큼 믿은 값, v3.55) 순, winrate 면 승률 순, 아니면 판수 순 — 준회원의 5위까지도 실제 순위가 되게 서버가 정렬한다.
 */
export async function ranking(env: Env, me: Member, period: string | null, by: string | null = null) {
  const season = seasonOf();
  const since = period === 'season' ? season.start : period === 'month' ? monthStart() : 0;
  const r = await env.DB.prepare(
    `SELECT m.id, m.nick, m.profile_skin AS skin, m.discord_roles, m.deco, COUNT(*) AS n, SUM(p.win) AS w,
       (SELECT q.champion_id FROM participants q WHERE q.member_id = m.id AND q.played_at >= ?1
        GROUP BY q.champion_id ORDER BY COUNT(*) DESC, MAX(q.played_at) DESC LIMIT 1) AS mainChampion
     FROM participants p JOIN members m ON m.id = p.member_id
     WHERE p.played_at >= ?1 GROUP BY m.id ORDER BY n DESC`,
  )
    .bind(since)
    .all();
  let rows = r.results.map(({ discord_roles, deco, ...x }: any) => ({ ...x, role: topRole({ discord_roles }), bg: parseDeco(deco).bg ?? null }));
  // 승률 순위는 서버에서 정렬해야 준회원의 5위까지도 실제 승률 순위가 된다
  if (by === 'winrate') rows = rows.filter((x: any) => x.n >= RANK_MIN_WINRATE).sort((a: any, b: any) => b.w / b.n - a.w / a.n || b.n - a.n);
  else if (by === 'score') rows.sort(byScore);
  // 준회원은 판수 5위까지만 (승률·이번 달 정렬은 화면에서 하므로 서버는 판수 순 5명 + 내 줄)
  if (!can(me, 'rankingAll')) {
    const mine = rows.findIndex((x: any) => x.id === me.id);
    return json({ period: period ?? 'all', season, minWinrate: RANK_MIN_WINRATE, rows: rows.slice(0, LIMITED), limited: { total: rows.length, mine: mine >= LIMITED ? { ...rows[mine], rank: mine + 1 } : null } });
  }
  return json({ period: period ?? 'all', season, minWinrate: RANK_MIN_WINRATE, rows });
}

/** 회원 페이지: 프로필 + 전체 기록 분석 재료 + (다른 사람이면) 나와 같이 한 판 */
export async function memberPage(env: Env, me: Member, id: string) {
  const m = await env.DB.prepare('SELECT id, nick, intro, tier, joined_at AS joinedAt, profile_skin AS skin, riot_id AS riotId, discord_roles, web_seen_at, app_seen_at, app_lol, app_open, deco, share_on, about FROM members WHERE id = ?')
    .bind(id)
    .first<{ id: string; nick: string; intro: string; tier: string; joinedAt: number; skin: number | null; riotId: string | null; discord_roles: string | null; web_seen_at: number; app_seen_at: number; app_lol: number; app_open: number; deco: string | null; share_on: number; about: string | null }>();
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
    // 점수 순위 재료 (회원별 판수·승수, 정렬은 공용 점수 규칙으로)
    env.DB.prepare('SELECT member_id AS id, COUNT(*) AS n, SUM(win) AS w FROM participants GROUP BY member_id'),
    // 증강 × 그때 챔피언 (그 챔피언과 잘 맞는 증강을 골랐는지 보는 재료)
    env.DB.prepare('SELECT augment_id AS a, champion_id AS c, COUNT(*) AS n, SUM(win) AS w FROM participant_augments WHERE member_id = ? GROUP BY augment_id, champion_id').bind(id),
  ];
  if (!self) {
    queries.push(
      // 같은 팀으로 한 판 (판별: 두 사람의 챔프·KDA·승패)
      env.DB.prepare(
        `SELECT a.played_at AS t, a.win AS w, a.champion_id AS mc, b.champion_id AS tc, a.kills AS mk, a.deaths AS md, a.assists AS ma,
                b.kills AS tk, b.deaths AS td, b.assists AS ta, a.dmg_champ AS mdmg, b.dmg_champ AS tdmg, a.crew_count AS crew, x.duration AS dur
         FROM participants a JOIN participants b ON a.game_id = b.game_id AND a.team_id = b.team_id
         JOIN matches x ON x.game_id = a.game_id
         WHERE a.member_id = ? AND b.member_id = ? ORDER BY a.played_at DESC LIMIT 300`,
      ).bind(me.id, id),
      // 상대 팀으로 만난 판 (w = 내가 이긴 판)
      env.DB.prepare(
        `SELECT a.played_at AS t, a.win AS w, a.champion_id AS mc, b.champion_id AS tc
         FROM participants a JOIN participants b ON a.game_id = b.game_id AND a.team_id <> b.team_id
         WHERE a.member_id = ? AND b.member_id = ? ORDER BY a.played_at DESC LIMIT 300`,
      ).bind(me.id, id),
      champs(me.id),
      env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(win), 0) AS w FROM participants WHERE member_id = ?').bind(me.id),
      env.DB.prepare('SELECT nick, profile_skin AS skin FROM members WHERE id = ?').bind(me.id),
    );
  }
  const [total, champions, augments, recent, rank, picks, together, against, viewerChampions, viewerTotal, viewerMe] = await env.DB.batch(queries);
  const nw = (rows: { w: number }[]) => ({ n: rows.length, w: rows.reduce((x, r) => x + (r.w ? 1 : 0), 0) });
  // 걸어 둔 명장면 (명장면 액자, v3.99)
  const pinned = await pinnedOf(env, id).catch(() => null);
  return json({
    pinned,
    member: { id: m.id, nick: m.nick, intro: m.intro, tier: m.tier, joinedAt: m.joinedAt, skin: m.skin, riotId: self ? m.riotId : null, self, role: topRole(m), presence: presenceOf({ webAt: m.web_seen_at, appAt: m.app_seen_at, lol: Boolean(m.app_lol), open: Boolean(m.app_open) }), deco: parseDeco(m.deco), shared: Boolean(m.share_on), about: (() => { try { return m.about ? cleanAbout(JSON.parse(m.about)) : null; } catch { return null; } })() },
    total: total.results[0],
    rank: (() => { const all = (rank.results as { id: string; n: number; w: number }[]).sort(byScore); const i = all.findIndex((x) => x.id === id); return i < 0 ? all.length + 1 : i + 1; })(),
    champions: champions.results,
    augments: augments.results,
    picks: picks.results,
    recent: recent.results.map((g: any) => ({ ...g, win: g.win === 1, augments: g.augments ? JSON.parse(g.augments) : [], items: g.items ? JSON.parse(g.items) : [], custom: g.queueId !== 2400 })),
    ...(self ? {} : {
      together: nw(together.results as { w: number }[]), against: nw(against.results as { w: number }[]),
      viewer: { champions: viewerChampions.results, total: viewerTotal.results[0], ...(viewerMe.results[0] as { nick: string; skin: number | null }) },
      duo: { together: together.results, against: against.results },
    }),
  });
}
