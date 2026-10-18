/**
 * 함께한 멤버 칭찬 (CLAUDE.md v3.83). 멤버 근황의 '함께한 판' 카드에 쓴다.
 * 코치 리포트(duo.ts coachOf)와 같은 눈으로 보되, 함께한 판에서 **잘한 점만** 사실로 짚는다 (승패를 탓하지 않는다).
 * 규칙으로 만든다(AI 아님). 근거가 충분할 때만 말하고, 많아야 3개.
 */
import { CHAMPIONS } from './data';
import { tierFor } from './mastery';
import type { Feat } from './challenges';

export type PraiseMember = { id: string; nick: string; champ: number; k: number; d: number; a: number; augs: number[] | null; feat: Feat | null };
export type PraiseGame = { at: number; win: boolean; team: number[]; members: PraiseMember[] };
export type Praise = { key: string; title: string; text: string };

const isFront = (id: number) => { const c = CHAMPIONS[id]; return Boolean(c && (c.roles.includes('tank') || (c.roles[0] === 'fighter' && c.style.durability >= 2))); };
const dmg = (id: number) => CHAMPIONS[id]?.damage ?? null;

/** 함께 연달아 한 판 (다음 판이 이만큼 안에 시작하면 이어진 것으로 본다) */
export const RUN_GAP = 50 * 60_000;

/** 가장 길게 이어서 함께 한 판 수 */
export function longestRun(times: number[]) {
  const t = [...times].sort((a, b) => a - b);
  let best = t.length ? 1 : 0, cur = 1;
  for (let i = 1; i < t.length; i++) { cur = t[i] - t[i - 1] <= RUN_GAP ? cur + 1 : 1; best = Math.max(best, cur); }
  return best;
}

export function groupPraiseOf(games: PraiseGame[]): Praise[] {
  const n = games.length;
  if (n < 2) return [];
  const out: (Praise & { w: number })[] = [];
  const order = [...games].sort((a, b) => a.at - b.at);
  // 연승
  let run = 0, bestRun = 0;
  for (const g of order) { run = g.win ? run + 1 : 0; bestRun = Math.max(bestRun, run); }
  if (bestRun >= 3) out.push({ key: 'streak', w: 3 + bestRun, title: `함께 ${bestRun}연승`, text: '흐름을 끊지 않고 이어 갔어요' });
  // 조합: 앞라인 · 피해 유형 (팀 챔프를 아는 판만)
  const known = games.filter((g) => g.team.length >= 4);
  if (known.length >= 2) {
    const front = known.filter((g) => g.team.some(isFront)).length;
    if (front / known.length >= 0.7) out.push({ key: 'front', w: 2 + front / known.length, title: '앞라인을 꾸준히 세웠어요', text: `${known.length}판 중 ${front}판` });
    const mix = known.filter((g) => { const t = g.team.map(dmg); return (t.includes('AD') || t.includes('MIX')) && (t.includes('AP') || t.includes('MIX')); }).length;
    if (mix / known.length >= 0.8) out.push({ key: 'mix', w: 1.5 + mix / known.length, title: 'AD·AP를 고르게 섞었어요', text: `상대가 방어를 한쪽만 올리지 못한 판 ${known.length}판 중 ${mix}판` });
  }
  // 피해량 1위 · 받은 피해 1위 (10명 중, 우리 멤버가)
  const top = games.filter((g) => g.members.some((m) => m.feat?.dmgTop)).length;
  if (top >= Math.max(2, Math.ceil(n / 2))) out.push({ key: 'carry', w: 2 + top / n, title: '딜은 우리가 책임졌어요', text: `10명 중 피해량 1위가 우리 멤버인 판 ${n}판 중 ${top}판` });
  const tank = games.filter((g) => g.members.some((m) => m.feat?.takenTop)).length;
  if (tank >= Math.max(2, Math.ceil(n / 2))) out.push({ key: 'tank', w: 1.6 + tank / n, title: '앞에서 받아 냈어요', text: `받은 피해 1위가 우리 멤버인 판 ${n}판 중 ${tank}판` });
  // 증강: 챔프에 맞는(S·A) 증강을 고른 비율
  let picks = 0, fit = 0;
  for (const g of games) for (const m of g.members) for (const a of m.augs ?? []) { const t = tierFor(m.champ, a); if (!t) continue; picks++; if (t === 'S' || t === 'A') fit++; }
  if (picks >= 6 && fit / picks >= 0.6) out.push({ key: 'augs', w: 1.8 + fit / picks, title: '챔프에 맞는 증강을 잘 골랐어요', text: `고른 증강 ${picks}개 중 ${fit}개가 S·A` });
  // 데스 관리: 함께한 판 평균 데스
  const ms = games.flatMap((g) => g.members);
  const deaths = ms.reduce((s, m) => s + m.d, 0) / Math.max(1, ms.length);
  if (ms.length >= 4 && deaths <= 6) out.push({ key: 'safe', w: 1.4 + (6 - deaths) / 6, title: '무리하지 않고 함께 싸웠어요', text: `한 사람 평균 데스 ${deaths.toFixed(1)}` });
  return out.sort((a, b) => b.w - a.w).slice(0, 3).map(({ w: _w, ...p }) => p);
}
