/**
 * 매일 밤 디스코드 공지 '오늘 밤 증바람?'의 오늘 증강 (CLAUDE.md v3.69). 순수 함수 — 서버가 모임 기록을 넣어 부른다.
 *  - 날마다 테마를 무작위로 고른다 (최근 3일에 나온 테마는 빼고). 같은 날에는 늘 같은 결과.
 *  - 증강 3개 + 증강마다 가장 잘 맞는 챔프. 근거는 어울림(태그 × 챔프 특성)과 모임 실전 기록뿐 — 증강의 세기를 단정하지 않는다.
 *  - 최근 14일에 나온 증강은 다시 고르지 않는다 (주간 결산은 예외).
 * 숫자는 TONIGHT 한 곳.
 */
import { ACTIVE_AUGMENTS, AUGMENT, CHAMPIONS, inGame } from './data';
import { bestChampions, sTierAugments, tierFor } from './mastery';
import { relatedAugments, type FitTier, type Rarity } from './synergy';
import { challengeRole, CHALLENGE_ROLE_KO, type ChallengeRole } from './challenges';
import { josa } from './josa';

export const TONIGHT = {
  champsPerAug: 5,     // 증강마다 보여 줄 챔프 수
  statMin: 8,          // 모임 기록을 붙이는 최소 고른 수
  hiddenMin: 3,        // 숨은 보석: 이만큼은 골랐어야
  hiddenRate: 0.6,     // 숨은 보석: 이 승률 이상
  weeklyMin: 15,       // 주간 결산: 이번 주 고른 증강 수
  unknownMin: 30,      // 미지의 증강: 모임이 고른 증강 수 (기록이 쌓였을 때만)
  roleMin: 20,         // 덜 한 역할: 최근 모임 판 수
  avoidThemes: 3,      // 최근 며칠의 테마는 다시 안 고른다
};

export type AugStat = { n: number; w: number };
export type TonightInput = {
  day: string;                                  // KST 날짜 YYYY-MM-DD
  stats: Record<number, AugStat>;               // 모임이 고른 증강 (전체 기록)
  week: Record<number, AugStat>;                // 이번 주
  roleGames: Partial<Record<ChallengeRole, number>>; // 최근 4주 회원 판의 역할
  recentThemes: string[];                       // 최근 공지 테마 (최근 것 먼저)
  recentAugs: number[];                         // 최근 14일에 나온 증강
};
export type TonightPick = { aug: number; champs: number[]; tier: FitTier; stat: AugStat | null };
export type Tonight = { theme: ThemeKey; name: string; sub: string; picks: TonightPick[]; together?: number[]; champ?: number; role?: ChallengeRole };

export const RARITY_KO: Record<Rarity, string> = { silver: '실버', gold: '골드', prismatic: '프리즘' };

