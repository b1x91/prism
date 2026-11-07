/**
 * 시즌 랭킹 보상 (CLAUDE.md v3.188, 사용자 결정 — TOP 3 까지만).
 * 시즌(분기, KST)이 끝나면 그 시즌 레이팅 1~3위에게 순위별 프로필 테두리(frame-season-1~3)를 준다.
 *  - 레이팅은 시즌 마감 순간의 실력 (그 시각 전의 판만, ratingBook(until)).
 *  - 그 시즌에 SEASON_REWARD.minGames 판 이상 한 계정만. 한 회원이 계정 여럿으로 3위 안이면 가장 높은 계정 하나만 세고 다음 회원으로.
 *  - 받은 테두리는 다음 시즌 마감까지(until) 가진 것으로 보고, 지나면 장착도 저절로 풀린다.
 * 매일 03:17 KST 크론이 부른다 — 지난 시즌이 아직 확정되지 않았으면 확정하고 봇이 채널에 축하한다.
 */
import { ratingOf } from '../../packages/core/src/rating.js';
import { seasonOf } from '../../packages/core/src/ranking.js';
import { SEASON_REWARD, SHOP_ITEM, parseDeco } from '../../packages/core/src/shop.js';
import { ratingBook, ratingKey } from './rating.js';
import { botReady, sendToChannel } from './bot.js';
import { json, type Env } from './util.js';

export type SeasonPick = { rank: number; memberId: string; nick: string; rating: number; n: number; w: number; item: string };

/** 그 시즌의 1~3위 (확정 전 미리 보기에도 쓴다) */
export async function seasonTop(env: Env, sz: { start: number; end: number }): Promise<SeasonPick[]> {
  const until = Math.min(sz.end, Date.now());
  const book = await ratingBook(env, until);
  const [games, mems, accs] = await env.DB.batch([
    env.DB.prepare('SELECT member_id AS mid, puuid, COUNT(*) AS n, SUM(win) AS w FROM participants WHERE played_at >= ? AND played_at < ? GROUP BY 1, 2').bind(sz.start, until),
    env.DB.prepare('SELECT id, nick, riot_puuid FROM members'),
    env.DB.prepare('SELECT puuid, member_id AS mid, riot_id FROM member_accounts'),
  ]);
  const mem = new Map((mems.results as { id: string; nick: string; riot_puuid: string | null }[]).map((m) => [m.id, m]));
  const acc = new Map((accs.results as { puuid: string; mid: string; riot_id: string | null }[]).map((a) => [a.puuid, a]));
  // 랭킹 줄(accountRows)과 같은 규칙: 판의 계정이 지금 그 회원 것이 아니면 메인 계정으로
  const rows = new Map<string, { mid: string; own: string | null; n: number; w: number }>();
  for (const g of games.results as { mid: string; puuid: string | null; n: number; w: number }[]) {
    const m = mem.get(g.mid);
    if (!m) continue;
    const own = g.puuid && acc.get(g.puuid)?.mid === g.mid ? g.puuid : m.riot_puuid && acc.get(m.riot_puuid)?.mid === g.mid ? m.riot_puuid : null;
    const k = `${g.mid}:${own ?? 'm'}`;
    const r = rows.get(k) ?? { mid: g.mid, own, n: 0, w: 0 };
    r.n += g.n; r.w += g.w;
    rows.set(k, r);
  }
  const ranked = [...rows.values()]
    .filter((r) => r.n >= SEASON_REWARD.minGames)
    .map((r) => {
      const m = mem.get(r.mid)!;
      const main = !r.own || r.own === m.riot_puuid;
      return { ...r, nick: (main ? m.nick : acc.get(r.own!)?.riot_id) || m.nick, rating: ratingOf(book.get(ratingKey(r.own, m.riot_puuid, m.id))) };
    })
    .sort((a, b) => b.rating - a.rating || b.n - a.n);
  const out: SeasonPick[] = [];
  for (const r of ranked) {
    if (out.some((x) => x.memberId === r.mid)) continue;
    out.push({ rank: out.length + 1, memberId: r.mid, nick: r.nick, rating: r.rating, n: r.n, w: r.w, item: SEASON_REWARD.items[out.length] });
    if (out.length === SEASON_REWARD.items.length) break;
  }
  return out;
}

