/**
 * 증강 주문의 계산식(mSpellCalculations, GameCalculation)을 풀어 설명 문구의 수치로 바꾼다 (v3.102).
 * 예전에는 DataValues 만 읽어 계산식 수치(레벨에 따라 25~75, 추가 공격력의 40% …)가 전부 "일정량"이 됐다.
 *
 * - 게임 중에만 정해지는 값(현재 중첩 수·마나 같은 자원)은 풀지 않는다 → null (지어내지 않는다)
 * - 능력치 코드(mStat)는 실제 데이터로 뜻을 확인한 것만 쓴다 (같은 계산식에 함께 나오는 설명 문구와 맞춰 봄, 2026-10-21).
 *   확인되지 않은 코드가 들어간 계산식은 통째로 풀지 않는다
 */

/** mStat → 이름. mStatFormula 2 = 추가 능력치 */
const STAT: Record<number, string> = {
  0: '주문력',
  1: '방어력',
  2: '공격력',
  6: '마법 저항력',
  7: '이동 속도',
  9: '치명타 피해량',
  11: '스킬 가속',
  12: '체력',
};

type Num = { lo: number; hi: number; lv?: boolean };
type Scale = { coef: number; stat: number; bonus: boolean };
type Val = { n: Num; scales: Scale[] };

const num = (lo: number, hi = lo, lv = false): Val => ({ n: { lo, hi, lv }, scales: [] });
const add = (a: Val, b: Val): Val => ({ n: { lo: a.n.lo + b.n.lo, hi: a.n.hi + b.n.hi, lv: a.n.lv || b.n.lv }, scales: [...a.scales, ...b.scales] });
const mul = (a: Val, b: Val): Val | null => {
  // 능력치 비율끼리 곱하는 식은 풀지 않는다 (상수 × 무엇 만)
  if (a.scales.length && b.scales.length) return null;
  const [k, v] = b.scales.length ? [a, b] : [b, a];
  if (k.n.lo !== k.n.hi && v.scales.length) return null;
  const f = k.n.lo;
  return { n: { lo: v.n.lo * k.n.lo, hi: v.n.hi * k.n.hi, lv: a.n.lv || b.n.lv }, scales: v.scales.map((s) => ({ ...s, coef: s.coef * f })) };
};

type Calcs = Record<string, any>;
type Values = Record<string, number[]>;

/** 게임 파일 안 이름이 해시로만 남은 경우: 소문자 이름의 FNV-1a 32비트 ('{%08x}') */
export const fnv = (name: string) => {
  let h = 0x811c9dc5;
  for (const ch of name.toLowerCase()) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return `{${h.toString(16).padStart(8, '0')}}`;
};
/** 이름 또는 그 해시로 찾기 */
const pick = <T>(obj: Record<string, T>, name: unknown): T | undefined => {
  const n = String(name);
  if (n in obj) return obj[n];
  const lo = n.toLowerCase();
  const k = Object.keys(obj).find((x) => x.toLowerCase() === lo) ?? (fnv(n) in obj ? fnv(n) : undefined);
  return k ? obj[k] : undefined;
};

/** 증강 레벨 값 (예전 fmtValue 와 같이 0번째는 빼고 1번째~끝) */
const dv = (values: Values, name: unknown): Num | null => {
  const v = values[String(name).toLowerCase()] ?? pick(values, name);
  if (!v) return null;
  const vs = v.length > 1 ? v.slice(1) : v;
  return { lo: Math.min(...vs), hi: Math.max(...vs) };
};

function part(p: any, values: Values, calcs: Calcs, depth: number): Val | null {
  if (!p || typeof p !== 'object' || depth > 8) return null;
  switch (p.__type) {
    case 'NumberCalculationPart': return num(p.mNumber ?? 0);
    case 'NamedDataValueCalculationPart': case '{2b25a73a}': {
      const d = dv(values, p.mDataValue ?? p.DataValue);
      return d ? num(d.lo, d.hi) : null;
    }
    case 'ByCharLevelInterpolationCalculationPart': return num(p.mStartValue ?? 0, p.mEndValue ?? 0, true);
    case '{ee18a47b}': {
      const a = dv(values, p.StartDataValue), b = dv(values, p.EndDataValue);
      return a && b ? num(a.lo, b.hi, true) : null;
    }
    case 'ByCharLevelBreakpointsCalculationPart': {
      const lo = p.mLevel1Value ?? 0;
      let hi = lo;
      for (const b of p.mBreakpoints ?? []) {
        hi += b.mAdditionalBonusAtThisLevel ?? 0;
        if (b.mBonusPerLevelAtAndAfter) hi += b.mBonusPerLevelAtAndAfter * (18 - (b.mLevel ?? 18) + 1);
      }
      return num(lo, hi, true);
    }
    case 'StatByCoefficientCalculationPart': case 'StatByNamedDataValueCalculationPart': {
      const stat = p.mStat ?? 0;
      if (!(stat in STAT)) return null;
      let coef: number | null = p.mCoefficient ?? null;
      if (p.__type === 'StatByNamedDataValueCalculationPart') { const d = dv(values, p.mDataValue); coef = d && d.lo === d.hi ? d.lo : null; }
      if (coef == null) return null;
      return { n: { lo: 0, hi: 0 }, scales: [{ coef, stat, bonus: p.mStatFormula === 2 }] };
    }
    case 'StatBySubPartCalculationPart': {
      const stat = p.mStat ?? 0;
      const sub = part(p.mSubpart, values, calcs, depth + 1);
      if (!(stat in STAT) || !sub || sub.scales.length || sub.n.lo !== sub.n.hi) return null;
      return { n: { lo: 0, hi: 0 }, scales: [{ coef: sub.n.lo, stat, bonus: p.mStatFormula === 2 }] };
    }
    case 'SumOfSubPartsCalculationPart': {
      let acc: Val | null = num(0);
      for (const s of p.mSubparts ?? []) { const v = part(s, values, calcs, depth + 1); if (!v) return null; acc = add(acc!, v); }
      return acc;
    }
    case 'ProductOfSubPartsCalculationPart': {
      const a = part(p.mPart1, values, calcs, depth + 1), b = part(p.mPart2, values, calcs, depth + 1);
      return a && b ? mul(a, b) : null;
    }
    case '{f3cbe7b2}': { // 다른 계산식을 그대로 가져온다
      const c = pick(calcs, p.mSpellCalculationKey);
      const r = c ? evalCalc(c, values, calcs, depth + 1) : null;
      return r && !r.pct ? r.v : null;
    }
    // 게임 중 중첩 수·자원 — 풀 수 없다
    default: return null;
  }
}

