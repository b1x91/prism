/**
 * 앱 홈 '오늘의 아이템' (v3.166): 날마다 하나를 골라 도감 설명과 함께
 * 최근 30일 Prism 멤버 판에서 얼마나 고르는지(판수 대비 픽률)·그 판의 승률·쓰는 멤버 수·많이 쓴 챔프를 보낸다.
 * 회원 기록(participants 의 최종 아이템)으로만 센다 — 외부 통계는 쓰지 않는다 (v3.2-3). 회원 전용.
 */
import { ITEM, ITEM_DEX, baseItem } from '../../packages/core/src/data.js';
import { json, type Env, type Member } from './util.js';

const DAY = 86_400_000;
const WINDOW = 30 * DAY;
/** 고르는 후보: 멤버가 최근 30일에 이만큼 이상 산 아이템 (없으면 도감 전체) */
const MIN_PICKS = 3;

type Acc = { n: number; w: number; members: Set<string>; champs: Map<number, number> };

/** KST 날짜 번호 — 같은 날엔 같은 아이템 */
const kstDay = (t: number) => Math.floor((t + 9 * 3600_000) / DAY);
function hash(n: number) { let x = n * 2654435761 >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return x >>> 0; }

type Row = { m: string; c: number; w: number; it: string };
const load = (env: Env, since: number) => env.DB.prepare(
  `SELECT member_id AS m, champion_id AS c, win AS w, items AS it FROM participants WHERE played_at > ? AND items IS NOT NULL ORDER BY played_at DESC LIMIT 20000`,
).bind(since).all<Row>().then((r) => r.results).catch(() => [] as Row[]);

export async function itemOfDay(env: Env, _me: Member, url: URL) {
  const now = Date.now();
  // 판이 적으면(30일 30판 미만) 90일로 넓힌다 — 작은 모임에서 숫자가 튀지 않게
  let days = 30;
  let rows = await load(env, now - WINDOW);
  if (rows.length < 30) { days = 90; rows = await load(env, now - 90 * DAY); }
  const dex = new Set(ITEM_DEX);
  const acc = new Map<number, Acc>();
  const players = new Set<string>();
  let games = 0;
  for (const r of rows) {
    let list: number[] = [];
    try { list = JSON.parse(r.it); } catch { continue; }
    if (!Array.isArray(list)) continue;
    games++; players.add(r.m);
    for (const id of new Set(list.map((x) => baseItem(Number(x))))) {
      if (!dex.has(id)) continue;
      const a = acc.get(id) ?? { n: 0, w: 0, members: new Set(), champs: new Map() };
      a.n++; a.w += r.w ? 1 : 0; a.members.add(r.m); a.champs.set(r.c, (a.champs.get(r.c) ?? 0) + 1);
      acc.set(id, a);
    }
  }
  // 특정 아이템을 보고 싶으면 ?id= (도감과 같은 대상만)
  const want = Number(url.searchParams.get('id'));
  let id: number;
  if (dex.has(want)) id = want;
  else {
    const pool = [...acc].filter(([, a]) => a.n >= MIN_PICKS).map(([k]) => k).sort((a, b) => a - b);
    const list = pool.length ? pool : [...ITEM_DEX].sort((a, b) => a - b);
    id = list[hash(kstDay(now)) % list.length];
  }
  const a = acc.get(id);
  // 모든 도감 아이템 중 픽률 순위 (산 판 수 기준)
  const rank = a ? [...acc.values()].filter((x) => x.n > a.n).length + 1 : null;
  return json({
    id, name: ITEM[id]?.name ?? null, days,
    games, players: players.size,
    picks: a?.n ?? 0, wins: a?.w ?? 0, members: a?.members.size ?? 0,
    rank, ranked: acc.size,
    champs: a ? [...a.champs].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([c, n]) => ({ c, n })) : [],
  });
}
