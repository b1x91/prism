/**
 * 인사이트권 리포트 (CLAUDE.md v3.99). 내 기록을 규칙으로 깊게 읽는다 (AI 아님).
 * 서버가 이용권을 확인한 뒤에만 이 계산을 돌려 결과를 보낸다 — 이용권이 없으면 데이터가 화면에 오지 않는다.
 * 판이 적은 묶음은 내 평균 쪽으로 당겨서(PRIOR판만큼) 튀지 않게 하고, 차이가 작으면 말하지 않는다. 숫자는 INSIGHT 한 곳.
 */
import { AUGMENT, CHAMPIONS } from './data';
import { tierFor } from './mastery';
import { TAG_KO } from './profile';
import type { Rarity } from './synergy';

export const INSIGHT = {
  /** 내 평균 쪽으로 당기는 판수 */
  prior: 6,
  /** 이만큼 차이 나야 말한다 (%p) */
  gap: 0.06,
  /** 증강·조합 하나를 말하려면 */
  minAug: 3,
  /** 시간대·요일·묶음 하나를 말하려면 */
  minBand: 5,
  /** 파트너로 보려면 같은 팀으로 */
  minPartner: 5,
  /** 이어서 한 판으로 보는 간격 */
  session: 50 * 60_000,
} as const;

