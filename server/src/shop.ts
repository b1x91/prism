/**
 * 피스·상점·공개 링크 (CLAUDE.md v3.24).
 *  - 번 피스는 기록(판·도감·함께 해요)에서 늘 다시 계산한다. 따로 남기는 것은 매일 첫 접속과 산 꾸밈뿐.
 *  - 공개 링크(/api/public/:id)는 본인이 켰을 때만, 모임 정보 없이 그 사람의 강점만.
 */
import { augMastery, champMastery, dexLevel, type DexLevel } from '../../packages/core/src/mastery.js';
import { dexFromRows } from '../../packages/core/src/history.js';
import { parseFeat } from '../../packages/core/src/challenges.js';
import { EARN, SHOP_ITEM, earnedTotal, levelTotal, parseDeco, type Deco, type Earned, type ShopSlot } from '../../packages/core/src/shop.js';
import { dexRows } from './crew.js';
import { missionPiecesOf } from './missions.js';
import { HttpError, json, type Env, type Member } from './util.js';

const HOUR = 3_600_000;
/** 한국 날짜 (매일 첫 접속) */
const kstDay = (t = Date.now()) => new Date(t + 9 * HOUR).toISOString().slice(0, 10);

/** 매일 첫 접속: 접속 소식(presence)이 올 때 하루 한 번 남긴다 */
export async function markDaily(env: Env, id: string) {
  await env.DB.prepare('INSERT OR IGNORE INTO piece_daily (member_id, day) VALUES (?, ?)').bind(id, kstDay()).run().catch(() => {});
}

/** 도감 레벨: 챔피언·증강마다 지금 레벨 */
async function levelsOf(env: Env, id: string) {
  const dex = dexFromRows(await dexRows(env, id));
  const ch = dex.challenges ?? null;
  const champs = Object.entries(dex.champions).map(([k, e]) => ({ id: Number(k), m: champMastery(Number(k), e, dex.pairs, ch) }));
  const augs = Object.entries(dex.augments).map(([k, e]) => ({ id: Number(k), m: augMastery(Number(k), e, dex.pairs) }));
  return { champs, augs };
}

