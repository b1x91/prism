/**
 * 시즌 랭킹 보상 (CLAUDE.md v3.188, 사용자 결정 — TOP 3 까지만).
 * 시즌(분기, KST)이 끝나면 그 시즌 레이팅 1~3위에게 챔피언 세트(SEASON_REWARD.ranks + 시즌 칭호)를 준다. 영원히 소장.
 *  - 레이팅은 시즌 마감 순간의 실력 (그 시각 전의 판만, ratingBook(until)).
 *  - 그 시즌에 SEASON_REWARD.minGames 판 이상 한 계정만. 한 회원이 계정 여럿으로 3위 안이면 가장 높은 계정 하나만 세고 다음 회원으로.
 *  - 예우: 디스코드 색 역할 '시즌 TOP 3'(없으면 봇이 한 번 만든다) — 새 수상자에게 붙이고 지난 수상자에게서 뗀다.
 *    랭킹 화면 무대에는 다음 시즌 내내 '지난 시즌 TOP 3'(seasonHall).
 * 매일 03:17 KST 크론이 부른다 — 지난 시즌이 아직 확정되지 않았으면 확정하고 봇이 채널에 축하한다.
 */
import { ratingOf } from '../../packages/core/src/rating.js';
import { seasonOf } from '../../packages/core/src/ranking.js';
import { SEASON_REWARD, SHOP_ITEM } from '../../packages/core/src/shop.js';
import { ratingBook, ratingKey } from './rating.js';
import { botReady, sendToChannel } from './bot.js';
import { setRole } from './promote.js';
import { json, type Env } from './util.js';

export type SeasonPick = { rank: number; memberId: string; nick: string; rating: number; n: number; w: number };

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
    out.push({ rank: out.length + 1, memberId: r.mid, nick: r.nick, rating: r.rating, n: r.n, w: r.w });
    if (out.length === SEASON_REWARD.ranks.length) break;
  }
  return out;
}

/** 순위 하나가 받는 것: 그 순위의 꾸밈 + 그 시즌 칭호 */
export const rewardItems = (seasonKey: string, rank: number) => [...(SEASON_REWARD.ranks[rank - 1] ?? []), SEASON_REWARD.titleOf(seasonKey, rank)].filter((x) => SHOP_ITEM[x]);