type NW = { n: number; w: number };
const rate = (x: NW) => (x.n ? x.w / x.n : 0);
/** 내 평균 쪽으로 당긴 승률 */
const shrunk = (x: NW, base: number) => (x.w + base * INSIGHT.prior) / (x.n + INSIGHT.prior);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const pp = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%p`;
const add = (m: Map<string | number, NW>, k: string | number, w: boolean) => { const x = m.get(k) ?? { n: 0, w: 0 }; x.n++; if (w) x.w++; m.set(k, x); };

// ───────── 증강 습관 정밀 리포트 ─────────

export type AugRow = { c: number; w: number; augs: number[] };
export type AugReport = {
  base: number; games: number; picks: number;
  rarity: { r: Rarity; n: number; w: number }[];
  /** 챔프에 맞는(S·A) 증강을 골랐을 때 vs 아닐 때 (고른 증강 수 기준) */
  fit: { good: NW; other: NW };
  best: { id: number; n: number; w: number }[];
  worst: { id: number; n: number; w: number }[];
  tags: { key: string; label: string; n: number; w: number; delta: number }[];
  combos: { champ: number; aug: number; n: number; w: number }[];
  lines: string[];
};
export function augReport(rows: AugRow[]): AugReport {
  const withAug = rows.filter((r) => r.augs.length);
  const all: NW = { n: rows.length, w: rows.filter((r) => r.w).length };
  const base = rate(all) || 0.5;
  const byAug = new Map<string | number, NW>(), byRar = new Map<string | number, NW>(), byTag = new Map<string | number, NW>(), byCombo = new Map<string | number, NW>();
  const good: NW = { n: 0, w: 0 }, other: NW = { n: 0, w: 0 };
  let picks = 0;
  for (const r of withAug) {
    for (const a of new Set(r.augs)) {
      const x = AUGMENT[a]; if (!x) continue;
      picks++;
      add(byAug, a, Boolean(r.w)); add(byRar, x.rarity, Boolean(r.w)); add(byCombo, `${r.c}:${a}`, Boolean(r.w));
      for (const t of x.tags) if (TAG_KO[t]) add(byTag, t, Boolean(r.w));
      const t = tierFor(r.c, a);
      const g = t === 'S' || t === 'A' ? good : other; g.n++; if (r.w) g.w++;
    }
  }
  // 기준: 증강을 고른 판들의 승률 (고른 수만큼) — 막대·성향을 같은 눈금으로 본다
  const pickAll = [...byRar.values()].reduce((a, x) => ({ n: a.n + x.n, w: a.w + x.w }), { n: 0, w: 0 });
  const pb = pickAll.n ? pickAll.w / pickAll.n : base;
  const augList = [...byAug].filter(([, v]) => v.n >= INSIGHT.minAug).map(([id, v]) => ({ id: Number(id), ...v, s: shrunk(v, pb) }));
  const best = [...augList].sort((a, b) => b.s - a.s || b.n - a.n).slice(0, 5).map(({ s: _s, ...x }) => x);
  const worst = [...augList].filter((x) => !best.some((b) => b.id === x.id)).sort((a, b) => a.s - b.s || b.n - a.n).slice(0, 3).map(({ s: _s, ...x }) => x);
  const tags = [...byTag].filter(([, v]) => v.n >= INSIGHT.minBand).map(([key, v]) => ({ key: String(key), label: TAG_KO[String(key)], ...v, delta: shrunk(v, pb) - pb }))
    .filter((t) => Math.abs(t.delta) >= INSIGHT.gap / 2).sort((a, b) => b.delta - a.delta);
  const combos = [...byCombo].filter(([, v]) => v.n >= 2).map(([k, v]) => { const [c, a] = String(k).split(':').map(Number); return { champ: c, aug: a, ...v, s: shrunk(v, base) }; })
    .sort((a, b) => b.s - a.s || b.n - a.n).slice(0, 3).map(({ s: _s, ...x }) => x);
  const rarity = (['silver', 'gold', 'prismatic'] as Rarity[]).map((r) => ({ r, ...(byRar.get(r) ?? { n: 0, w: 0 }) }));
  const lines: string[] = [];
  if (good.n >= INSIGHT.minAug * 3 && other.n >= INSIGHT.minAug * 3) {
    const d = rate(good) - rate(other);
    if (Math.abs(d) >= INSIGHT.gap) lines.push(d > 0
      ? `챔프에 맞는(S·A) 증강을 골랐을 때 승률이 ${pct(rate(good))}로, 아닐 때(${pct(rate(other))})보다 ${pp(d)} 높아요. 3개 비교에서 티어를 먼저 보세요.`
      : `맞는(S·A) 증강보다 다른 증강을 골랐을 때 더 잘 이겨요 (${pct(rate(other))} vs ${pct(rate(good))}). 내 손에 익은 증강을 믿어도 좋아요.`);
  }
  const hi = tags[0], lo = tags[tags.length - 1];
  if (hi && hi.delta >= INSIGHT.gap) lines.push(`'${hi.label}' 성향 증강을 고른 판이 내 평균보다 ${pp(hi.delta)} — 가장 잘 맞는 성향이에요.`);
  if (lo && lo !== hi && lo.delta <= -INSIGHT.gap) lines.push(`'${lo.label}' 성향은 ${pp(lo.delta)} — 고를 때 한 번 더 생각해 보세요.`);
  if (combos[0] && rate(combos[0]) >= pb + INSIGHT.gap) lines.push(`${CHAMPIONS[combos[0].champ]?.name ?? '챔프'} + ${AUGMENT[combos[0].aug]?.name ?? '증강'} 조합이 ${combos[0].n}판 ${combos[0].w}승으로 가장 좋았어요.`);
  return { base: pb, games: rows.length, picks, rarity, fit: { good, other }, best, worst, tags: [...tags.slice(0, 3), ...tags.slice(3).slice(-2)], combos, lines };
}

// ───────── 나의 골든타임 ─────────

export type TimeRow = { w: number; t: number };
export type GoldenReport = {
  base: number; games: number;
  bands: { key: string; label: string; n: number; w: number }[];
  days: { d: number; label: string; n: number; w: number }[];
  /** 이어서 한 판의 몇 번째 판인지 (5 = 5판째 이상) */
  seq: { k: number; n: number; w: number }[];
  /** 이 판째부터 흔들린다 (없으면 null) */
  dropAt: number | null;
  lines: string[];
};
const HOUR = 3_600_000;
export const BANDS: { key: string; label: string; from: number; to: number }[] = [
  { key: 'day', label: '낮 12~18시', from: 12, to: 18 },
  { key: 'eve', label: '저녁 18~21시', from: 18, to: 21 },
  { key: 'night', label: '밤 21~24시', from: 21, to: 24 },
  { key: 'late', label: '새벽 0~6시', from: 0, to: 6 },
  { key: 'morn', label: '오전 6~12시', from: 6, to: 12 },
];
const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
export function goldenReport(rows: TimeRow[]): GoldenReport {
  const all: NW = { n: rows.length, w: rows.filter((r) => r.w).length };
  const base = rate(all) || 0.5;
  const band = new Map<string | number, NW>(), day = new Map<string | number, NW>(), seq = new Map<string | number, NW>();
  const sorted = [...rows].sort((a, b) => a.t - b.t);
  let k = 0;
  sorted.forEach((r, i) => {
    const kst = new Date(r.t + 9 * HOUR);
    const h = kst.getUTCHours();
    const b = BANDS.find((x) => h >= x.from && h < x.to)!;
    add(band, b.key, Boolean(r.w)); add(day, kst.getUTCDay(), Boolean(r.w));
    k = i > 0 && r.t - sorted[i - 1].t <= INSIGHT.session ? k + 1 : 1;
    add(seq, Math.min(k, 5), Boolean(r.w));
  });
  const bands = BANDS.map((b) => ({ key: b.key, label: b.label, ...(band.get(b.key) ?? { n: 0, w: 0 }) }));
  const days = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ d, label: DAY_KO[d], ...(day.get(d) ?? { n: 0, w: 0 }) }));
  const sq = [1, 2, 3, 4, 5].map((x) => ({ k: x, ...(seq.get(x) ?? { n: 0, w: 0 }) }));
  // 흔들리는 판째: 앞 판들(1..k-1)보다 k판째 이후가 gap 이상 낮아지는 가장 이른 k
  let dropAt: number | null = null;
  for (let x = 2; x <= 5; x++) {
    const before = sq.filter((s) => s.k < x).reduce((a, s) => ({ n: a.n + s.n, w: a.w + s.w }), { n: 0, w: 0 });
    const after = sq.filter((s) => s.k >= x).reduce((a, s) => ({ n: a.n + s.n, w: a.w + s.w }), { n: 0, w: 0 });
    if (before.n >= INSIGHT.minBand && after.n >= INSIGHT.minBand && rate(before) - shrunk(after, base) >= INSIGHT.gap) { dropAt = x; break; }
  }
  const lines: string[] = [];
  const okBands = bands.filter((b) => b.n >= INSIGHT.minBand).map((b) => ({ ...b, s: shrunk(b, base) })).sort((a, b) => b.s - a.s);
  if (okBands.length >= 2 && okBands[0].s - okBands[okBands.length - 1].s >= INSIGHT.gap) {
    lines.push(`가장 잘 이기는 시간은 ${okBands[0].label} (${okBands[0].n}판 ${pct(rate(okBands[0]))}). ${okBands[okBands.length - 1].label}에는 ${pct(rate(okBands[okBands.length - 1]))}.`);
  }
  const okDays = days.filter((d) => d.n >= INSIGHT.minBand).map((d) => ({ ...d, s: shrunk(d, base) })).sort((a, b) => b.s - a.s);
  if (okDays[0] && okDays[0].s - base >= INSIGHT.gap / 2) lines.push(`${okDays[0].label}요일에 가장 잘 이겨요 (${okDays[0].n}판 ${pct(rate(okDays[0]))}).`);
  if (dropAt) lines.push(`이어서 할 때 ${dropAt}판째부터 승률이 떨어져요. ${dropAt - 1}판 하고 한 번 쉬어 가면 어떨까요?`);
  else if (sq.filter((s) => s.k >= 3).reduce((a, s) => a + s.n, 0) >= INSIGHT.minBand) lines.push('길게 이어서 해도 승률이 흔들리지 않아요. 체력이 좋은 편이에요.');
  return { base, games: rows.length, bands, days, seq: sq, dropAt, lines };
}

// ───────── 베스트 파트너 TOP 3 ─────────

/** 같은 팀으로 함께한 판 하나: 그 멤버 · 승 · 내 챔프·KDA · 그 멤버 챔프 */
export type PartnerRow = { id: string; w: number; mine: number; theirs: number; k: number; d: number; a: number };
export type PartnerPick = {
  id: string; n: number; w: number; diff: number;
  /** 함께할 때 내 KDA vs 평소 */
  kda: number; kdaBase: number;
  combo: { mine: number; theirs: number; n: number; w: number } | null;
};
export type PartnerReport = { base: number; games: number; list: PartnerPick[]; lines: string[] };
const kdaOf = (k: number, d: number, a: number) => (k + a) / Math.max(1, d);
export function partnerReport(rows: PartnerRow[], mine: { w: number; k: number; d: number; a: number }[], nickOf: (id: string) => string): PartnerReport {
  const all: NW = { n: mine.length, w: mine.filter((r) => r.w).length };
  const base = rate(all) || 0.5;
  const sum = mine.reduce((s, r) => ({ k: s.k + r.k, d: s.d + r.d, a: s.a + r.a }), { k: 0, d: 0, a: 0 });
  const kdaBase = kdaOf(sum.k, sum.d, sum.a);
  const by = new Map<string, PartnerRow[]>();
  for (const r of rows) by.set(r.id, [...(by.get(r.id) ?? []), r]);
  const list = [...by].filter(([, rs]) => rs.length >= INSIGHT.minPartner).map(([id, rs]) => {
    const nw = { n: rs.length, w: rs.filter((r) => r.w).length };
    const s = rs.reduce((a, r) => ({ k: a.k + r.k, d: a.d + r.d, a: a.a + r.a }), { k: 0, d: 0, a: 0 });
    const cm = new Map<string | number, NW>();
    for (const r of rs) add(cm, `${r.mine}:${r.theirs}`, Boolean(r.w));
    const best = [...cm].filter(([, v]) => v.n >= 2).sort((a, b) => rate(b[1]) - rate(a[1]) || b[1].n - a[1].n)[0];
    const combo = best ? (() => { const [m, t] = String(best[0]).split(':').map(Number); return { mine: m, theirs: t, ...best[1] }; })() : null;
    return { id, ...nw, diff: shrunk(nw, base) - base, kda: kdaOf(s.k, s.d, s.a), kdaBase, combo };
  }).sort((a, b) => b.diff - a.diff || b.n - a.n).slice(0, 3);
  const lines: string[] = [];
  const top = list[0];
  if (top && top.diff >= INSIGHT.gap / 2) lines.push(`${nickOf(top.id)}님과 함께할 때 승률이 ${pct(rate(top))} — 내 평균보다 ${pp(rate(top) - base)}.`);
  else if (top) lines.push(`아직 내 평균(${pct(base)})보다 더 잘 이기는 짝은 없어요. 그중 ${nickOf(top.id)}님과 가장 잘 맞아요 (${top.n}판 ${pct(rate(top))}). 함께한 판이 쌓이면 달라질 수 있어요.`);
  const kd = list.find((x) => x.kda - x.kdaBase >= 0.5);
  if (kd) lines.push(`${nickOf(kd.id)}님과 함께면 내 KDA가 ${kd.kda.toFixed(2)} (평소 ${kd.kdaBase.toFixed(2)}) — 서로 잘 받쳐 줘요.`);
  if (top?.combo && top.combo.w >= 2) lines.push(`둘이 ${CHAMPIONS[top.combo.mine]?.name ?? '챔프'} + ${CHAMPIONS[top.combo.theirs]?.name ?? '챔프'}일 때 ${top.combo.n}판 ${top.combo.w}승.`);
  if (!list.length) lines.push(`멤버와 같은 팀으로 ${INSIGHT.minPartner}판 이상 함께하면 파트너가 보여요.`);
  return { base, games: mine.length, list, lines };
}
