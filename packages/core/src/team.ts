/**
 * 챔프 선택 팀 밸런스. 챔피언 성향은 게임 데이터(mayhem-champions.json)의 피해 유형·단단함·CC 를 쓴다.
 */
import type { ChampionProfile } from './synergy';

export type Comp = { ap: number; ad: number; front: number; cc: number; n: number };
export type Need = 'AD' | 'AP' | '앞라인' | 'CC';

/** AP·AD 수 (혼합은 반씩), 앞라인 (단단함 3=1, 2=0.5), CC 합 */
export function comp(list: ChampionProfile[]): Comp {
  const c: Comp = { ap: 0, ad: 0, front: 0, cc: 0, n: list.length };
  for (const t of list) {
    if (t.damage === 'AP') c.ap++;
    else if (t.damage === 'AD') c.ad++;
    else if (t.damage === 'MIX') { c.ap += 0.5; c.ad += 0.5; }
    c.front += t.style.durability >= 3 ? 1 : t.style.durability === 2 ? 0.5 : 0;
    c.cc += t.style.cc;
  }
  return c;
}

export const ccWord = (c: Comp) => { const a = c.n ? c.cc / c.n : 0; return a < 1.8 ? '낮음' : a < 2.3 ? '보통' : '높음'; };

/** 팀원 4명 기준으로 부족한 것 */
export function needsOf(c: Comp): Need[] {
  const n: Need[] = [];
  if (c.ad < 1.5) n.push('AD');
  if (c.ap < 1.5) n.push('AP');
  if (c.front < 1) n.push('앞라인');
  if (c.n && c.cc / c.n < 2) n.push('CC');
  return n;
}

export type TeamFit = { fills: Need[]; warn: string | null; score: number };

/** 후보 하나가 채우는 것과 경고 */
export function teamFit(t: ChampionProfile | undefined, needs: Need[], base: ChampionProfile[]): TeamFit {
  if (!t) return { fills: [], warn: null, score: -1 };
  const fills = needs.filter((x) => (x === 'AD' ? t.damage === 'AD' || t.damage === 'MIX' : x === 'AP' ? t.damage === 'AP' || t.damage === 'MIX' : x === '앞라인' ? t.style.durability >= 3 : t.style.cc >= 3));
  const after = comp([...base, t]);
  const warn = after.n >= 5 && after.ap === 0 ? 'AD만 5명' : after.n >= 5 && after.ad === 0 ? 'AP만 5명' : null;
  return { fills, warn, score: fills.length * 10 - (warn ? 6 : 0) + t.style.damage };
}

export type Verdict = { grade: 'gold' | 'good' | 'fair' | 'poor'; label: string };

/** 5명(나 포함) 팀 밸런스 평가. 부족한 게 없으면 좋음, 고루 넉넉하면 황금 밸런스 */
export function verdictOf(c: Comp, needs: Need[]): Verdict {
  if (!needs.length) {
    const gold = c.ap >= 2 && c.ad >= 2 && c.front >= 1.5 && c.n > 0 && c.cc / c.n >= 2.3;
    return gold ? { grade: 'gold', label: '황금 밸런스' } : { grade: 'good', label: '밸런스 좋음' };
  }
  return needs.length === 1 ? { grade: 'fair', label: `조금 아쉬움 · ${needs[0]} 부족` } : { grade: 'poor', label: `불균형 · ${needs.join('·')} 부족` };
}
