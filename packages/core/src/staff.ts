/**
 * 운영 화면 기준 (CLAUDE.md v3.160). 숫자는 여기 한 곳에서 바꾼다.
 *  - PICK_POINTS: '잘하고 있는 멤버' 다섯 기준의 배점 (합 100)
 *  - ONBOARD_GOALS: 온보딩 단계별 목표 비율(%) — 가입 · 롤 연결 · 앱 · 첫 판 · 모임 판 3판 · 정회원
 *  - onboardTips: 온보딩 숫자를 읽고 이번 주 할 일을 규칙으로 (AI 아님)
 */
export const PICK_POINTS = { act: 25, crew: 20, days: 20, mates: 20, perf: 15 } as const;
export type PickKey = keyof typeof PICK_POINTS;
/** 활동 지수 단계 (v3.178): 합(0~100)을 '점'이 아니라 지수로, 세 가지 색 — 낮음(위험) · 보통 · 높음(열심히 활동) */
export const PICK_TIERS = { low: 45, high: 70 } as const;
export type PickTier = 'low' | 'mid' | 'high';
export const pickTier = (v: number): PickTier => (v >= PICK_TIERS.high ? 'high' : v < PICK_TIERS.low ? 'low' : 'mid');
export const PICK_TIER_KO: Record<PickTier, string> = { low: '활동 낮음', mid: '보통', high: '열심히 활동' };
export const PICK_INFO: { key: PickKey; name: string; desc: string; color: string }[] = [
  { key: 'act', name: '활동량', desc: '2주 판 수 (모임에서 가장 많이 한 멤버 대비)', color: '#2a78d6' },
  { key: 'crew', name: '참여도', desc: '멤버와 함께한 판의 비율', color: '#eb6834' },
  { key: 'days', name: '꾸준함', desc: '14일 중 판을 한 날', color: '#1baf7a' },
  { key: 'mates', name: '어울림', desc: '함께한 서로 다른 멤버 수', color: '#eda100' },
  { key: 'perf', name: '성적', desc: 'Prism 점수 (500 = 보통)', color: '#e87ba4' },
];

export const ONBOARD_STEPS: { key: 'joined' | 'linked' | 'app' | 'played' | 'crew3' | 'regular'; name: string; goal: number }[] = [
  { key: 'joined', name: '가입', goal: 100 },
  { key: 'linked', name: '롤 계정 연결', goal: 95 },
  { key: 'app', name: '앱 설치', goal: 90 },
  { key: 'played', name: '첫 판', goal: 90 },
  { key: 'crew3', name: '모임 판 3판', goal: 90 },
  { key: 'regular', name: '정회원', goal: 80 },
];

type Funnel = { joined: number; linked: number; app: number; played: number; crew3: number; regular: number };

/** 단계마다 한 줄 풀이 (숫자에서만, 지어내지 않는다) */
export function onboardNote(key: keyof Funnel, f: Funnel): string {
  const gap = (a: number, b: number) => Math.max(0, a - b);
  switch (key) {
    case 'joined': return `최근 4주 ${f.joined}명이 가입했어요.`;
    case 'linked': return gap(f.joined, f.linked) ? `${gap(f.joined, f.linked)}명이 아직 롤 계정을 잇지 않았어요.` : '모두 롤 계정을 이었어요.';
    case 'app': return gap(f.linked, f.app) ? `${gap(f.linked, f.app)}명은 앱을 설치하지 않았어요.` : '롤을 이은 멤버는 모두 앱을 써요.';
    case 'played': return gap(f.app, f.played) ? `${gap(f.app, f.played)}명이 아직 첫 판 전이에요.` : '앱을 쓴 멤버는 모두 첫 판을 했어요.';
    case 'crew3': return gap(f.played, f.crew3) ? `${gap(f.played, f.crew3)}명이 멤버와 함께한 판이 3판이 안 돼요.` : '첫 판을 한 멤버는 모두 모임 판 3판을 넘겼어요.';
    case 'regular': return gap(f.crew3, f.regular) ? `${gap(f.crew3, f.regular)}명이 운영진과 함께한 판이 모자라 아직 정회원 전이에요.` : '모임 판 3판을 넘긴 멤버는 모두 정회원이에요.';
  }
  return '';
}

/** 이번 주 할 일 (최대 3줄): 목표에 가장 많이 못 미친 단계부터 */
export function onboardTips(f: Funnel, reviewWaiting: number): string[] {
  if (!f.joined) return [];
  const out: { gap: number; t: string }[] = [];
  const pct = (n: number) => (n / f.joined) * 100;
  for (const s of ONBOARD_STEPS.slice(1)) {
    const short = s.goal - pct(f[s.key]);
    if (short <= 0) continue;
    const prev = ONBOARD_STEPS[ONBOARD_STEPS.indexOf(s) - 1];
    const n = Math.max(0, f[prev.key] - f[s.key]);
    if (!n) continue;
    const t = s.key === 'linked' ? `**롤 계정을 잇지 않은 ${n}명**에게 앱에서 롤 계정을 이어 달라고 한 번 알려 주세요.`
      : s.key === 'app' ? `**앱을 깔지 않은 ${n}명**은 판이 기록되지 않아요. 설치 안내를 한 번 더.`
      : s.key === 'played' ? `**첫 판 전인 ${n}명**과 오늘 밤 한 판 같이 해 주세요.`
      : s.key === 'crew3' ? `**모임 판 3판을 못 채운 ${n}명**에게 팟을 같이 열어 주세요.`
      : `**정회원 전인 ${n}명**은 운영진과 함께한 판이 모자라요. 운영진이 한 판씩 함께해 주세요.`;
    out.push({ gap: short, t });
  }
  if (reviewWaiting) out.push({ gap: 50, t: `**정회원 심사 ${reviewWaiting}명**이 기다려요. 할 일에서 승인해 주세요.` });
  return out.sort((a, b) => b.gap - a.gap).slice(0, 3).map((x) => x.t);
}
