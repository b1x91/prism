/**
 * 회원끼리 보는 화면: 랭킹, 회원 페이지(분석). 로그인한 회원에게만 준다 (CLAUDE.md 2절 11).
 * 판수·승률·Prism 레이팅(팀원·상대 실력과 판의 활약으로 만든 실력, rating.ts)으로 순위를 낸다. 딜량 순위·롤 티어·MMR 표시는 하지 않는다 (CLAUDE.md 15절).
 */
import { parseDeco, type Deco } from '../../packages/core/src/shop.js';
import { pinnedOf } from './goods.js';
import { cleanAbout } from '../../packages/core/src/about.js';
import { HttpError, json, type Env, type Member } from './util.js';
import { can, isPending, LIMITED, topRole } from './roles.js';
import { presenceOf } from '../../packages/core/src/presence.js';
import { byScore, seasonOf } from '../../packages/core/src/ranking.js';
import { ratingOf } from '../../packages/core/src/rating.js';
import { ratingBook, ratingKey } from './rating.js';
import { badgeFromJson } from '../../packages/core/src/mvp.js';

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
/** 랭킹 한 줄 = 롤 계정 하나 (v3.161). key 는 화면용 짧은 열쇠(회원 id:계정 순서) — puuid 는 내보내지 않는다 */
export type AccountRow = {
  id: string; key: string; nick: string; skin: number | null; n: number; w: number; mainChampion: number | null;
  main: boolean; deco: Deco; tier: string; discord_roles: string | null; app_first_at: number;
  /** Prism 레이팅 (그 계정의 모든 판으로 만든 실력, 시즌 줄도 같은 값) */
  rating: number;
};

/**
 * 계정마다 판수·승수·주 챔프·그 계정에 장착한 꾸밈. 판(participants.puuid)이 지금 연결된 계정이 아니면(뺀 계정·예전 판) 메인 계정으로 센다.
 * 회원 페이지 순위·봇 /랭킹도 같은 줄로 센다.
 */
export async function accountRows(env: Env, since: number): Promise<AccountRow[]> {
  const book = await ratingBook(env);
  const [games, mems, accs] = await env.DB.batch([
    env.DB.prepare('SELECT member_id AS mid, puuid, champion_id AS c, COUNT(*) AS n, SUM(win) AS w, MAX(played_at) AS last FROM participants WHERE played_at >= ? GROUP BY 1, 2, 3').bind(since),
    env.DB.prepare('SELECT id, nick, profile_skin AS skin, tier, discord_roles, app_first_at, deco, riot_puuid FROM members'),
    env.DB.prepare('SELECT puuid, member_id AS mid, riot_id, deco, added_at FROM member_accounts ORDER BY added_at'),
  ]);
  type M = { id: string; nick: string; skin: number | null; tier: string; discord_roles: string | null; app_first_at: number; deco: string | null; riot_puuid: string | null };
  type A = { puuid: string; mid: string; riot_id: string | null; deco: string | null };
  const mem = new Map((mems.results as M[]).map((m) => [m.id, m]));
  const acc = new Map((accs.results as A[]).map((a) => [a.puuid, a]));
  const order = new Map<string, number>();
  for (const a of accs.results as A[]) order.set(a.puuid, [...order.keys()].filter((k) => acc.get(k)!.mid === a.mid).length);
  const rows = new Map<string, AccountRow & { champs: Map<number, [number, number]> }>();
  for (const g of games.results as { mid: string; puuid: string | null; c: number; n: number; w: number; last: number }[]) {
    const m = mem.get(g.mid);
    if (!m) continue;
    const own = g.puuid && acc.get(g.puuid)?.mid === g.mid ? g.puuid : m.riot_puuid && acc.get(m.riot_puuid)?.mid === g.mid ? m.riot_puuid : null;
    const k = `${g.mid}:${own ? order.get(own) ?? 0 : 'm'}`;
    let r = rows.get(k);
    if (!r) {
      const a = own ? acc.get(own)! : null;
      const main = !own || own === m.riot_puuid;
      r = {
        id: m.id, key: k, nick: (main ? m.nick : a?.riot_id) || m.nick, skin: m.skin, n: 0, w: 0, mainChampion: null, main,
        deco: parseDeco(main ? m.deco : a?.deco), tier: m.tier, discord_roles: m.discord_roles, app_first_at: m.app_first_at, champs: new Map(),
        rating: ratingOf(book.get(ratingKey(own, m.riot_puuid, m.id))),
      };
      rows.set(k, r);
    }
    r.n += g.n; r.w += g.w;
    const c = r.champs.get(g.c) ?? [0, 0];
    r.champs.set(g.c, [c[0] + g.n, Math.max(c[1], g.last)]);
  }
  return [...rows.values()].map(({ champs, ...r }) => {
    let best: [number, number, number] | null = null;
    for (const [c, [n, last]] of champs) if (!best || n > best[1] || (n === best[1] && last > best[2])) best = [c, n, last];
    return { ...r, mainChampion: best?.[0] ?? null };
  });
}

