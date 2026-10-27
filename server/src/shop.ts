/**
 * 피스·상점·공개 링크 (CLAUDE.md v3.24).
 *  - 번 피스는 기록(판·도감·함께 해요)에서 늘 다시 계산한다. 따로 남기는 것은 매일 첫 접속과 산 꾸밈뿐.
 *  - 공개 링크(/api/public/:id)는 본인이 켰을 때만, 모임 정보 없이 그 사람의 강점만.
 */
import { augMastery, champMastery, dexLevel, type DexLevel } from '../../packages/core/src/mastery.js';
import { dexFromRows } from '../../packages/core/src/history.js';
import { parseFeat } from '../../packages/core/src/challenges.js';
import { usesOf } from './goods.js';
import { EARN, INVITE_BONUS, SHOP_ITEM, forSale, earnedTotal, runBonusOf, levelTotal, parseDeco, type Deco, type Earned, type ShopSlot } from '../../packages/core/src/shop.js';
import { dexRows } from './crew.js';
import { missionPiecesOf } from './missions.js';
import { HttpError, json, type Env, type Member } from './util.js';
import { can, ratesOf } from './roles.js';

const SHOP_CLOSED = '상점은 준비 중입니다.';

const HOUR = 3_600_000;
/** 한국 날짜 (매일 첫 접속) */
const kstDay = (t = Date.now()) => new Date(t + 9 * HOUR).toISOString().slice(0, 10);

/** 매일 첫 접속: 접속 소식(presence)이 올 때 하루 한 번 남긴다 */
export async function markDaily(env: Env, id: string) {
  await env.DB.prepare('INSERT OR IGNORE INTO piece_daily (member_id, day) VALUES (?, ?)').bind(id, kstDay()).run().catch(() => {});
}

/** 도감 레벨: 챔피언·증강마다 지금 레벨 */
export async function levelsOf(env: Env, id: string) {
  const dex = dexFromRows(await dexRows(env, id));
  const ch = dex.challenges ?? null;
  const champs = Object.entries(dex.champions).map(([k, e]) => ({ id: Number(k), m: champMastery(Number(k), e, dex.pairs, ch) }));
  const augs = Object.entries(dex.augments).map(([k, e]) => ({ id: Number(k), m: augMastery(Number(k), e, dex.pairs) }));
  return { champs, augs };
}

export async function earned(env: Env, id: string, lv?: Awaited<ReturnType<typeof levelsOf>>): Promise<Earned> {
  const now = Date.now();
  const [g, t, d, cr, inv] = await env.DB.batch([
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
    // 함께 연판: 멤버 2명 이상 판의 시각 (v3.83)
    env.DB.prepare('SELECT played_at AS t FROM participants WHERE member_id = ? AND crew_count >= 2 ORDER BY played_at').bind(id),
    // 친구 초대: 초대한 친구가 승인된 수 (v3.106)
    env.DB.prepare('SELECT COUNT(*) AS n FROM invite_rewards WHERE inviter = ?').bind(id),
  ]);
  const gr = g.results[0] as { n: number; w: number; c: number };
  const [{ champs, augs }, missions] = await Promise.all([lv ?? levelsOf(env, id), missionPiecesOf(env, id)]);
  const levels = [...champs, ...augs].reduce((s, x) => s + levelTotal(dexLevel(x.m)), 0);
  return { games: gr.n, wins: gr.w, crew: gr.c, levels, together: (t.results[0] as { n: number }).n, daily: (d.results[0] as { n: number }).n, missions, run: runBonusOf((cr.results as { t: number }[]).map((r) => r.t)), invites: (inv.results[0] as { n: number } | undefined)?.n ?? 0 };
}

/** 단계별 피스 배율·특별회원 할인 (v3.32) */
export const priceFor = (price: number, discount: number) => Math.round(price * (1 - discount));