const ROLE_KEY = 'season-role';
/** 디스코드 '시즌 TOP 3' 역할 ID — 없으면 봇이 한 번 만든다 (봇 권한 '역할 관리') */
async function seasonRole(env: Env): Promise<string | null> {
  const hit = await env.DB.prepare('SELECT v FROM ext_cache WHERE k = ?').bind(ROLE_KEY).first<{ v: string }>();
  if (hit?.v) return hit.v;
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return null;
  const r = await fetch(`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/roles`, {
    method: 'POST', headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json', 'X-Audit-Log-Reason': encodeURIComponent('Prism 시즌 랭킹 TOP 3') },
    body: JSON.stringify({ name: '시즌 TOP 3', color: 0xf2c45a, hoist: false, mentionable: false }), signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!r?.ok) { console.error('시즌 역할 만들기 실패', r?.status, await r?.text().catch(() => '')); return null; }
  const id = ((await r.json()) as { id: string }).id;
  await env.DB.prepare('INSERT OR REPLACE INTO ext_cache (k, v, at) VALUES (?, ?, ?)').bind(ROLE_KEY, id, Date.now()).run();
  return id;
}

/** 지난 시즌이 확정되지 않았으면 확정하고 축하 글을 올린다 */
export async function finalizeSeason(env: Env, now = Date.now()) {
  const prev = seasonOf(seasonOf(now).start - 1);
  const done = await env.DB.prepare('SELECT 1 AS x FROM season_rewards WHERE season = ? LIMIT 1').bind(prev.key).first();
  if (done) return;
  const top = await seasonTop(env, prev);
  if (!top.length) return;
  const rows = top.flatMap((t) => rewardItems(prev.key, t.rank).map((item) => env.DB.prepare('INSERT OR IGNORE INTO season_rewards (season, rank, member_id, item_id, nick, rating, n, w, granted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(prev.key, t.rank, t.memberId, item, t.nick, t.rating, t.n, t.w, now)));
  await env.DB.batch(rows);
  // 디스코드 역할: 지난 수상자에게서 떼고 새 수상자에게 붙인다
  const role = await seasonRole(env).catch(() => null);
  if (role) {
    const before = seasonOf(prev.start - 1).key;
    const old = await env.DB.prepare('SELECT DISTINCT member_id AS mid FROM season_rewards WHERE season = ?').bind(before).all<{ mid: string }>();
    const fresh = new Set(top.map((t) => t.memberId));
    for (const o of old.results) if (!fresh.has(o.mid)) await setRole(env, o.mid, role, false, '시즌 TOP 3 기간 끝');
    for (const t of top) await setRole(env, t.memberId, role, true, `${prev.label} ${t.rank}위`);
  }
  if (botReady(env)) {
    const medal = ['🥇', '🥈', '🥉'];
    await sendToChannel(env, env.BOT_CHANNEL_ID!, {
      content: [`🏆 **${prev.label} 랭킹이 끝났어요!**`, ...top.map((t) => `${medal[t.rank - 1]} <@${t.memberId}> · ${t.rating} · ${t.n}판 ${t.w}승`),
        `세 분께 **${prev.label} 챔피언 세트**와 칭호를 드렸어요 — 영원히 간직하는 시즌 한정 꾸밈이에요. 프로필 꾸미기에서 바로 쓸 수 있어요.`].join('\n'),
      allowed_mentions: { users: top.map((t) => t.memberId) },
    }).catch(() => false);
  }
}

/** 받은 시즌 보상 (상점 상태의 owned 에 더한다, 영원히) */
export async function activeSeasonItems(env: Env, memberId: string) {
  const r = await env.DB.prepare('SELECT DISTINCT item_id AS item FROM season_rewards WHERE member_id = ?').bind(memberId).all<{ item: string }>();
  return r.results.map((x) => x.item).filter((x) => SHOP_ITEM[x]);
}

/** 관리자: 지난 시즌들의 수상자 + 이번 시즌 지금 순위(미리 보기) */
export async function seasonRewardsAdmin(env: Env) {
  const [past, now] = await Promise.all([
    env.DB.prepare('SELECT season, rank, member_id AS memberId, item_id AS item, nick, rating, n, w, granted_at AS grantedAt FROM season_rewards ORDER BY granted_at DESC, rank LIMIT 120').all(),
    seasonTop(env, seasonOf()),
  ]);
  return json({ minGames: SEASON_REWARD.minGames, season: seasonOf(), preview: now, past: past.results });
}

/** 지난 시즌 TOP 3 (랭킹 무대의 명예의 전당, 다음 시즌 내내). 얼굴·꾸밈은 지금 모습으로 */
export async function seasonHall(env: Env) {
  const prev = seasonOf(seasonOf().start - 1);
  const r = await env.DB.prepare(`SELECT s.rank, s.member_id AS id, s.nick, s.rating, s.n, s.w, m.profile_skin AS skin, m.deco,
      (SELECT champion_id FROM participants p WHERE p.member_id = s.member_id GROUP BY champion_id ORDER BY COUNT(*) DESC LIMIT 1) AS mainChampion
    FROM season_rewards s JOIN members m ON m.id = s.member_id WHERE s.season = ? GROUP BY s.rank ORDER BY s.rank`).bind(prev.key)
    .all<{ rank: number; id: string; nick: string; rating: number; n: number; w: number; skin: number | null; mainChampion: number | null; deco: string | null }>().catch(() => null);
  if (!r?.results.length) return null;
  return { season: { key: prev.key, label: prev.label }, top: r.results.map(({ deco, ...x }) => ({ ...x, frame: (() => { try { return (JSON.parse(deco ?? '{}') as { frame?: string }).frame ?? null; } catch { return null; } })() })) };
}
