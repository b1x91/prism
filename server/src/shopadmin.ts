/**
 * 운영 › 상점관리 (CLAUDE.md v3.186, 관리자만).
 * - 품절 덮어쓰기: D1 ext_cache 'shop-retire' = {상품: true|false}. 요청마다(20초 담아 둠) 표에 반영해 목록·구매·선물·랜덤박스가 같은 값을 본다.
 * - 조회 수: 회원이 구매 확인 창을 열면 회원·상품·날짜(한국)마다 한 번 (shop_views).
 * - 구매 기록: 산 꾸밈(shop_owned: 구매·랜덤박스·선물) + 이용권(piece_spend). 관리자 화면에만.
 */
import { SHOP, SHOP_ITEM, applyRetire, baseRetired, forSale } from '../../packages/core/src/shop.js';
import { FACE, HttpError, json, type Env, type Member } from './util.js';

const KEY = 'shop-retire';
let cached: { at: number; over: Record<string, boolean> } | null = null;

/** 품절 덮어쓰기를 표에 반영한다 (20초 담아 둠). 실패하면 이 빌드의 값 그대로 */
export async function syncRetire(env: Env, force = false) {
  if (!force && cached && Date.now() - cached.at < 20_000) return;
  let over: Record<string, boolean> = {};
  try {
    const r = await env.DB.prepare('SELECT v FROM ext_cache WHERE k = ?').bind(KEY).first<{ v: string }>();
    const o = r ? (JSON.parse(r.v) as Record<string, unknown>) : {};
    for (const [k, v] of Object.entries(o)) if (SHOP_ITEM[k] && typeof v === 'boolean') over[k] = v;
  } catch { over = cached?.over ?? {}; }
  cached = { at: Date.now(), over };
  applyRetire(over);
}

const kstDay = (t = Date.now()) => new Date(t + 9 * 3600_000).toISOString().slice(0, 10);

/** 조회 한 번 (구매 확인 창을 열었을 때) */
export async function shopView(req: Request, env: Env, me: Member) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id || !SHOP_ITEM[id]) return json({ ok: false });
  await env.DB.prepare('INSERT OR IGNORE INTO shop_views (item_id, member_id, day, at) VALUES (?, ?, ?, ?)').bind(id, me.id, kstDay(), Date.now()).run();
  return json({ ok: true });
}

const DAY = 86_400_000;
const USE_KO: Record<string, string> = { insight: '인사이트권', lens: '도감 돋보기', reroll: '미션 다시 뽑기', gift: '선물', box: '랜덤박스', frame: '명장면 액자' };

