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

export type Plan = { tone: 'ok' | 'warn' | 'info'; title: string; text: string };

/**
 * 이번 판 작전 (챔프 선택, 우리 팀 5명 기준). 규칙으로 만든 짧은 조언 최대 3개 — 부족한 것부터, 그다음 강점.
 * 고르는 건 사용자다. 숫자 기준은 needsOf 와 같다.
 */
export function planOf(c: Comp, needs: Need[]): Plan[] {
  const out: Plan[] = [];
  const avg = c.n ? c.cc / c.n : 0;
  if (needs.includes('AD')) out.push({ tone: 'warn', title: '마법 피해에 쏠렸어요', text: '상대가 마법 저항만 쌓아도 피해가 줄어요. 마법 관통 아이템을 일찍, 증강은 고정 피해·관통 쪽을 눈여겨보세요.' });
  if (needs.includes('AP')) out.push({ tone: 'warn', title: '물리 피해에 쏠렸어요', text: '상대가 방어력만 쌓아도 피해가 줄어요. 방어구 관통을 일찍 챙기고, 마법 피해를 섞어 주는 증강도 좋아요.' });
  if (needs.includes('앞라인')) out.push({ tone: 'warn', title: '앞에서 버틸 사람이 없어요', text: '먼저 들어가지 말고 견제로 체력을 깎은 뒤 싸우세요. 체력·방어 증강이 보이면 한 명은 챙기는 게 좋아요.' });
  if (needs.includes('CC')) out.push({ tone: 'warn', title: '붙잡는 기술이 적어요', text: '상대가 먼저 들어오게 두고 받아치는 편이 유리해요. 둔화·속박을 주는 증강이나 아이템이 도움이 돼요.' });
  if (c.front >= 2) out.push({ tone: 'ok', title: '앞라인이 두꺼워요', text: '앞라인이 버텨 주니 한타를 먼저 열어도 좋아요. 뒤에서는 피해에 집중하세요.' });
  if (avg >= 2.3) out.push({ tone: 'ok', title: '군중 제어가 넉넉해요', text: '한 명을 묶어 다 같이 잡는 싸움이 강해요. 군중 제어가 들어간 순간 몰아치세요.' });
  if (!needs.length && out.length === 0) out.push({ tone: 'ok', title: '고르게 짜였어요', text: '약점이 뚜렷하지 않아요. 내 챔프에 잘 맞는 증강부터 고르면 됩니다.' });
  return out.slice(0, 3);
}
