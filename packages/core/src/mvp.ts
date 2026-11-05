/**
 * PRISM MVP (2026-11-05 사용자 결정): 한 판 10명을 우리 기준 점수로 매겨 잘한 사람을 짚는다.
 * 같은 팀 다섯 명 안에서의 몫으로 본다 (8절 원칙 — 절대 딜량이 아니라 팀 안 점유율).
 * 점수 = 피해 몫 35% + 받은 피해 몫 15% + 킬 관여 25% − 데스 몫 25%, 팀 평균이 5.0 이 되게 0~10 으로.
 * MVP = 이긴 팀 1위, ACE = 진 팀 1위 — 단, 점수가 `MVP.min` 이상일 때만 ('잘했으면'). 규칙으로 만든다 (AI 아님).
 */
export const MVP = { dmg: 0.35, tank: 0.15, kp: 0.25, death: 0.25, min: 6 };

export type MvpPlayer = {
  teamId: number; win: boolean; kills: number; deaths: number; assists: number;
  damageToChampions: number | null; damageTaken: number | null;
};

/** 10명 각자의 PRISM 점수 (0~10, 소수 한 자리). 10명이 아니거나 피해 기록이 빠졌으면 null */
export function prismScores(ps: MvpPlayer[]): number[] | null {
  if (ps.length < 10 || ps.some((p) => p.damageToChampions == null)) return null;
  const teams = new Map<number, MvpPlayer[]>();
  for (const p of ps) teams.set(p.teamId, [...(teams.get(p.teamId) ?? []), p]);
  const avg = MVP.dmg + MVP.tank + MVP.kp - MVP.death;
  return ps.map((p) => {
    const t = teams.get(p.teamId)!;
    const n = t.length;
    const sum = (f: (x: MvpPlayer) => number) => t.reduce((s, x) => s + f(x), 0);
    const share = (v: number, total: number) => (total > 0 ? (v / total) * n : 1);
    const kills = sum((x) => x.kills);
    const kpOf = (x: MvpPlayer) => (kills > 0 ? (x.kills + x.assists) / kills : 0);
    const kpAvg = sum(kpOf) / n;
    const d = share(p.damageToChampions ?? 0, sum((x) => x.damageToChampions ?? 0));
    const tk = p.damageTaken == null ? 1 : share(p.damageTaken, sum((x) => x.damageTaken ?? 0));
    const kp = kpAvg > 0 ? kpOf(p) / kpAvg : 1;
    const de = share(p.deaths, sum((x) => x.deaths));
    const raw = MVP.dmg * d + MVP.tank * tk + MVP.kp * kp - MVP.death * de;
    return Math.round(Math.max(0, Math.min(10, 5 + ((raw - avg) / avg) * 5)) * 10) / 10;
  });
}

export type MvpBadge = 'mvp' | 'ace';

/** 10명 중 MVP·ACE 자리 (players 와 같은 순서, 없으면 null) */
export function mvpBadges(ps: MvpPlayer[]): (MvpBadge | null)[] | null {
  const sc = prismScores(ps);
  if (!sc) return null;
  const best = (win: boolean) => {
    let at = -1;
    ps.forEach((p, i) => { if (p.win === win && (at < 0 || sc[i] > sc[at])) at = i; });
    return at >= 0 && sc[at] >= MVP.min ? at : -1;
  };
  const m = best(true), a = best(false);
  return ps.map((_, i) => (i === m ? 'mvp' : i === a ? 'ace' : null));
}

/** 한 사람(팀·챔프로 찾음)의 배지 */
export function badgeFor(ps: (MvpPlayer & { championId: number })[], teamId: number, championId: number): MvpBadge | null {
  const b = mvpBadges(ps);
  if (!b) return null;
  const i = ps.findIndex((p) => p.teamId === teamId && p.championId === championId);
  return i >= 0 ? b[i] : null;
}

/** 서버: matches.players(JSON 글자) 로 그 회원의 배지 */
export function badgeFromJson(players: string | null | undefined, teamId: number, championId: number): MvpBadge | null {
  if (!players) return null;
  try { const ps = JSON.parse(players); return Array.isArray(ps) ? badgeFor(ps, teamId, championId) : null; } catch { return null; }
}

export const BADGE_KO: Record<MvpBadge, string> = { mvp: 'MVP', ace: 'ACE' };