type Res = { v: Val; pct: boolean; prec?: number; ranged?: number };

function evalCalc(c: any, values: Values, calcs: Calcs, depth = 0): Res | null {
  if (!c || depth > 8) return null;
  if (c.__type === 'GameCalculationModified') {
    const base = pick(calcs, c.mModifiedGameCalculation);
    const r = base ? evalCalc(base, values, calcs, depth + 1) : null;
    const m = part(c.mMultiplier, values, calcs, depth + 1);
    if (!r || !m) return null;
    const v = mul(r.v, m);
    return v ? { ...r, v } : null;
  }
  if (c.__type === 'GameCalculationConditional') {
    // 근접/원거리처럼 갈리는 식 — 기본 식만 보인다
    const d = pick(calcs, c.mDefaultGameCalculation);
    return d ? evalCalc(d, values, calcs, depth + 1) : null;
  }
  if (c.__type !== 'GameCalculation' && c.__type !== '{e9a3c91d}') return null;
  let v: Val | null = num(0);
  for (const p of c.mFormulaParts ?? []) { const x = part(p, values, calcs, depth); if (!x) return null; v = add(v!, x); }
  if (c.mMultiplier) { const m = part(c.mMultiplier, values, calcs, depth); if (!m) return null; v = mul(v!, m); if (!v) return null; }
  const ranged = c.mRangedMultiplier ? part(c.mRangedMultiplier, values, calcs, depth) : null;
  return { v: v!, pct: Boolean(c.mDisplayAsPercent), prec: c.mPrecision, ranged: ranged && ranged.n.lo === ranged.n.hi && !ranged.scales.length ? ranged.n.lo : undefined };
}

const round = (x: number, prec?: number) => {
  const d = prec ?? (Math.abs(x) >= 10 ? 0 : Math.abs(x) >= 1 ? 1 : 2);
  const f = 10 ** Math.min(d, 3);
  return String(Math.round(x * f) / f);
};

function fmtNum(n: Num, pct: boolean, prec?: number, mulBy = 1): string {
  const k = (pct ? 100 : 1) * mulBy;
  const a = round(n.lo * k, prec), b = round(n.hi * k, prec);
  const s = a === b ? a : `${a}~${b}`;
  return `${s}${pct ? '%' : ''}${a !== b && n.lv ? '(레벨에 따라)' : ''}`;
}

const scaleTxt = (s: Scale) => `${s.bonus ? '추가 ' : s.stat === 12 ? '최대 ' : ''}${STAT[s.stat]}의 ${round(s.coef * 100)}%`;

/** 이름 → 계산식을 풀어 설명에 넣을 글. 못 풀면 null (그 자리는 예전처럼 처리된다) */
export function calcText(name: string, values: Values, calcs: Calcs): string | null {
  const c = pick(calcs, name);
  if (!c) return null;
  const r = evalCalc(c, values, calcs);
  if (!r) return null;
  const { n, scales } = r.v;
  // 비율(%)로 보이는 값에 능력치가 섞이면: 25%(+주문력 100당 5%)
  if (r.pct && scales.length) {
    // 계수가 아주 작으면(주문력 1당 0.05%) '100당', 아니면(치명타 피해량의 100%) '의'
    const sc = scales.map((s) => (s.coef < 0.01 ? `${s.bonus ? '추가 ' : ''}${STAT[s.stat]} 100당 ${round(s.coef * 100 * 100)}%` : scaleTxt(s)));
    return n.lo || n.hi ? `${fmtNum(n, true, r.prec)}(+${sc.join(' +')})` : `(${sc.join(' + ')})`;
  }
  const hasBase = n.lo !== 0 || n.hi !== 0;
  if (!scales.length) {
    const base = fmtNum(n, r.pct, r.prec);
    return r.ranged != null && r.ranged !== 1 ? `${base}(원거리 ${fmtNum(n, r.pct, r.prec, r.ranged)})` : base;
  }
  const sc = scales.map(scaleTxt);
  return hasBase ? `${fmtNum(n, false, r.prec)}(+${sc.join(' +')})` : `(${sc.join(' + ')})`;
}

/** 주문 하나의 계산식 모음 (추가 주문 것도 합친다, 이름이 겹치면 먼저 것) */
export function spellCalcs(bin: Record<string, any>, paths: (string | undefined)[]): Calcs {
  const out: Calcs = {};
  for (const p of paths) for (const [k, v] of Object.entries(bin[p ?? '']?.mSpell?.mSpellCalculations ?? {})) if (!(k in out)) out[k] = v;
  return out;
}
