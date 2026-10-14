/**
 * 장인: 도감 마스터 여정(packages/core/src/mastery.ts)을 회원마다 계산한다. 화면의 도감과 같은 기준.
 *  - 챔피언·증강 상세: 그 챔피언(증강)의 장인(마스터)과 장인의 길에 오른 회원 순위
 *  - 랭킹: 챔피언 장인 / 증강 장인 (마스터 수 → 이룬 목표 수)
 */
import { augMastery, champMastery, type Mastery } from '../../packages/core/src/mastery.js';
import type { DexEntry, DexPair } from '../../packages/core/src/history.js';
import { FACE, json, type Env } from './util.js';

type Row = { member_id: string; id?: number; n: number; w: number };
type PairRow = { member_id: string; aug: number; champ: number; n: number; w: number };
type Face = { id: string; nick: string; skin: number | null; main: number | null };

const entry = (r: { n: number; w: number }): DexEntry => ({ n: r.n, w: r.w ?? 0, first: 0, last: 0 });

async function faces(env: Env, ids: string[]): Promise<Map<string, Face>> {
  if (!ids.length) return new Map();
  const { results } = await env.DB.prepare(`SELECT m.id, m.nick, ${FACE('m')} FROM members m WHERE m.id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<Face>();
  return new Map(results.map((f) => [f.id, f]));
}

const view = (m: Mastery, e: DexEntry) => ({ master: m.master, done: m.done, total: m.total, n: e.n, w: e.w, special: m.special.tried.length > 0 });
const order = (a: ReturnType<typeof view>, b: ReturnType<typeof view>) => Number(b.master) - Number(a.master) || b.done - a.done || b.w - a.w || b.n - a.n;

/** 한 챔피언의 장인과 장인의 길 순위 */
export async function championArtisans(env: Env, champ: number) {
  const [rows, pairs] = await env.DB.batch([
    env.DB.prepare('SELECT member_id, COUNT(*) AS n, SUM(win) AS w FROM participants WHERE champion_id = ? GROUP BY member_id').bind(champ),
    env.DB.prepare('SELECT member_id, augment_id AS aug, champion_id AS champ, COUNT(*) AS n, SUM(win) AS w FROM participant_augments WHERE champion_id = ? GROUP BY member_id, augment_id').bind(champ),
  ]);
  const byMember = groupPairs(pairs.results as PairRow[]);
  const list = (rows.results as Row[]).map((r) => {
    const e = entry(r);
    return { id: r.member_id, ...view(champMastery(champ, e, byMember.get(r.member_id) ?? []), e) };
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

/** 랭킹: 챔피언 장인 / 증강 장인. 회원마다 마스터 수·이룬 목표 수·대표 마스터 */
export async function artisanRanking(env: Env) {
  const [champRows, augRows, pairs] = await env.DB.batch([
    env.DB.prepare('SELECT member_id, champion_id AS id, COUNT(*) AS n, SUM(win) AS w FROM participants GROUP BY member_id, champion_id'),
    env.DB.prepare('SELECT member_id, augment_id AS id, COUNT(*) AS n, SUM(win) AS w FROM participant_augments GROUP BY member_id, augment_id'),
    env.DB.prepare('SELECT member_id, augment_id AS aug, champion_id AS champ, COUNT(*) AS n, SUM(win) AS w FROM participant_augments GROUP BY member_id, augment_id, champion_id'),
  ]);
  const byMember = groupPairs(pairs.results as PairRow[]);
  const tally = (rows: Row[], calc: (id: number, e: DexEntry, p: DexPair[]) => Mastery) => {
    const acc = new Map<string, { masters: number[]; goals: number; caught: number; best: { id: number; done: number; w: number } | null }>();
    for (const r of rows) {
      const e = entry(r);
      const m = calc(r.id!, e, byMember.get(r.member_id) ?? []);
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
  const augments = tally(augRows.results as Row[], augMastery);
  const f = await faces(env, [...new Set([...champions, ...augments].map((x) => x.id))]);
  const put = <T extends { id: string }>(xs: T[]) => xs.map((x) => ({ ...x, nick: f.get(x.id)?.nick ?? '?', skin: f.get(x.id)?.skin ?? null, main: f.get(x.id)?.main ?? null }));
  return json({ champions: put(champions), augments: put(augments) });
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