// ───────── 날짜로 정해지는 무작위 ─────────
function rngOf(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
type Rng = ReturnType<typeof rngOf>;
const shuffle = <T,>(r: Rng, xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = <T,>(r: Rng, xs: T[]) => xs[Math.floor(r() * xs.length)];

// ───────── 증강 한 칸 ─────────
function pickOf(r: Rng, aug: number, s: TonightInput, only?: (c: number) => boolean, first?: number): TonightPick {
  const best = bestChampions(aug);
  let ids = best.ids.filter((c) => !only || only(c));
  ids = shuffle(r, ids).filter((c) => c !== first);
  const st = s.stats[aug];
  return { aug, champs: [...(first ? [first] : []), ...ids].slice(0, TONIGHT.champsPerAug), tier: best.tier, stat: st && st.n >= TONIGHT.statMin ? st : null };
}
const pool = (s: TonightInput, f: (a: (typeof ACTIVE_AUGMENTS)[number]) => boolean = () => true) => {
  const recent = new Set(s.recentAugs);
  return ACTIVE_AUGMENTS.filter((a) => !recent.has(a.id) && f(a));
};
const wr = (x: AugStat) => (x.w + 1) / (x.n + 2);

// ───────── 테마 ─────────
type Theme = { name: string; subs: string[]; make: (r: Rng, s: TonightInput) => Omit<Tonight, 'theme' | 'name' | 'sub'> | null; sub?: (t: Omit<Tonight, 'theme' | 'name' | 'sub'>) => string };

const ROLES: ChallengeRole[] = ['marksman', 'mage', 'assassin', 'fighter', 'tank', 'support'];
/** 그 역할 챔프들에게 S티어인 증강 (S 챔프가 많은 순, 위쪽에서 무작위) */
function roleAugs(r: Rng, s: TonightInput, role: ChallengeRole) {
  const isRole = (c: number) => challengeRole(c) === role;
  const champs = Object.keys(CHAMPIONS).map(Number).filter(isRole);
  const count = new Map<number, number>();
  for (const c of champs) for (const a of sTierAugments(c)) count.set(a, (count.get(a) ?? 0) + 1);
  const recent = new Set(s.recentAugs);
  const top = [...count].filter(([a, n]) => n >= 3 && !recent.has(a)).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([a]) => a);
  if (top.length < 3) return null;
  return { picks: shuffle(r, top).slice(0, 3).map((a) => pickOf(r, a, s, isRole)) };
}

export const THEMES = {
  tri: {
    name: '오늘의 증강 3',
    subs: ['실버 · 골드 · 프리즘에서 하나씩', '등급마다 하나씩 골라 봤어요'],
    make: (r, s) => {
      const picks = (['silver', 'gold', 'prismatic'] as Rarity[]).map((rar) => pool(s, (a) => a.rarity === rar));
      if (picks.some((p) => !p.length)) return null;
      return { picks: picks.map((p) => pickOf(r, pick(r, p).id, s)) };
    },
  },
  prism: {
    name: '프리즘의 밤',
    subs: ['오늘은 프리즘 증강만', '프리즘이 뜨면 노려 볼 셋'],
    make: (r, s) => {
      const p = pool(s, (a) => a.rarity === 'prismatic');
      return p.length >= 3 ? { picks: shuffle(r, p).slice(0, 3).map((a) => pickOf(r, a.id, s)) } : null;
    },
  },
  gamble: {
    name: '한 방 노리기',
    subs: ['운이 따르면 판이 뒤집히는 증강', '오늘은 과감하게'],
    make: (r, s) => {
      const p = pool(s, (a) => a.tags.includes('gamble') || a.tags.includes('burst'));
      return p.length >= 3 ? { picks: shuffle(r, p).slice(0, 3).map((a) => pickOf(r, a.id, s)) } : null;
    },
  },
  hidden: {
    name: '숨은 보석',
    subs: ['모임에서 많이 고르진 않았지만 잘 이긴 증강', '아는 사람만 아는 증강'],
    make: (r, s) => {
      const recent = new Set(s.recentAugs);
      const ns = Object.values(s.stats).map((x) => x.n).sort((a, b) => a - b);
      const median = ns[Math.floor(ns.length / 2)] ?? 0;
      const c = Object.entries(s.stats).map(([id, x]) => [Number(id), x] as const)
        .filter(([id, x]) => AUGMENT[id] && inGame(AUGMENT[id]) && !recent.has(id) && x.n >= TONIGHT.hiddenMin && x.n <= Math.max(median, TONIGHT.hiddenMin + 2) && x.w / x.n >= TONIGHT.hiddenRate)
        .sort((a, b) => wr(b[1]) - wr(a[1])).slice(0, 8);
      if (c.length < 3) return null;
      // 숨은 보석은 판이 적어도 모임 기록을 붙인다 (그게 고른 이유라서)
      return { picks: shuffle(r, c).slice(0, 3).map(([id, x]) => ({ ...pickOf(r, id, s), stat: x })) };
    },
  },
  role: {
    name: '역할의 밤',
    subs: [],
    make: (r, s) => { const role = pick(r, ROLES); const t = roleAugs(r, s, role); return t && { ...t, role }; },
    sub: (t) => `오늘은 ${josa(CHALLENGE_ROLE_KO[t.role!], '으로/로')} 노려 볼 증강`,
  },
  underdog: {
    name: '덜 한 역할로',
    subs: [],
    make: (r, s) => {
      const total = Object.values(s.roleGames).reduce((a, b) => a + (b ?? 0), 0);
      if (total < TONIGHT.roleMin) return null;
      const role = [...ROLES].sort((a, b) => (s.roleGames[a] ?? 0) - (s.roleGames[b] ?? 0))[0];
      const t = roleAugs(r, s, role);
      return t && { ...t, role };
    },
    sub: (t) => `최근 모임에서 가장 덜 한 역할, ${CHALLENGE_ROLE_KO[t.role!]}`,
  },
  combo: {
    name: '같이 노리는 증강',
    subs: ['방향이 같아서 함께 고르면 좋은 셋', '하나를 골랐다면 다음은 이것'],
    make: (r, s) => {
      for (const a of shuffle(r, pool(s, (x) => !x.ability))) {
        const rel = relatedAugments(a, ACTIVE_AUGMENTS, 6).filter((x) => !s.recentAugs.includes(x.id));
        if (rel.length < 2) continue;
        const ids = [a.id, ...shuffle(r, rel).slice(0, 2).map((x) => x.id)];
        // 셋 모두 S·A 인 챔프
        const together = Object.keys(CHAMPIONS).map(Number)
          .filter((c) => ids.every((id) => { const t = tierFor(c, id); return t === 'S' || t === 'A'; }));
        return { picks: ids.map((id) => pickOf(r, id, s)), together: shuffle(r, together).slice(0, TONIGHT.champsPerAug) };
      }
      return null;
    },
  },
  champ: {
    name: '오늘의 챔프',
    subs: [],
    make: (r, s) => {
      const recent = new Set(s.recentAugs);
      for (const c of shuffle(r, Object.keys(CHAMPIONS).map(Number))) {
        const ss = sTierAugments(c).filter((a) => !recent.has(a));
        const by = (['silver', 'gold', 'prismatic'] as Rarity[]).map((rar) => ss.filter((a) => AUGMENT[a].rarity === rar));
        if (by.some((x) => !x.length)) continue;
        return { champ: c, picks: by.map((x) => pickOf(r, pick(r, x), s, undefined, c)) };
      }
      return null;
    },
    sub: (t) => `${josa(CHAMPIONS[t.champ!].name, '이/가')} 나오면 등급마다 노려 볼 증강`,
  },
  weekly: {
    name: '이번 주 모임 픽',
    subs: ['이번 주 우리가 고른 증강'],
    make: (r, s) => {
      const w = Object.entries(s.week).map(([id, x]) => [Number(id), x] as const).filter(([id]) => AUGMENT[id] && inGame(AUGMENT[id]));
      if (w.reduce((a, [, x]) => a + x.n, 0) < TONIGHT.weeklyMin) return null;
      const most = [...w].sort((a, b) => b[1].n - a[1].n)[0];
      const won = [...w].filter(([id]) => id !== most[0]).sort((a, b) => b[1].w - a[1].w || b[1].n - a[1].n)[0];
      const rest = w.filter(([id, x]) => id !== most[0] && id !== won?.[0] && x.n >= 2).sort((a, b) => wr(b[1]) - wr(a[1])).slice(0, 5);
      const ids = [most, won, rest.length ? pick(r, rest) : undefined].filter(Boolean) as (typeof most)[];
      if (ids.length < 3) return null;
      return { picks: ids.map(([id, x]) => ({ ...pickOf(r, id, s), stat: x })) };
    },
    sub: () => '가장 많이 고른 증강 · 가장 많이 이긴 증강 · 잘 이긴 증강',
  },
  unknown: {
    name: '미지의 증강',
    subs: ['아직 모임에서 아무도 고르지 않은 증강', '첫 기록의 주인공이 되어 보세요'],
    make: (r, s) => {
      if (Object.values(s.stats).reduce((a, x) => a + x.n, 0) < TONIGHT.unknownMin) return null;
      const p = pool(s, (a) => !s.stats[a.id]?.n);
      return p.length >= 3 ? { picks: shuffle(r, p).slice(0, 3).map((a) => pickOf(r, a.id, s)) } : null;
    },
  },
} satisfies Record<string, Theme>;
export type ThemeKey = keyof typeof THEMES;

/** 오늘의 공지 내용. 쓸 수 있는 테마가 없으면(거의 없음) 최근 증강 제한을 풀고 '오늘의 증강 3' */
export function tonightOf(s: TonightInput): Tonight {
  const r = rngOf(`prism-${s.day}`);
  const avoid = new Set(s.recentThemes.slice(0, TONIGHT.avoidThemes));
  const keys = shuffle(r, Object.keys(THEMES) as ThemeKey[]);
  for (const k of [...keys.filter((k) => !avoid.has(k)), ...keys.filter((k) => avoid.has(k))]) {
    const th: Theme = THEMES[k];
    const t = th.make(r, s);
    if (!t || t.picks.length < 3) continue;
    return { theme: k, name: th.name, sub: th.sub ? th.sub(t) : pick(r, th.subs), ...t };
  }
  const t = THEMES.tri.make(r, { ...s, recentAugs: [] })!;
  return { theme: 'tri', name: THEMES.tri.name, sub: THEMES.tri.subs[0], ...t };
}
