/**
 * 꾸밈 밖 상품·칭호·선물·랜덤박스·명장면 (CLAUDE.md v3.99).
 *  - 쓴 피스는 piece_spend 에 남기고, 잔액은 shop.ts state() 가 늘 다시 계산한다.
 *  - 인사이트 리포트는 이용권이 살아 있을 때만 계산해서 보낸다 (없으면 데이터를 보내지 않는다).
 *  - 선물은 앱을 쓰는 멤버끼리만. 받은 사람에게 디스코드로 알린다.
 */
import { AUGMENT } from '../../packages/core/src/data.js';
import { parseFeat } from '../../packages/core/src/challenges.js';
import { pioneer, weekStart } from '../../packages/core/src/missions.js';
import { SHOP_ITEM, forSale, itemDiscount } from '../../packages/core/src/shop.js';
import {
  GIFT_NOTE_MAX, INSIGHT_DAYS, REROLL_PER_WEEK, TITLE_RULES, USE_PRICE, boxPool, drawBox, earnedTitles,
  type InsightKind, type TitleStats,
} from '../../packages/core/src/goods.js';
import { augReport, goldenReport, partnerReport } from '../../packages/core/src/insights.js';
import type { Highlight, HlKill } from '../../packages/core/src/highlight.js';
import { myGamesForMissions } from './missions.js';
import { levelsOf, priceFor, state } from './shop.js';
import { botReady, sendToChannel } from './bot.js';
import { FACE, HttpError, json, type Env, type Member } from './util.js';
import { can } from './roles.js';
import { josa } from '../../packages/core/src/josa.js';

const DAY = 86_400_000;
const INSIGHT_KINDS = Object.keys(USE_PRICE.insight) as InsightKind[];

type Spend = { kind: string; ref: string; at: number };

/** 칭호 조건을 재는 내 기록 */
async function titleStats(env: Env, id: string, lv: Awaited<ReturnType<typeof levelsOf>>): Promise<TitleStats> {
  const [g, f, a] = await env.DB.batch([
    env.DB.prepare(
      `SELECT COUNT(*) AS n, COUNT(DISTINCT champion_id) AS c,
         COALESCE(SUM(CASE WHEN ((played_at / 3600000) + 9) % 24 >= 21 OR ((played_at / 3600000) + 9) % 24 < 3 THEN 1 ELSE 0 END), 0) AS night
       FROM participants WHERE member_id = ?`,
    ).bind(id),
    env.DB.prepare('SELECT feats FROM participants WHERE member_id = ? AND feats IS NOT NULL').bind(id),
    env.DB.prepare('SELECT DISTINCT j.value AS id FROM participants p, json_each(p.augments) j WHERE p.member_id = ? AND p.augments IS NOT NULL').bind(id),
  ]);
  const gr = g.results[0] as { n: number; c: number; night: number };
  let dmgTop = 0, takenTop = 0, penta = 0;
  for (const r of f.results as { feats: string }[]) {
    const x = parseFeat(r.feats);
    if (!x) continue;
    if (x.dmgTop) dmgTop++;
    if (x.takenTop) takenTop++;
    if ((x.multi ?? 0) >= 5) penta++;
  }
  const prismAugs = (a.results as { id: number }[]).filter((x) => AUGMENT[Number(x.id)]?.rarity === 'prismatic').length;
  const pioneerRoles = pioneer(await myGamesForMissions(env, id)).filter((p) => p.steps[0]?.done).length;
  return {
    games: gr.n, night: gr.night, champs: gr.c, dmgTop, takenTop, penta, prismAugs, pioneerRoles,
    champMasters: lv.champs.filter((x) => x.m.master).length, augMasters: lv.augs.filter((x) => x.m.master).length,
  };
}