async function earned(env: Env, id: string): Promise<Earned> {
  const now = Date.now();
  const [g, t, d] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(win), 0) AS w, COALESCE(SUM(CASE WHEN crew_count >= 2 THEN 1 ELSE 0 END), 0) AS c FROM participants WHERE member_id = ?').bind(id),
    // 함께 해요: 참여한 판·내전의 시간(30분 전 ~ 3시간 뒤)에 실제로 기록된 판이 있으면
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT p.start_at AS at FROM party_slots s JOIN parties p ON p.id = s.party_id WHERE s.member_id = ?1 AND p.cancelled_at IS NULL AND p.start_at < ?2
         UNION ALL
         SELECT x.start_at AS at FROM scrim_slots s JOIN scrims x ON x.id = s.scrim_id WHERE s.member_id = ?1 AND x.cancelled_at IS NULL AND x.start_at < ?2
       ) t WHERE EXISTS (SELECT 1 FROM participants q WHERE q.member_id = ?1 AND q.played_at BETWEEN t.at - 1800000 AND t.at + 10800000)`,
    ).bind(id, now),
    env.DB.prepare('SELECT COUNT(*) AS n FROM piece_daily WHERE member_id = ?').bind(id),
  ]);
  const gr = g.results[0] as { n: number; w: number; c: number };
  const [{ champs, augs }, missions] = await Promise.all([levelsOf(env, id), missionPiecesOf(env, id)]);
  const levels = [...champs, ...augs].reduce((s, x) => s + levelTotal(dexLevel(x.m)), 0);
  return { games: gr.n, wins: gr.w, crew: gr.c, levels, together: (t.results[0] as { n: number }).n, daily: (d.results[0] as { n: number }).n, missions };
}

async function state(env: Env, id: string) {
  const [e, own, m] = await Promise.all([
    earned(env, id),
    env.DB.prepare('SELECT item_id AS id, price FROM shop_owned WHERE member_id = ?').bind(id).all<{ id: string; price: number }>(),
    env.DB.prepare('SELECT deco, share_on FROM members WHERE id = ?').bind(id).first<{ deco: string | null; share_on: number }>(),
  ]);
  const spent = own.results.reduce((s, x) => s + x.price, 0);
  return { balance: earnedTotal(e) - spent, earned: e, spent, owned: own.results.map((x) => x.id), deco: parseDeco(m?.deco), shared: Boolean(m?.share_on) };
}

export async function getShop(env: Env, me: Member) {
  await markDaily(env, me.id);
  return json(await state(env, me.id));
}

export async function buy(req: Request, env: Env, me: Member) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  const item = id ? SHOP_ITEM[id] : undefined;
  if (!item) throw new HttpError(400, '없는 상품입니다.');
  const s = await state(env, me.id);
  if (s.owned.includes(item.id)) throw new HttpError(409, '이미 가지고 있어요.');
  if (s.balance < item.price) throw new HttpError(400, `피스가 ${item.price - s.balance}개 모자라요.`);
  await env.DB.prepare('INSERT OR IGNORE INTO shop_owned (member_id, item_id, price, bought_at) VALUES (?, ?, ?, ?)').bind(me.id, item.id, item.price, Date.now()).run();
  // 사면 바로 장착
  const deco: Deco = { ...s.deco, [item.slot]: item.id };
  await env.DB.prepare('UPDATE members SET deco = ? WHERE id = ?').bind(JSON.stringify(deco), me.id).run();
  return json(await state(env, me.id));
}

/** 장착·해제 (가진 것만) */
export async function equip(req: Request, env: Env, me: Member) {
  const { slot, id } = (await req.json().catch(() => ({}))) as { slot?: ShopSlot; id?: string | null };
  const s = await state(env, me.id);
  if (!slot || !['frame', 'fx', 'name', 'title'].includes(slot)) throw new HttpError(400, '잘못된 칸입니다.');
  const deco: Deco = { ...s.deco };
  if (id) {
    if (SHOP_ITEM[id]?.slot !== slot || !s.owned.includes(id)) throw new HttpError(400, '가지고 있지 않은 꾸밈입니다.');
    deco[slot] = id;
  } else delete deco[slot];
  await env.DB.prepare('UPDATE members SET deco = ? WHERE id = ?').bind(JSON.stringify(deco), me.id).run();
  return json(await state(env, me.id));
}

/** 공개 링크 켜기·끄기 */
export async function setShare(req: Request, env: Env, me: Member) {
  const { on } = (await req.json().catch(() => ({}))) as { on?: boolean };
  await env.DB.prepare('UPDATE members SET share_on = ? WHERE id = ?').bind(on ? 1 : 0, me.id).run();
  return json({ shared: Boolean(on) });
}

/** 공개 링크: 로그인 없이. 본인이 켰을 때만, 모임 정보(순위·함께한 회원·최근 판·역할) 없이 강점만 */
export async function publicProfile(env: Env, id: string) {
  const m = await env.DB.prepare('SELECT id, nick, intro, profile_skin AS skin, deco, share_on FROM members WHERE id = ?')
    .bind(id).first<{ id: string; nick: string; intro: string; skin: number | null; deco: string | null; share_on: number }>();
  if (!m || !m.share_on) throw new HttpError(404, '공개되지 않은 페이지입니다.');
  const [total, champs, feats] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(win), 0) AS w, COALESCE(SUM(kills), 0) AS k, COALESCE(SUM(deaths), 0) AS d, COALESCE(SUM(assists), 0) AS a FROM participants WHERE member_id = ?').bind(id),
    env.DB.prepare('SELECT champion_id AS id, COUNT(*) AS n, SUM(win) AS w, SUM(kills) AS k, SUM(deaths) AS d, SUM(assists) AS a FROM participants WHERE member_id = ? GROUP BY champion_id ORDER BY n DESC').bind(id),
    env.DB.prepare('SELECT feats FROM participants WHERE member_id = ? AND feats IS NOT NULL').bind(id),
  ]);
  const f = { penta: 0, quadra: 0, dmgTop: 0, takenTop: 0 };
  for (const r of feats.results as { feats: string }[]) {
    const x = parseFeat(r.feats);
    if (!x) continue;
    if ((x.multi ?? 0) >= 5) f.penta++; else if ((x.multi ?? 0) === 4) f.quadra++;
    if (x.dmgTop) f.dmgTop++;
    if (x.takenTop) f.takenTop++;
  }
  const { champs: lv, augs } = await levelsOf(env, id);
  const levels = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<DexLevel, number>;
  for (const x of [...lv, ...augs]) levels[dexLevel(x.m)]++;
  const list = champs.results as { id: number; n: number; w: number; k: number; d: number; a: number }[];
  // 잘하는 챔피언: 3판 이상 중 승수·승률 순
  const best = list.filter((c) => c.n >= 3).sort((a, b) => b.w - a.w || b.w / b.n - a.w / a.n).slice(0, 5).map(({ id: cid, n, w }) => ({ id: cid, n, w }));
  return json({
    id: m.id, nick: m.nick, intro: m.intro, skin: m.skin, deco: parseDeco(m.deco),
    total: total.results[0], best, masters: lv.filter((x) => x.m.master).map((x) => x.id), levels, feats: f, champions: list,
  });
}

export { EARN };