export async function shopAdmin(env: Env, me: Member) {
  if (me.tier !== 'admin') throw new HttpError(403, '관리자만 볼 수 있어요');
  await syncRetire(env, true);
  const since = Date.now() - 30 * DAY;
  const [own, views, recentOwned, recentUses] = await Promise.all([
    env.DB.prepare(`SELECT item_id AS id, COUNT(*) AS n, SUM(CASE WHEN bought_at >= ?1 THEN 1 ELSE 0 END) AS n30,
        SUM(CASE WHEN COALESCE(source, 'buy') = 'buy' THEN 1 ELSE 0 END) AS paid, SUM(price) AS revenue, MAX(bought_at) AS last
      FROM shop_owned GROUP BY item_id`).bind(since).all<{ id: string; n: number; n30: number; paid: number; revenue: number; last: number }>(),
    env.DB.prepare('SELECT item_id AS id, COUNT(*) AS n, SUM(CASE WHEN at >= ?1 THEN 1 ELSE 0 END) AS n30 FROM shop_views GROUP BY item_id').bind(since).all<{ id: string; n: number; n30: number }>(),
    env.DB.prepare(`SELECT o.item_id AS item, o.price, o.bought_at AS at, COALESCE(o.source, 'buy') AS source, o.member_id AS memberId, m.nick, ${FACE('m')}, f.nick AS fromNick
      FROM shop_owned o JOIN members m ON m.id = o.member_id LEFT JOIN members f ON f.id = o.from_id ORDER BY o.bought_at DESC LIMIT 300`).all<{ item: string; price: number; at: number; source: string; memberId: string; nick: string; skin: number | null; main: number | null; fromNick: string | null }>(),
    env.DB.prepare(`SELECT s.kind, s.ref, s.price, s.at, s.member_id AS memberId, m.nick, ${FACE('m')}
      FROM piece_spend s JOIN members m ON m.id = s.member_id WHERE s.kind != 'grant' AND s.price > 0 ORDER BY s.at DESC LIMIT 300`).all<{ kind: string; ref: string; price: number; at: number; memberId: string; nick: string; skin: number | null; main: number | null }>(),
  ]);
  const o = new Map(own.results.map((x) => [x.id, x]));
  const v = new Map(views.results.map((x) => [x.id, x]));
  const items = SHOP.filter((x) => x.slot !== 'title' || o.has(x.id)).map((x) => {
    const a = o.get(x.id), b = v.get(x.id);
    return { id: x.id, name: x.name, slot: x.slot, rarity: x.rarity, price: x.price, retired: Boolean(x.retired), baseRetired: baseRetired(x.id), sellable: x.slot !== 'title' && !x.reward,
      owners: a?.n ?? 0, bought30: a?.n30 ?? 0, paid: a?.paid ?? 0, revenue: a?.revenue ?? 0, last: a?.last ?? null, views: b?.n ?? 0, views30: b?.n30 ?? 0 };
  });
  const recent = [
    ...recentOwned.results.map((r) => ({ type: r.source as 'buy' | 'box' | 'gift', item: r.item, label: SHOP_ITEM[r.item]?.name ?? r.item, price: r.price, at: r.at, memberId: r.memberId, nick: r.nick, skin: r.skin, main: r.main, fromNick: r.fromNick })),
    // 이용권 (랜덤박스·선물은 위의 '받은 꾸밈' 줄과 짝이라 값만 따로 보인다)
    ...recentUses.results.map((r) => ({ type: 'use' as const, item: r.kind, label: USE_KO[r.kind] ?? r.kind, ref: r.ref, price: r.price, at: r.at, memberId: r.memberId, nick: r.nick, skin: r.skin, main: r.main, fromNick: null })),
  ].sort((x, y) => y.at - x.at).slice(0, 300);
  const spent30 = recent.filter((r) => r.at >= since && (r.type === 'buy' || r.type === 'use')).reduce((s, r) => s + r.price, 0);
  return json({ items, recent, spent30, onSale: SHOP.filter(forSale).length });
}

/** 품절로 바꾸거나 되돌린다 (이 파일의 기본값과 같아지면 덮어쓰기를 지운다) */
export async function setRetire(req: Request, env: Env, me: Member) {
  if (me.tier !== 'admin') throw new HttpError(403, '관리자만 바꿀 수 있어요');
  const { id, retired } = (await req.json().catch(() => ({}))) as { id?: string; retired?: boolean };
  if (!id || !SHOP_ITEM[id] || typeof retired !== 'boolean') throw new HttpError(400, '잘못된 요청이에요');
  if (SHOP_ITEM[id].slot === 'title') throw new HttpError(400, '칭호는 팔지 않는 상품이에요');
  const r = await env.DB.prepare('SELECT v FROM ext_cache WHERE k = ?').bind(KEY).first<{ v: string }>();
  const over = (r ? JSON.parse(r.v) : {}) as Record<string, boolean>;
  if (retired === baseRetired(id)) delete over[id]; else over[id] = retired;
  await env.DB.prepare('INSERT INTO ext_cache (k, v, at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at').bind(KEY, JSON.stringify(over), Date.now()).run();
  await syncRetire(env, true);
  return json({ ok: true, id, retired: Boolean(SHOP_ITEM[id].retired) });
}
