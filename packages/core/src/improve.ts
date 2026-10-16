/**
 * 승률을 올리려면 (CLAUDE.md v3.56). 회원 페이지(본인)의 기록을 규칙으로 읽어 "이걸 바꾸면 이길 판이 늘어난다"를 최대 3개 고른다.
 * AI 가 아니라 정해진 규칙이다. 두 묶음이 각각 충분히 쌓였고 차이가 클 때만 말한다 (적은 판으로 단정하지 않는다).
 * gain = 약한 쪽이 강한 쪽만큼 이겼다면 전체 승률이 오르는 폭 (= 차이 × 약한 쪽 비중). 기록으로 계산한 추정이라 화면에도 '추정'으로 쓴다.
 * 숫자는 IMPROVE 한 곳.
 */
import { CHAMPIONS } from './data';
import { challengeRole, CHALLENGE_ROLE_KO, type ChallengeRole } from './challenges';
import { augmentHabits, type MemberPage } from './profile';

export const IMPROVE = {
  /** 한 묶음 최소 판수(증강은 고른 수) */
  min: 5,
  /** 말할 만한 승률 차이 */
  gap: 0.08,
  /** 진 판과 이긴 판의 평균 데스 차이 */
  deathGap: 2.5,
  /** 많이 했는데 약한 챔프: 판수·평소 대비 차이 */
  champMin: 8, champGap: 0.12,
  /** 긴 판·짧은 판 (분) */
  longMin: 20, shortMin: 15,
  /** 보여 줄 개수 */
  max: 3,
};

export type Side = { label: string; n: number; w: number; unit: string };
export type WinTip = {
  key: string;
  title: string;
  /** 근거 한 줄 */
  why: string;
  /** 다음 판에 해 볼 것 */
  act: string;
  /** 비교한 두 묶음 (좋은 쪽 먼저). 데스처럼 승률 비교가 아니면 없음 */
  cmp?: [Side, Side];
  /** 전체 승률이 오를 것으로 추정되는 폭 (0~1). 승률 비교가 아니면 없음 */
  gain?: number;
  /** 정렬용 무게 */
  weight: number;
  champion?: number;
};

const rate = (x: { n: number; w: number }) => (x.n ? x.w / x.n : 0);
const pctTxt = (x: number) => `${Math.round(x * 100)}%`;

const ROLE_ACT: Record<ChallengeRole, string> = {
  marksman: '뒤에서 거리를 지키는 게 먼저예요. 피해 증강에 생존 아이템 하나를 같이 챙겨 보세요.',
  mage: '스킬을 맞히는 판이 이기는 판이에요. 스킬 가속·마법 피해 증강을 먼저 노려 보세요.',
  assassin: '들어갈 때를 고르세요. 상대가 군중 제어를 쓴 뒤에 진입하면 덜 쓰러져요.',
  fighter: '먼저 들어가되 혼자 깊이 가지 않기. 체력·흡혈 증강이 버티는 힘이 돼요.',
  tank: '앞에서 오래 버티는 게 일이에요. 체력·방어 증강과 방어 아이템을 먼저 챙겨 보세요.',
  support: '아군 곁에 붙어 있기. 회복·보호막 증강을 먼저 노려 보세요.',
};