/**
 * 랭킹: 기록이 있는 롤 계정 전부 — 한 회원이 계정을 여럿 연결했으면 계정마다 따로 줄 (v3.161).
 * period=season 이면 이번 시즌(분기, KST)만, month 면 이번 달만(예전 앱).
 * by=score 면 점수(승률을 판수만큼 믿은 값, v3.55) 순, winrate 면 승률 순, 아니면 판수 순 — 준회원의 5위까지도 실제 순위가 되게 서버가 정렬한다.
 */
export async function ranking(env: Env, me: Member, period: string | null, by: string | null = null) {
  const season = seasonOf();
  const since = period === 'season' ? season.start : period === 'month' ? monthStart() : 0;
  let rows = (await accountRows(env, since))
    .sort((a, b) => b.n - a.n || b.w - a.w)
    .map(({ discord_roles, deco, tier, app_first_at, ...x }) => ({
      ...x, role: topRole({ discord_roles }), bg: deco.bg ?? null, frame: deco.frame ?? null, nameFx: deco.name ?? null, title: deco.title ?? null,
      ...(isPending({ tier: tier as Member['tier'], discord_roles, app_first_at }) ? { pending: true } : {}),
    }));
  // 승률 순위는 서버에서 정렬해야 준회원의 5위까지도 실제 승률 순위가 된다
  if (by === 'winrate') rows = rows.filter((x) => x.n >= RANK_MIN_WINRATE).sort((a, b) => b.w / b.n - a.w / a.n || b.n - a.n);
  else if (by === 'score') rows.sort(byScore);
  // 준회원은 5위까지만 + 내 가장 높은 줄
  if (!can(me, 'rankingAll')) {
    const mine = rows.findIndex((x) => x.id === me.id);
    return json({ period: period ?? 'all', season, minWinrate: RANK_MIN_WINRATE, rows: rows.slice(0, LIMITED), limited: { total: rows.length, mine: mine >= LIMITED ? { ...rows[mine], rank: mine + 1 } : null } });
  }
  return json({ period: period ?? 'all', season, minWinrate: RANK_MIN_WINRATE, rows });
}

