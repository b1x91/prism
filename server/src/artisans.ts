/**
 * 장인: 도감 마스터 여정(packages/core/src/mastery.ts)을 회원마다 계산한다. 화면의 도감과 같은 기준.
 *  - 챔피언·증강 상세: 그 챔피언(증강)의 장인(마스터)과 장인의 길에 오른 회원 순위
 *  - 랭킹: 챔피언 장인 / 증강 장인 (마스터 수 → 이룬 목표 수)
 */
import { can, isPending, LIMITED } from './roles.js';
import { augMastery, champMastery, itemMastery, type Mastery } from '../../packages/core/src/mastery.js';
import { itemRows } from './crew.js';
import type { DexEntry, DexPair, ItemPair } from '../../packages/core/src/history.js';
import { parseFeat, tallyChallenges, type ChallengeTally, type FeatGame } from '../../packages/core/src/challenges.js';
import { FACE, json, type Env, type Member } from './util.js';

type FeatRow = { member_id: string; championId: number; win: number; kills: number; deaths: number; feats: string };

/**
 * 역할 챌린지 집계. known(롤 클라이언트가 그 값을 주는지)은 회원·챔피언과 상관없는 성질이라
 * 최근 기록 몇 백 판에서 한 번이라도 나온 값으로 본다 → 도감·장인·랭킹이 같은 기준.
 */
export async function knownFeats(env: Env): Promise<string[]> {
  const { results } = await env.DB.prepare('SELECT member_id, champion_id AS championId, win, kills, deaths, feats FROM participants WHERE feats IS NOT NULL ORDER BY played_at DESC LIMIT 300').all<FeatRow>();
  return tallyChallenges(toGames(results)).known;
}
function toGames(rows: FeatRow[]): ({ championId: number } & FeatGame)[] {
  return rows.flatMap((r) => { const f = parseFeat(r.feats); return f ? [{ championId: r.championId, win: Boolean(r.win), kills: r.kills, deaths: r.deaths, f }] : []; });
}
/** 회원별 챌린지 집계 */
export function tallyByMember(rows: FeatRow[], known: string[]): Map<string, ChallengeTally> {
  const by = new Map<string, FeatRow[]>();
  for (const r of rows) { const l = by.get(r.member_id) ?? []; l.push(r); by.set(r.member_id, l); }
  return new Map([...by].map(([id, rs]) => [id, { counts: tallyChallenges(toGames(rs)).counts, known }]));
}
const FEAT_COLS = 'member_id, champion_id AS championId, win, kills, deaths, feats';

type Row = { member_id: string; id?: number; n: number; w: number };
type PairRow = { member_id: string; aug: number; champ: number; n: number; w: number };
type Face = { id: string; nick: string; skin: number | null; main: number | null; pending?: boolean };

const entry = (r: { n: number; w: number }): DexEntry => ({ n: r.n, w: r.w ?? 0, first: 0, last: 0 });