/** 잔액·가진 것·꾸밈 밖 상품 (v3.99). 잔액 = 번 피스 × 배율 − 산 꾸밈 − 이용권·선물·랜덤박스에 쓴 피스 */
export async function state(env: Env, id: string, m: Pick<Member, 'tier' | 'discord_roles'>) {
  const lv = await levelsOf(env, id);
  const [e, own, row, spend, uses] = await Promise.all([
    earned(env, id, lv),
    env.DB.prepare('SELECT item_id AS id, price FROM shop_owned WHERE member_id = ?').bind(id).all<{ id: string; price: number }>(),
    env.DB.prepare('SELECT deco, share_on FROM members WHERE id = ?').bind(id).first<{ deco: string | null; share_on: number }>(),
    env.DB.prepare('SELECT COALESCE(SUM(price), 0) AS s FROM piece_spend WHERE member_id = ?').bind(id).first<{ s: number }>().catch(() => ({ s: 0 })),
    usesOf(env, id, lv),
  ]);
  const spent = own.results.reduce((s, x) => s + x.price, 0) + (spend?.s ?? 0);
  const rates = ratesOf(m);
  // 초대 보너스는 배율 밖 고정값 (v3.106)
  const total = Math.round(earnedTotal(e) * rates.piece) + (e.invites ?? 0) * INVITE_BONUS;
  return { balance: total - spent, earned: e, spent, owned: own.results.map((x) => x.id), deco: parseDeco(row?.deco), shared: Boolean(row?.share_on), rates, uses };
}

export async function getShop(env: Env, me: Member) {
  await markDaily(env, me.id);
  return json(await state(env, me.id, me));
}

export async function buy(req: Request, env: Env, me: Member) {
  if (!can(me, 'shop')) throw new HttpError(403, SHOP_CLOSED);
  // equip: 사면서 바로 장착할지 (예전 앱은 보내지 않으므로 기본은 장착 — 새 화면은 산 뒤 '바로 착용할까요?'를 묻는다)
  const { id, equip: wear } = (await req.json().catch(() => ({}))) as { id?: string; equip?: boolean };
  const item = id ? SHOP_ITEM[id] : undefined;
  if (!item) throw new HttpError(400, '없는 상품입니다.');
  if (!forSale(item)) throw new HttpError(400, '칭호는 미션·도감·활약으로 얻어요.');
  const s = await state(env, me.id, me);
  if (s.owned.includes(item.id)) throw new HttpError(409, '이미 가지고 있어요.');
  const price = priceFor(item.price, s.rates.discount);
  if (s.balance < price) throw new HttpError(400, `피스가 ${price - s.balance}개 모자라요.`);
  await env.DB.prepare('INSERT OR IGNORE INTO shop_owned (member_id, item_id, price, bought_at) VALUES (?, ?, ?, ?)').bind(me.id, item.id, price, Date.now()).run();
  if (wear !== false) {
    const deco: Deco = { ...s.deco, [item.slot]: item.id };
    await env.DB.prepare('UPDATE members SET deco = ? WHERE id = ?').bind(JSON.stringify(deco), me.id).run();
  }
  return json(await state(env, me.id, me));
}

/** 장착·해제 (가진 것만) */
export async function equip(req: Request, env: Env, me: Member) {
  if (!can(me, 'shop')) throw new HttpError(403, SHOP_CLOSED);
  const { slot, id } = (await req.json().catch(() => ({}))) as { slot?: ShopSlot; id?: string | null };
  const s = await state(env, me.id, me);
  if (!slot || !['bg', 'frame', 'fx', 'name', 'title'].includes(slot)) throw new HttpError(400, '잘못된 칸입니다.');
  const deco: Deco = { ...s.deco };
  if (id) {
    if (SHOP_ITEM[id]?.slot !== slot || !(s.owned.includes(id) || s.uses.titles.includes(id))) throw new HttpError(400, '가지고 있지 않은 꾸밈입니다.');
    deco[slot] = id;
  } else delete deco[slot];
  await env.DB.prepare('UPDATE members SET deco = ? WHERE id = ?').bind(JSON.stringify(deco), me.id).run();
  return json(await state(env, me.id, me));
}