/** 회원 페이지: 프로필 + 전체 기록 분석 재료 + (다른 사람이면) 나와 같이 한 판 */
export async function memberPage(env: Env, me: Member, id: string) {
  const m = await env.DB.prepare('SELECT id, nick, intro, tier, joined_at AS joinedAt, profile_skin AS skin, riot_id AS riotId, discord_roles, app_first_at, web_seen_at, app_seen_at, app_lol, app_open, deco, share_on, about FROM members WHERE id = ?')
    .bind(id)
    .first<{ id: string; nick: string; intro: string; tier: string; joinedAt: number; skin: number | null; riotId: string | null; discord_roles: string | null; app_first_at: number; web_seen_at: number; app_seen_at: number; app_lol: number; app_open: number; deco: string | null; share_on: number; about: string | null }>();
  if (!m) throw new HttpError(404, '없는 회원입니다.');
  const self = id === me.id;

  const champs = (mid: string) =>
    env.DB.prepare('SELECT champion_id AS id, COUNT(*) AS n, SUM(win) AS w, SUM(kills) AS k, SUM(deaths) AS d, SUM(assists) AS a FROM participants WHERE member_id = ? GROUP BY champion_id ORDER BY n DESC').bind(mid);
  const queries = [
    env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(win), 0) AS w, COALESCE(SUM(kills), 0) AS k, COALESCE(SUM(deaths), 0) AS d, COALESCE(SUM(assists), 0) AS a, MIN(played_at) AS first FROM participants WHERE member_id = ?').bind(id),
    champs(id),
    env.DB.prepare('SELECT augment_id AS id, COUNT(*) AS n, SUM(win) AS w FROM participant_augments WHERE member_id = ? GROUP BY augment_id ORDER BY n DESC').bind(id),
    env.DB.prepare(
      `SELECT p.game_id AS gameId, p.played_at AS playedAt, x.duration, p.champion_id AS championId, p.win, p.kills, p.deaths, p.assists, p.augments, p.items, p.dmg_champ AS damageToChampions, p.gold AS goldEarned, p.crew_count AS crewCount, x.queue_id AS queueId, p.team_id AS teamId, x.players AS players
       FROM participants p JOIN matches x ON x.game_id = p.game_id WHERE p.member_id = ? ORDER BY p.played_at DESC LIMIT 30`,
    ).bind(id),
    // (자리 맞춤용 — 점수 순위는 계정마다의 줄로 따로 센다, v3.161)
    env.DB.prepare('SELECT 1'),
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
  // 점수 순위 = 이 회원의 계정 중 가장 높은 줄 (랭킹 '전체'와 같은 줄, v3.161)
  const all = (await accountRows(env, 0)).sort(byScore);
  const best = all.findIndex((x) => x.id === id);
  void rank;
  return json({
    pinned,
    member: { id: m.id, nick: m.nick, intro: m.intro, tier: m.tier, joinedAt: m.joinedAt, skin: m.skin, riotId: self ? m.riotId : null, self, role: topRole(m), pending: isPending({ tier: m.tier as Member['tier'], discord_roles: m.discord_roles, app_first_at: m.app_first_at }), presence: presenceOf({ webAt: m.web_seen_at, appAt: m.app_seen_at, lol: Boolean(m.app_lol), open: Boolean(m.app_open) }), deco: parseDeco(m.deco), shared: Boolean(m.share_on), about: (() => { try { return m.about ? cleanAbout(JSON.parse(m.about)) : null; } catch { return null; } })() },
    total: total.results[0],
    rank: best < 0 ? all.length + 1 : best + 1,
    rating: best < 0 ? null : all[best].rating,
    ratingAvg: (() => { const r = all.filter((x) => x.n >= 20); return r.length ? Math.round(r.reduce((t, x) => t + x.rating, 0) / r.length) : null; })(),
    champions: champions.results,
    augments: augments.results,
    picks: picks.results,
    // PRISM MVP·ACE 는 판의 10명 기록으로 (그 기록은 내보내지 않는다)
    recent: recent.results.map(({ players, teamId, ...g }: any) => ({ ...g, win: g.win === 1, augments: g.augments ? JSON.parse(g.augments) : [], items: g.items ? JSON.parse(g.items) : [], custom: g.queueId !== 2400, badge: badgeFromJson(players, teamId, g.championId) })),
    ...(self ? {} : {
      together: nw(together.results as { w: number }[]), against: nw(against.results as { w: number }[]),
      viewer: { champions: viewerChampions.results, total: viewerTotal.results[0], ...(viewerMe.results[0] as { nick: string; skin: number | null }) },
      duo: { together: together.results, against: against.results },
    }),
  });
}