async function faces(env: Env, ids: string[]): Promise<Map<string, Face>> {
  if (!ids.length) return new Map();
  const { results } = await env.DB.prepare(`SELECT m.id, m.nick, ${FACE('m')}, m.tier, m.discord_roles, m.app_first_at FROM members m WHERE m.id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<Face & { tier: Member['tier']; app_first_at: number; discord_roles: string | null }>();
  // 승인 대기 표시 (v3.107)
  return new Map(results.map(({ tier, discord_roles, app_first_at, ...f }) => [f.id, isPending({ tier, discord_roles, app_first_at }) ? { ...f, pending: true } : f]));
}

const view = (m: Mastery, e: DexEntry) => ({ master: m.master, done: m.done, total: m.total, n: e.n, w: e.w, special: m.special.tried.length > 0 });
const order = (a: ReturnType<typeof view>, b: ReturnType<typeof view>) => Number(b.master) - Number(a.master) || b.done - a.done || b.w - a.w || b.n - a.n;

/** 한 챔피언의 장인과 장인의 길 순위 */
export async function championArtisans(env: Env, champ: number) {
  const [rows, pairs, feats] = await env.DB.batch([
    env.DB.prepare('SELECT member_id, COUNT(*) AS n, SUM(win) AS w FROM participants WHERE champion_id = ? GROUP BY member_id').bind(champ),
    env.DB.prepare('SELECT member_id, augment_id AS aug, champion_id AS champ, COUNT(*) AS n, SUM(win) AS w FROM participant_augments WHERE champion_id = ? GROUP BY member_id, augment_id').bind(champ),
    env.DB.prepare(`SELECT ${FEAT_COLS} FROM participants WHERE champion_id = ? AND feats IS NOT NULL`).bind(champ),
  ]);
  const byMember = groupPairs(pairs.results as PairRow[]);
  const kn = await knownFeats(env);
  const ch = tallyByMember(feats.results as FeatRow[], kn);
  const list = (rows.results as Row[]).map((r) => {
    const e = entry(r);
    return { id: r.member_id, ...view(champMastery(champ, e, byMember.get(r.member_id) ?? [], ch.get(r.member_id) ?? { counts: {}, known: kn }), e) };
  }).sort(order).slice(0, 10);
  return json({ artisans: await withFaces(env, list) });
}

/** 한 증강의 장인과 장인의 길 순위 */
export async function augmentArtisans(env: Env, aug: number) {
  const [rows, pairs] = await env.DB.batch([
    env.DB.prepare('SELECT member_id, COUNT(*) AS n, SUM(win) AS w FROM participant_augments WHERE augment_id = ? GROUP BY member_id').bind(aug),
    env.DB.prepare('SELECT member_id, augment_id AS aug, champion_id AS champ, COUNT(*) AS n, SUM(win) AS w FROM participant_augments WHERE augment_id = ? GROUP BY member_id, champion_id').bind(aug),
  ]);
  const byMember = groupPairs(pairs.results as PairRow[]);
  const list = (rows.results as Row[]).map((r) => {
    const e = entry(r);
    return { id: r.member_id, ...view(augMastery(aug, e, byMember.get(r.member_id) ?? []), e) };
  }).sort(order).slice(0, 10);
  return json({ artisans: await withFaces(env, list) });
}

/** 한 아이템의 장인과 장인의 길 순위 (v3.119) — 끝까지 갖고 있던 판으로 센다. 바뀐 모습(무라마나 등)은 처음 산 아이템으로 */
export async function itemArtisans(env: Env, item: number) {
  const { results } = await env.DB.prepare(`SELECT member_id, champ, COUNT(*) AS n, SUM(win) AS w FROM (${itemRows('1 = 1')}) WHERE item = ? GROUP BY member_id, champ`).bind(item).all<{ member_id: string; champ: number; n: number; w: number }>();
  const by = groupItemPairs(results.map((r) => ({ ...r, item })));
  const list = [...by].map(([id, ps]) => {
    const e = entry(ps.reduce((a, p) => ({ n: a.n + p.n, w: a.w + p.w }), { n: 0, w: 0 }));
    return { id, ...view(itemMastery(item, e, ps), e) };
  }).sort(order).slice(0, 10);
  return json({ artisans: await withFaces(env, list) });
}

function groupItemPairs(rows: { member_id: string; item: number; champ: number; n: number; w: number }[]) {
  const by = new Map<string, ItemPair[]>();
  for (const r of rows) { const l = by.get(r.member_id) ?? []; l.push({ item: r.item, champ: r.champ, n: r.n, w: r.w ?? 0 }); by.set(r.member_id, l); }
  return by;
}

/** 랭킹: 챔피언 장인 / 증강 장인 / 아이템 장인. 회원마다 마스터 수·이룬 목표 수·대표 마스터 */
export async function artisanRanking(env: Env, me: Member) {
  const [champRows, augRows, pairs, feats, itemPairRows] = await env.DB.batch([
    env.DB.prepare('SELECT member_id, champion_id AS id, COUNT(*) AS n, SUM(win) AS w FROM participants GROUP BY member_id, champion_id'),
    env.DB.prepare('SELECT member_id, augment_id AS id, COUNT(*) AS n, SUM(win) AS w FROM participant_augments GROUP BY member_id, augment_id'),
    env.DB.prepare('SELECT member_id, augment_id AS aug, champion_id AS champ, COUNT(*) AS n, SUM(win) AS w FROM participant_augments GROUP BY member_id, augment_id, champion_id'),
    env.DB.prepare(`SELECT ${FEAT_COLS} FROM participants WHERE feats IS NOT NULL`),
    env.DB.prepare(`SELECT member_id, item, champ, COUNT(*) AS n, SUM(win) AS w FROM (${itemRows('1 = 1')}) GROUP BY member_id, item, champ`),
  ]);
  const byMember = groupPairs(pairs.results as PairRow[]);
  const byItem = groupItemPairs(itemPairRows.results as { member_id: string; item: number; champ: number; n: number; w: number }[]);
  const kn = await knownFeats(env);
  const ch = tallyByMember(feats.results as FeatRow[], kn);
  const tally = (rows: Row[], calc: (id: number, e: DexEntry, p: DexPair[], c: ChallengeTally, mid: string) => Mastery) => {
    const acc = new Map<string, { masters: number[]; goals: number; caught: number; best: { id: number; done: number; w: number } | null }>();
    for (const r of rows) {
      const e = entry(r);
      const m = calc(r.id!, e, byMember.get(r.member_id) ?? [], ch.get(r.member_id) ?? { counts: {}, known: kn }, r.member_id);
      const a = acc.get(r.member_id) ?? { masters: [], goals: 0, caught: 0, best: null };
      if (m.master) a.masters.push(r.id!);
      if (m.caught) a.caught++;
      a.goals += m.done;
      // 대표: 마스터가 없으면 가장 마스터에 가까운 것
      if (!a.best || m.done > a.best.done || (m.done === a.best.done && e.w > a.best.w)) a.best = { id: r.id!, done: m.done, w: e.w };
      acc.set(r.member_id, a);
    }
    return [...acc].map(([id, a]) => ({ id, masters: a.masters.length, masterIds: a.masters.slice(0, 8), caught: a.caught, goals: a.goals, best: a.best }))
      .filter((x) => x.goals > 0)
      .sort((x, y) => y.masters - x.masters || y.goals - x.goals || y.caught - x.caught);
  };
  const champions = tally(champRows.results as Row[], champMastery);
  const augments = tally(augRows.results as Row[], (id, e, p) => augMastery(id, e, p));
  // 아이템: 회원 × 아이템 합계를 만들어 같은 틀로
  const itemRowsAll: Row[] = [];
  for (const [mid, ps] of byItem) {
    const acc = new Map<number, Row>();
    for (const p of ps) { const r = acc.get(p.item) ?? { member_id: mid, id: p.item, n: 0, w: 0 }; r.n += p.n; r.w += p.w; acc.set(p.item, r); }
    itemRowsAll.push(...acc.values());
  }
  const items = tally(itemRowsAll, (id, e, _p, _c, mid) => itemMastery(id, e, byItem.get(mid) ?? []));
  const f = await faces(env, [...new Set([...champions, ...augments, ...items].map((x) => x.id))]);
  const put = <T extends { id: string }>(xs: T[]) => xs.map((x) => ({ ...x, nick: f.get(x.id)?.nick ?? '?', skin: f.get(x.id)?.skin ?? null, main: f.get(x.id)?.main ?? null }));
  const lim = <T>(l: T[]) => (can(me, 'rankingAll') ? l : l.slice(0, LIMITED));
  const c = put(champions), a = put(augments), i = put(items);
  return json({ champions: lim(c), augments: lim(a), items: lim(i), ...(can(me, 'rankingAll') ? {} : { limited: { champions: c.length, augments: a.length, items: i.length } }) });
}

function groupPairs(rows: PairRow[]) {
  const by = new Map<string, DexPair[]>();
  for (const p of rows) {
    const l = by.get(p.member_id) ?? [];
    l.push({ aug: p.aug, champ: p.champ, n: p.n, w: p.w ?? 0 });
    by.set(p.member_id, l);
  }
  return by;
}

async function withFaces<T extends { id: string }>(env: Env, list: T[]) {
  const f = await faces(env, list.map((x) => x.id));
  return list.map((x) => ({ ...x, nick: f.get(x.id)?.nick ?? '?', skin: f.get(x.id)?.skin ?? null, main: f.get(x.id)?.main ?? null }));
}