/** 공유 링크 번호: 없으면 100~999 중 비어 있는 것 하나 (한 번 받으면 바뀌지 않는다) */
async function shareCode(env: Env, id: string): Promise<number> {
  const row = await env.DB.prepare('SELECT share_code AS c FROM members WHERE id = ?').bind(id).first<{ c: number | null }>();
  if (row?.c) return row.c;
  const used = new Set((await env.DB.prepare('SELECT share_code AS c FROM members WHERE share_code IS NOT NULL').all<{ c: number }>()).results.map((x) => x.c));
  const free = Array.from({ length: 900 }, (_, i) => 100 + i).filter((c) => !used.has(c));
  // 다 차면 네 자리로 넓힌다
  const pool = free.length ? free : Array.from({ length: 9000 }, (_, i) => 1000 + i).filter((c) => !used.has(c));
  for (let tries = 0; tries < 5; tries++) {
    const c = pool[Math.floor(Math.random() * pool.length)];
    const r = await env.DB.prepare('UPDATE members SET share_code = ? WHERE id = ? AND share_code IS NULL').bind(c, id).run().catch(() => null);
    if (r?.meta.changes) return c;
    const again = await env.DB.prepare('SELECT share_code AS c FROM members WHERE id = ?').bind(id).first<{ c: number | null }>();
    if (again?.c) return again.c;
  }
  throw new HttpError(500, '링크 번호를 만들지 못했어요. 다시 눌러 주세요.');
}

/** 공개 링크 켜기·끄기. 켜면 짧은 번호를 함께 준다 */
export async function setShare(req: Request, env: Env, me: Member) {
  const { on } = (await req.json().catch(() => ({}))) as { on?: boolean };
  await env.DB.prepare('UPDATE members SET share_on = ? WHERE id = ?').bind(on ? 1 : 0, me.id).run();
  return json({ shared: Boolean(on), code: on ? await shareCode(env, me.id) : null });
}

/** 공개 링크 (v3.86): 로그인 없이. 링크를 한 번 만든 회원만(번호가 있을 때), 끄는 단추는 없다.
 *  보이는 것은 꾸민 머리·판수·도감 레벨·마스터·활약뿐 — 승률·KDA·잘하는 챔프·플레이 성향 같은 분석은 회원에게만 */
export async function publicProfile(env: Env, key: string) {
  // 짧은 번호(/p/123) 또는 예전 긴 주소(디스코드 ID)
  const byCode = /^\d{3,4}$/.test(key);
  const m = await env.DB.prepare(`SELECT id, nick, intro, profile_skin AS skin, deco, share_code FROM members WHERE ${byCode ? 'share_code' : 'id'} = ?`)
    .bind(byCode ? Number(key) : key).first<{ id: string; nick: string; intro: string; skin: number | null; deco: string | null; share_code: number | null }>();
  if (!m || !m.share_code) throw new HttpError(404, '공개되지 않은 페이지입니다.');
  const id = m.id;
  const [total, champs, feats] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS n FROM participants WHERE member_id = ?').bind(id),
    env.DB.prepare('SELECT champion_id AS id FROM participants WHERE member_id = ? GROUP BY champion_id ORDER BY COUNT(*) DESC LIMIT 1').bind(id),
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
  return json({
    id: m.id, nick: m.nick, intro: m.intro, skin: m.skin, deco: parseDeco(m.deco),
    total: { n: (total.results[0] as { n: number }).n }, main: (champs.results[0] as { id: number } | undefined)?.id ?? null,
    masters: lv.filter((x) => x.m.master).map((x) => x.id), levels, feats: f,
  });
}

export { EARN };