/** 꾸밈 밖 상품의 지금 상태 (상점 화면) */
export async function usesOf(env: Env, id: string, lv: Awaited<ReturnType<typeof levelsOf>>) {
  const [sp, mem, gifts, ts] = await Promise.all([
    env.DB.prepare('SELECT kind, ref, at FROM piece_spend WHERE member_id = ?').bind(id).all<Spend>().catch(() => ({ results: [] as Spend[] })),
    env.DB.prepare('SELECT app_seen_at AS app, pinned_game AS pinned FROM members WHERE id = ?').bind(id).first<{ app: number; pinned: number | null }>().catch(() => null),
    env.DB.prepare(
      `SELECT o.item_id AS item, o.from_id AS "from", m.nick AS fromNick, o.note, o.bought_at AS at FROM shop_owned o LEFT JOIN members m ON m.id = o.from_id
       WHERE o.member_id = ? AND o.source = 'gift' ORDER BY o.bought_at DESC LIMIT 5`,
    ).bind(id).all<{ item: string; from: string; fromNick: string | null; note: string | null; at: number }>().catch(() => ({ results: [] as { item: string; from: string; fromNick: string | null; note: string | null; at: number }[] })),
    titleStats(env, id, lv),
  ]);
  const now = Date.now(), ws = weekStart(now);
  const insight: Partial<Record<InsightKind, number>> = {};
  for (const s of sp.results) if (s.kind === 'insight' && INSIGHT_KINDS.includes(s.ref as InsightKind)) {
    const until = s.at + INSIGHT_DAYS * DAY;
    if (until > (insight[s.ref as InsightKind] ?? 0)) insight[s.ref as InsightKind] = until;
  }
  for (const k of INSIGHT_KINDS) if ((insight[k] ?? 0) <= now) delete insight[k];
  const rerolls = sp.results.filter((s) => s.kind === 'reroll' && s.ref.startsWith(`${ws}:`)).length;
  return {
    insight,
    lens: sp.results.filter((s) => s.kind === 'lens').map((s) => s.ref),
    frame: sp.results.some((s) => s.kind === 'frame'),
    pinned: mem?.pinned ?? null,
    rerollsLeft: Math.max(0, REROLL_PER_WEEK - rerolls),
    titles: earnedTitles(ts),
    titleProgress: Object.fromEntries(TITLE_RULES.map((r) => [r.id, r.progress(ts)])),
    app: (mem?.app ?? 0) > 0,
    gifts: gifts.results.map((g) => ({ ...g, fromNick: g.fromNick ?? '멤버' })),
  };
}

const SHOP_CLOSED = '상점은 준비 중입니다.';
async function pay(env: Env, me: Member, kind: string, ref: string, base: number, itemId?: string) {
  const s = await state(env, me.id, me);
  // 꾸밈 선물은 그 상품의 할인 규칙 그대로 (출시 기간 새 상품 등, v3.123)
  const price = priceFor(base, itemId ? itemDiscount(itemId, s.rates.discount, s.rates.admin) : s.rates.discount);
  if (s.balance < price) throw new HttpError(400, `피스가 ${price - s.balance}개 모자라요.`);
  await env.DB.prepare('INSERT INTO piece_spend (member_id, kind, ref, price, at) VALUES (?, ?, ?, ?, ?)').bind(me.id, kind, ref, price, Date.now()).run();
  return s;
}

/** 이용권 사기: { kind: 'insight', ref } · { kind: 'lens', ref: 'c:ID' | 'a:ID' | 'i:ID' } · { kind: 'frame' } */
export async function buyUse(req: Request, env: Env, me: Member) {
  if (!can(me, 'shop')) throw new HttpError(403, SHOP_CLOSED);
  const { kind, ref } = (await req.json().catch(() => ({}))) as { kind?: string; ref?: string };
  const s = await state(env, me.id, me);
  if (kind === 'insight') {
    if (!INSIGHT_KINDS.includes(ref as InsightKind)) throw new HttpError(400, '없는 리포트입니다.');
    if ((s.uses.insight[ref as InsightKind] ?? 0) > Date.now() + DAY) throw new HttpError(409, '이미 열려 있어요.');
    await pay(env, me, 'insight', ref!, USE_PRICE.insight[ref as InsightKind]);
  } else if (kind === 'lens') {
    const ok = /^[cai]:\d+$/.test(ref ?? '');
    if (!ok) throw new HttpError(400, '잘못된 도감 칸입니다.');
    if (s.uses.lens.includes(ref!)) throw new HttpError(409, '이미 열어 봤어요.');
    await pay(env, me, 'lens', ref!, USE_PRICE.lens);
  } else if (kind === 'frame') {
    if (s.uses.frame) throw new HttpError(409, '이미 가지고 있어요.');
    await pay(env, me, 'frame', 'frame', USE_PRICE.frame);
  } else throw new HttpError(400, '없는 상품입니다.');
  return json(await state(env, me.id, me));
}