export function improveOf(page: MemberPage): WinTip[] {
  const { min, gap } = IMPROVE;
  const base = rate(page.total);
  const tips: WinTip[] = [];
  const side = (label: string, x: { n: number; w: number }, unit = '판'): Side => ({ label, n: x.n, w: x.w, unit });

  // 1) 챔프에 맞는 증강(S·A)을 골랐을 때 vs 아닐 때 (고른 증강 기준)
  const H = augmentHabits(page);
  if (H.fit) {
    const { good, rest } = H.fit;
    const g = rate(good) - rate(rest), all = good.n + rest.n;
    if (good.n >= min * 2 && rest.n >= min * 2 && g >= gap * 0.75) {
      const gain = g * (rest.n / all);
      tips.push({ key: 'fit', title: '챔프에 맞는 증강을 먼저 고르세요', why: `잘 맞는(S·A) 증강을 고른 판 ${pctTxt(rate(good))} · 그 밖의 증강 ${pctTxt(rate(rest))}`,
        act: '증강 3개 중 S·A 티어가 보이면 그것부터. 앱의 게임 위 작은 창과 3개 비교에 티어가 바로 떠요.', cmp: [side('잘 맞는 증강', good, '개'), side('그 밖의 증강', rest, '개')], gain, weight: gain });
    }
  }
  // 2) 약한 증강 성향 (평소보다 크게 덜 이김)
  if (H.worst && H.worst.n >= min * 2 && -H.worst.delta >= gap) {
    const w = H.worst, gain = -w.delta * w.share * 0.5; // 한 판에 증강이 여럿이라 절반만 반영
    tips.push({ key: 'tag', title: `'${w.label}' 증강은 줄여 보세요`, why: `고른 판 승률 ${pctTxt(w.rate)} · 평소 ${pctTxt(base)}`,
      act: H.best ? `대신 '${H.best.label}' 증강을 고른 판은 ${pctTxt(H.best.rate)}였어요. 비슷한 선택지라면 그쪽으로.` : '비슷한 선택지라면 다른 성향의 증강을 골라 보세요.',
      cmp: [side('평소', page.total), side(w.label, { n: w.n, w: w.w }, '개')], gain, weight: gain });
  }
  // 3) 약한 역할 (8절 역할 규칙, 전체 기록)
  const roles = new Map<ChallengeRole, { n: number; w: number }>();
  for (const c of page.champions) {
    const r = challengeRole(c.id);
    if (!r) continue;
    const v = roles.get(r) ?? { n: 0, w: 0 };
    v.n += c.n; v.w += c.w; roles.set(r, v);
  }
  let weak: { r: ChallengeRole; v: { n: number; w: number }; others: { n: number; w: number }; g: number } | null = null;
  for (const [r, v] of roles) {
    if (v.n < min + 1) continue;
    const others = { n: page.total.n - v.n, w: page.total.w - v.w };
    if (others.n < min) continue;
    const g = rate(others) - rate(v);
    if (g >= gap + 0.02 && (!weak || g * v.n > weak.g * weak.v.n)) weak = { r, v, others, g };
  }
  if (weak) {
    const gain = weak.g * (weak.v.n / page.total.n);
    const best = [...roles].filter(([, v]) => v.n >= min).sort((a, b) => rate(b[1]) - rate(a[1]))[0];
    tips.push({ key: 'role', title: `${CHALLENGE_ROLE_KO[weak.r]}로 할 때 약해요`, why: `${CHALLENGE_ROLE_KO[weak.r]} ${pctTxt(rate(weak.v))} (${weak.v.n}판) · 나머지 역할 ${pctTxt(rate(weak.others))}`,
      act: `${ROLE_ACT[weak.r]}${best && best[0] !== weak.r ? ` 대기석에 ${CHALLENGE_ROLE_KO[best[0]]} 챔프가 있으면 바꿔 와도 좋아요 (${pctTxt(rate(best[1]))}).` : ''}`,
      cmp: [side('나머지 역할', weak.others), side(CHALLENGE_ROLE_KO[weak.r], weak.v)], gain, weight: gain });
  }
  // 4) 많이 했는데 약한 챔프
  const champ = page.champions.filter((c) => c.n >= IMPROVE.champMin && base - rate(c) >= IMPROVE.champGap)
    .sort((a, b) => (base - rate(b)) * b.n - (base - rate(a)) * a.n)[0];
  if (champ && CHAMPIONS[champ.id]) {
    const name = CHAMPIONS[champ.id].name, gain = (base - rate(champ)) * (champ.n / page.total.n);
    tips.push({ key: 'champ', title: `${name}일 때 승률이 낮아요`, why: `${name} ${champ.n}판 ${pctTxt(rate(champ))} · 평소 ${pctTxt(base)}`,
      act: `${name}의 증강 가이드에서 S티어 증강과 어울리는 이유를 한 번 보고 가세요.`, cmp: [side('평소', page.total), side(name, champ)], gain, weight: gain, champion: champ.id });
  }

  // 아래는 최근 판(최대 30판)으로 본다
  const R = page.recent;
  const wins = R.filter((g) => g.win), losses = R.filter((g) => !g.win);
  // 5) 진 판의 데스
  if (wins.length >= min && losses.length >= min) {
    const avg = (x: typeof R) => x.reduce((s, g) => s + g.deaths, 0) / x.length;
    const dl = avg(losses), dw = avg(wins);
    if (dl - dw >= IMPROVE.deathGap) {
      tips.push({ key: 'deaths', title: '진 판에서 많이 쓰러져요', why: `진 판 평균 데스 ${dl.toFixed(1)} · 이긴 판 ${dw.toFixed(1)} (최근 ${R.length}판)`,
        act: '한타가 열릴 때 한 박자 늦게. 아군 앞라인 뒤에서 시작하고, 혼자 앞서 나가지 않기.', weight: ((dl - dw) / 10) * (losses.length / R.length) });
    }
  }
  // 6) 모임 판 vs 혼자
  const crew = R.filter((g) => g.crewCount >= 2), solo = R.filter((g) => g.crewCount < 2);
  const nw = (x: typeof R) => ({ n: x.length, w: x.filter((g) => g.win).length });
  if (crew.length >= min && solo.length >= min) {
    const g = rate(nw(crew)) - rate(nw(solo));
    if (g >= gap + 0.02) {
      const gain = g * (solo.length / R.length);
      tips.push({ key: 'crew', title: '같이 할 때 더 이겨요', why: `회원과 함께한 판 ${pctTxt(rate(nw(crew)))} · 혼자 ${pctTxt(rate(nw(solo)))} (최근 ${R.length}판)`,
        act: '디스코드 음성 채널에 누가 있는지 모임 화면에서 보고 같이 들어가 보세요.', cmp: [side('함께', nw(crew)), side('혼자', nw(solo))], gain, weight: gain });
    }
  }
  // 7) 긴 판에서 약함
  const long = R.filter((g) => g.duration >= IMPROVE.longMin * 60), short = R.filter((g) => g.duration < IMPROVE.shortMin * 60);
  if (long.length >= min && short.length >= min) {
    const g = rate(nw(short)) - rate(nw(long));
    if (g >= gap + 0.04) {
      const gain = g * (long.length / R.length);
      tips.push({ key: 'long', title: '판이 길어지면 약해져요', why: `${IMPROVE.longMin}분 넘는 판 ${pctTxt(rate(nw(long)))} · ${IMPROVE.shortMin}분 안에 끝난 판 ${pctTxt(rate(nw(short)))}`,
        act: '20분이 넘어가면 방어·치유 감소 아이템을 챙기고, 성장형 증강은 일찍 고를수록 좋아요.', cmp: [side('짧은 판', nw(short)), side('긴 판', nw(long))], gain, weight: gain });
    }
  }
  return tips.sort((a, b) => b.weight - a.weight).slice(0, IMPROVE.max);
}