/** 지난 시즌이 확정되지 않았으면 확정하고 축하 글을 올린다 */
export async function finalizeSeason(env: Env, now = Date.now()) {
  const prev = seasonOf(seasonOf(now).start - 1);
  const done = await env.DB.prepare('SELECT 1 AS x FROM season_rewards WHERE season = ? LIMIT 1').bind(prev.key).first();
  if (done) return;
  const top = await seasonTop(env, prev);
  if (!top.length) return;
  const until = seasonOf(now).end; // 다음 시즌(지금 시즌) 마감까지
  await env.DB.batch(top.map((t) => env.DB.prepare('INSERT OR IGNORE INTO season_rewards (season, rank, member_id, item_id, nick, rating, n, w, granted_at, until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(prev.key, t.rank, t.memberId, t.item, t.nick, t.rating, t.n, t.w, now, until)));
  if (botReady(env)) {
    const medal = ['🥇', '🥈', '🥉'];
    await sendToChannel(env, env.BOT_CHANNEL_ID!, {
      content: [`🏆 **${prev.label} 랭킹이 끝났어요!**`, ...top.map((t) => `${medal[t.rank - 1]} <@${t.memberId}> · ${t.rating} · ${t.n}판 ${t.w}승`),
        `세 분께 **시즌 한정 프로필 테두리**를 드렸어요. 다음 시즌이 끝날 때까지 프로필 꾸미기에서 쓸 수 있어요.`].join('\n'),
      allowed_mentions: { users: top.map((t) => t.memberId) },
    }).catch(() => false);
  }
}

/** 기간이 지난 시즌 테두리는 장착을 푼다 (같은 테두리를 다시 받아 아직 쓸 수 있으면 그대로) */
export async function expireSeasonFrames(env: Env, now = Date.now()) {
  const items = new Set<string>(SEASON_REWARD.items);
  const active = await env.DB.prepare('SELECT member_id AS mid, item_id AS item FROM season_rewards WHERE until > ?').bind(now).all<{ mid: string; item: string }>();
  const keep = new Set(active.results.map((r) => `${r.mid}:${r.item}`));
  const [ms, as] = await env.DB.batch([
    env.DB.prepare("SELECT id AS mid, deco FROM members WHERE deco LIKE '%frame-season-%'"),
    env.DB.prepare("SELECT puuid, member_id AS mid, deco FROM member_accounts WHERE deco LIKE '%frame-season-%'"),
  ]);
  const ups: D1PreparedStatement[] = [];
  const strip = (mid: string, raw: string | null) => {
    const d = parseDeco(raw);
    if (!d.frame || !items.has(d.frame) || keep.has(`${mid}:${d.frame}`)) return null;
    delete d.frame;
    return JSON.stringify(d);
  };
  for (const m of ms.results as { mid: string; deco: string | null }[]) { const d = strip(m.mid, m.deco); if (d !== null) ups.push(env.DB.prepare('UPDATE members SET deco = ? WHERE id = ?').bind(d, m.mid)); }
  for (const a of as.results as { puuid: string; mid: string; deco: string | null }[]) { const d = strip(a.mid, a.deco); if (d !== null) ups.push(env.DB.prepare('UPDATE member_accounts SET deco = ? WHERE puuid = ?').bind(d, a.puuid)); }
  if (ups.length) await env.DB.batch(ups);
}

/** 지금 가진 시즌 테두리 (상점 상태의 owned 에 더한다) */
export async function activeSeasonItems(env: Env, memberId: string, now = Date.now()) {
  const r = await env.DB.prepare('SELECT DISTINCT item_id AS item FROM season_rewards WHERE member_id = ? AND until > ?').bind(memberId, now).all<{ item: string }>();
  return r.results.map((x) => x.item).filter((x) => SHOP_ITEM[x]);
}

/** 관리자: 지난 시즌들의 수상자 + 이번 시즌 지금 순위(미리 보기) */
export async function seasonRewardsAdmin(env: Env) {
  const [past, now] = await Promise.all([
    env.DB.prepare('SELECT season, rank, member_id AS memberId, item_id AS item, nick, rating, n, w, granted_at AS grantedAt, until FROM season_rewards ORDER BY granted_at DESC, rank LIMIT 60').all(),
    seasonTop(env, seasonOf()),
  ]);
  return json({ minGames: SEASON_REWARD.minGames, season: seasonOf(), preview: now, past: past.results });
}