// ───────── 인사이트 리포트 ─────────

export async function insight(env: Env, me: Member, kind: string) {
  if (!INSIGHT_KINDS.includes(kind as InsightKind)) throw new HttpError(404, '없는 리포트입니다.');
  const open = await env.DB.prepare("SELECT MAX(at) AS at FROM piece_spend WHERE member_id = ? AND kind = 'insight' AND ref = ?").bind(me.id, kind).first<{ at: number | null }>();
  const until = (open?.at ?? 0) + INSIGHT_DAYS * DAY;
  if (until <= Date.now()) throw new HttpError(402, '인사이트권이 필요해요.');
  if (kind === 'aug') {
    const r = await env.DB.prepare('SELECT champion_id AS c, win AS w, augments FROM participants WHERE member_id = ?').bind(me.id).all<{ c: number; w: number; augments: string | null }>();
    const rows = r.results.map((x) => { let augs: number[] = []; try { augs = x.augments ? (JSON.parse(x.augments) as number[]).map(Number) : []; } catch { /* 없음 */ } return { c: x.c, w: x.w, augs }; });
    return json({ kind, until, report: augReport(rows) });
  }
  if (kind === 'golden') {
    const r = await env.DB.prepare('SELECT win AS w, played_at AS t FROM participants WHERE member_id = ?').bind(me.id).all<{ w: number; t: number }>();
    return json({ kind, until, report: goldenReport(r.results) });
  }
  // 베스트 파트너: 같은 판 같은 팀의 다른 회원
  const [mine, together] = await env.DB.batch([
    env.DB.prepare('SELECT win AS w, kills AS k, deaths AS d, assists AS a FROM participants WHERE member_id = ?').bind(me.id),
    env.DB.prepare(
      `SELECT o.member_id AS id, p.win AS w, p.champion_id AS mine, o.champion_id AS theirs, p.kills AS k, p.deaths AS d, p.assists AS a
       FROM participants p JOIN participants o ON o.game_id = p.game_id AND o.team_id = p.team_id AND o.member_id <> p.member_id
       WHERE p.member_id = ?`,
    ).bind(me.id),
  ]);
  const rows = together.results as { id: string; w: number; mine: number; theirs: number; k: number; d: number; a: number }[];
  const ids = [...new Set(rows.map((r) => r.id))];
  const people = ids.length
    ? (await env.DB.prepare(`SELECT m.id, m.nick, ${FACE('m')} FROM members m WHERE m.id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<{ id: string; nick: string; skin: number | null; main: number | null }>()).results
    : [];
  const nick = new Map(people.map((p) => [p.id, p.nick]));
  const rep = partnerReport(rows, mine.results as { w: number; k: number; d: number; a: number }[], (id) => (nick.get(id) ?? '멤버').split('#')[0]);
  return json({ kind, until, report: rep, people: people.filter((p) => rep.list.some((x) => x.id === p.id)) });
}

// ───────── 랜덤박스 ─────────

export async function openBox(env: Env, me: Member) {
  if (!can(me, 'shop')) throw new HttpError(403, SHOP_CLOSED);
  const s = await state(env, me.id, me);
  const item = drawBox(boxPool(s.owned));
  if (!item) throw new HttpError(409, '상자에서 나올 꾸밈을 이미 다 가지고 있어요.');
  await pay(env, me, 'box', item.id, USE_PRICE.box);
  await env.DB.prepare("INSERT OR IGNORE INTO shop_owned (member_id, item_id, price, bought_at, source) VALUES (?, ?, 0, ?, 'box')").bind(me.id, item.id, Date.now()).run();
  return json({ item: item.id, state: await state(env, me.id, me) });
}

// ───────── 선물 (앱을 쓰는 멤버끼리) ─────────

/** 선물할 수 있는 멤버: 앱을 쓰는 멤버 (나 빼고) + 그 사람이 이미 가진 꾸밈 */
export async function giftTargets(env: Env, me: Member) {
  const r = await env.DB.prepare(`SELECT m.id, m.nick, ${FACE('m')} FROM members m WHERE m.app_seen_at > 0 AND m.id <> ? ORDER BY m.app_seen_at DESC LIMIT 100`).bind(me.id)
    .all<{ id: string; nick: string; skin: number | null; main: number | null }>();
  const ids = r.results.map((x) => x.id);
  const own = ids.length
    ? (await env.DB.prepare(`SELECT member_id AS id, item_id AS item FROM shop_owned WHERE member_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<{ id: string; item: string }>()).results
    : [];
  return json({ members: r.results.map((m) => ({ ...m, owned: own.filter((o) => o.id === m.id).map((o) => o.item) })) });
}

export async function gift(req: Request, env: Env, me: Member) {
  if (!can(me, 'shop')) throw new HttpError(403, SHOP_CLOSED);
  const { to, id, note } = (await req.json().catch(() => ({}))) as { to?: string; id?: string; note?: string };
  const item = id ? SHOP_ITEM[id] : undefined;
  if (!item || !forSale(item)) throw new HttpError(400, '선물할 수 없는 상품입니다.');
  if (!to || to === me.id) throw new HttpError(400, '받을 멤버를 골라 주세요.');
  const [mine, them] = await Promise.all([
    env.DB.prepare('SELECT app_seen_at AS app FROM members WHERE id = ?').bind(me.id).first<{ app: number }>(),
    env.DB.prepare('SELECT nick, app_seen_at AS app FROM members WHERE id = ?').bind(to).first<{ nick: string; app: number }>(),
  ]);
  if (!(mine?.app ?? 0)) throw new HttpError(403, '선물은 Prism 앱을 쓰는 멤버끼리 주고받을 수 있어요.');
  if (!them || !(them.app ?? 0)) throw new HttpError(400, '앱을 쓰는 멤버에게만 선물할 수 있어요.');
  const has = await env.DB.prepare('SELECT 1 AS x FROM shop_owned WHERE member_id = ? AND item_id = ?').bind(to, item.id).first();
  if (has) throw new HttpError(409, '이미 가지고 있는 꾸밈이에요.');
  const msg = (note ?? '').replace(/\s+/g, ' ').trim().slice(0, GIFT_NOTE_MAX) || null;
  await pay(env, me, 'gift', `${to}:${item.id}`, item.price, item.id);
  await env.DB.prepare("INSERT OR IGNORE INTO shop_owned (member_id, item_id, price, bought_at, source, from_id, note) VALUES (?, ?, 0, ?, 'gift', ?, ?)")
    .bind(to, item.id, Date.now(), me.id, msg).run();
  if (botReady(env)) {
    await sendToChannel(env, env.BOT_CHANNEL_ID!, {
      content: `🎁 <@${me.id}> 님이 <@${to}> 님께 **${item.name}**${josa(item.name, '을/를').slice(item.name.length)} 선물했어요!${msg ? `\n> ${msg}` : ''}`,
      allowed_mentions: { users: [me.id, to] },
    }).catch(() => false);
  }
  return json(await state(env, me.id, me));
}

// ───────── 명장면 ─────────

/** 앱이 보낸 판 흐름 (본인 판·쿼드라 이상만 저장) */
export async function saveHighlights(req: Request, env: Env, me: Member) {
  const { games } = (await req.json().catch(() => ({}))) as { games?: { gameId?: number; kills?: HlKill[] }[] };
  if (!Array.isArray(games)) throw new HttpError(400, '잘못된 요청입니다.');
  let saved = 0;
  for (const g of games.slice(0, 20)) {
    const gid = Number(g.gameId);
    if (!Number.isInteger(gid) || !Array.isArray(g.kills)) continue;
    const p = await env.DB.prepare('SELECT feats FROM participants WHERE game_id = ? AND member_id = ?').bind(gid, me.id).first<{ feats: string | null }>();
    if (!p || (parseFeat(p.feats)?.multi ?? 0) < 4) continue;
    const kills = g.kills.slice(0, 60).map((k) => ({ t: Math.round(Number(k.t) || 0), v: Number(k.v) || 0, x: k.x == null ? undefined : Math.round(Number(k.x)), y: k.y == null ? undefined : Math.round(Number(k.y)), a: k.a == null ? undefined : Number(k.a) }))
      .filter((k) => k.t >= 0 && k.v > 0);
    if (!kills.length) continue;
    await env.DB.prepare('INSERT OR REPLACE INTO highlights (game_id, member_id, kills, at) VALUES (?, ?, ?, ?)').bind(gid, me.id, JSON.stringify(kills), Date.now()).run();
    saved++;
  }
  return json({ saved });
}

/** 한 회원의 명장면 후보 (쿼드라·펜타 판) */
export async function highlightsOf(env: Env, id: string, only?: number): Promise<Highlight[]> {
  const r = await env.DB.prepare(
    `SELECT p.game_id AS gameId, p.champion_id AS champ, p.win, p.played_at AS playedAt, g.duration, p.kills, p.deaths, p.assists, p.augments, p.feats, p.team_id AS team, h.kills AS seq
     FROM participants p JOIN matches g ON g.game_id = p.game_id LEFT JOIN highlights h ON h.game_id = p.game_id AND h.member_id = p.member_id
     WHERE p.member_id = ? AND p.feats IS NOT NULL ${only ? 'AND p.game_id = ?' : ''} ORDER BY p.played_at DESC LIMIT 400`,
  ).bind(...(only ? [id, only] : [id])).all<any>();
  const out: Highlight[] = [];
  for (const x of r.results) {
    const f = parseFeat(x.feats);
    if ((f?.multi ?? 0) < 4) continue;
    let augs: number[] = [], seq: HlKill[] | null = null;
    try { augs = x.augments ? (JSON.parse(x.augments) as number[]).map(Number) : []; } catch { /* 없음 */ }
    try { seq = x.seq ? (JSON.parse(x.seq) as HlKill[]) : null; } catch { /* 없음 */ }
    out.push({ gameId: x.gameId, champ: x.champ, multi: Math.min(5, f!.multi!), win: Boolean(x.win), playedAt: x.playedAt, duration: x.duration, kills: x.kills, deaths: x.deaths, assists: x.assists, share: f!.share, augments: augs, team: x.team, seq });
  }
  return out;
}

export async function myHighlights(env: Env, me: Member) {
  return json({ list: await highlightsOf(env, me.id) });
}

/** 명장면 걸기 (명장면 액자를 가진 회원): { gameId | null } */
export async function pinHighlight(req: Request, env: Env, me: Member) {
  const { gameId } = (await req.json().catch(() => ({}))) as { gameId?: number | null };
  const has = await env.DB.prepare("SELECT 1 AS x FROM piece_spend WHERE member_id = ? AND kind = 'frame'").bind(me.id).first();
  if (!has) throw new HttpError(403, '명장면 액자가 필요해요.');
  if (gameId != null && !(await highlightsOf(env, me.id, Number(gameId))).length) throw new HttpError(400, '쿼드라·펜타킬 판만 걸 수 있어요.');
  await env.DB.prepare('UPDATE members SET pinned_game = ? WHERE id = ?').bind(gameId ?? null, me.id).run();
  return json({ pinned: gameId ?? null });
}

/** 회원 페이지에 걸린 명장면 (액자를 가졌고 걸어 둔 판이 있을 때) */
export async function pinnedOf(env: Env, id: string): Promise<Highlight | null> {
  const m = await env.DB.prepare('SELECT pinned_game AS g FROM members WHERE id = ?').bind(id).first<{ g: number | null }>().catch(() => null);
  if (!m?.g) return null;
  return (await highlightsOf(env, id, m.g))[0] ?? null;
}

