/**
 * 함께한 멤버 칭찬 (CLAUDE.md v3.83). 멤버 근황의 '함께한 판' 카드에 쓴다.
 * 코치 리포트(duo.ts coachOf)와 같은 눈으로 보되, 함께한 판에서 **잘한 점만** 사실로 짚는다 (승패를 탓하지 않는다).
 * 규칙으로 만든다(AI 아님). 근거가 충분할 때만 말하고, 많아야 3개.
 * **우연보다 확실히 나을 때만 칭찬한다 (v3.95).** 아수라장은 챔프가 무작위라 '앞라인이 있었다'·'AD·AP가 섞였다'는
 * 그냥 두어도 85~90% 판에서 일어나고, 5인 팟이면 10명 중 피해량 1위가 우리 쪽일 확률이 원래 절반이다.
 * 판마다 '보통이면 일어날 확률'을 구해, 그 확률로 이만큼 나올 가능성이 LUCK 미만일 때만 말하고 '보통은 N판'을 함께 적는다.
 */
import { ACTIVE_AUGMENTS, CHAMPIONS } from './data';
import { tierFor } from './mastery';
import type { Feat } from './challenges';

export type PraiseMember = { id: string; nick: string; champ: number; k: number; d: number; a: number; augs: number[] | null; feat: Feat | null };
export type PraiseGame = { at: number; win: boolean; team: number[]; members: PraiseMember[] };
export type Praise = { key: string; title: string; text: string };

const isFront = (id: number) => { const c = CHAMPIONS[id]; return Boolean(c && (c.roles.includes('tank') || (c.roles[0] === 'fighter' && c.style.durability >= 2))); };
const dmg = (id: number) => CHAMPIONS[id]?.damage ?? null;

/** 우연으로 이만큼 나올 가능성이 이보다 작을 때만 칭찬한다 */
export const LUCK = 0.1;

/** 판마다 확률 p 인 일이 hits 번 이상 일어날 확률 (포아송 이항, 판마다 확률이 달라도 된다) */
export function chanceAtLeast(hits: number, ps: number[]) {
  let dist = [1];
  for (const p of ps) {
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((v, k) => { next[k] += v * (1 - p); next[k + 1] += v * p; });
    dist = next;
  }
  return dist.slice(hits).reduce((a, b) => a + b, 0);
}
const unlikely = (hits: number, ps: number[]) => hits >= 2 && chanceAtLeast(hits, ps) < LUCK;
const usual = (ps: number[]) => { const e = ps.reduce((a, b) => a + b, 0); return e < 1 ? '1판이 안 돼요' : `${Math.round(e * 10) / 10}판`; };

/* 무작위 챔프 k명이 모였을 때: 앞라인이 하나라도 있을 확률 · AD·AP가 섞일 확률 */
const POOL = Object.keys(CHAMPIONS).map(Number);
const share = (f: (id: number) => boolean) => POOL.filter(f).length / Math.max(1, POOL.length);
const FRONT_SHARE = share((id) => isFront(id));
const AD_ONLY = share((id) => CHAMPIONS[id]?.damage === 'AD');
const AP_ONLY = share((id) => CHAMPIONS[id]?.damage === 'AP');
const pFront = (k: number) => 1 - (1 - FRONT_SHARE) ** k;
const pMix = (k: number) => Math.max(0, 1 - AD_ONLY ** k - AP_ONLY ** k);
/* 아무거나 골랐을 때 그 챔프에게 S·A 인 증강의 비율 (등급마다) */
const fitShare = new Map<string, number>();
function pFit(champ: number, aug: number) {
  const r = ACTIVE_AUGMENTS.find((a) => a.id === aug)?.rarity ?? 'silver';
  const key = `${champ}:${r}`;
  if (!fitShare.has(key)) {
    const pool = ACTIVE_AUGMENTS.filter((a) => a.rarity === r).map((a) => tierFor(champ, a.id)).filter(Boolean);
    fitShare.set(key, pool.length ? pool.filter((t) => t === 'S' || t === 'A').length / pool.length : 0.5);
  }
  return fitShare.get(key)!;
}

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
  // 조합: 앞라인 · 피해 유형 (팀 챔프를 아는 판만). 무작위 팀에서도 대부분 갖춰지므로 그보다 확실히 많을 때만
  const known = games.filter((g) => g.team.length >= 4);
  if (known.length >= 2) {
    const front = known.filter((g) => g.team.some(isFront)).length, pf = known.map((g) => pFront(g.team.length));
    if (unlikely(front, pf)) out.push({ key: 'front', w: 2 + front / known.length, title: '앞라인을 꾸준히 세웠어요', text: `${known.length}판 중 ${front}판 · 보통은 ${usual(pf)}` });
    const mix = known.filter((g) => { const t = g.team.map(dmg); return (t.includes('AD') || t.includes('MIX')) && (t.includes('AP') || t.includes('MIX')); }).length;
    const pm = known.map((g) => pMix(g.team.length));
    if (unlikely(mix, pm)) out.push({ key: 'mix', w: 1.5 + mix / known.length, title: 'AD·AP를 고르게 섞었어요', text: `${known.length}판 중 ${mix}판 · 보통은 ${usual(pm)}` });
  }
  // 피해량 1위 · 받은 피해 1위 (10명 중, 우리 멤버가). 우리 멤버가 m명이면 원래 m/10 확률이다 (5인 팟이면 절반)
  const pTop = games.map((g) => Math.min(1, g.members.length / 10));
  const top = games.filter((g) => g.members.some((m) => m.feat?.dmgTop)).length;
  if (unlikely(top, pTop)) out.push({ key: 'carry', w: 2 + top / n, title: '딜은 우리가 책임졌어요', text: `10명 중 피해량 1위가 우리 멤버인 판 ${n}판 중 ${top}판 · 보통은 ${usual(pTop)}` });
  const tank = games.filter((g) => g.members.some((m) => m.feat?.takenTop)).length;
  if (unlikely(tank, pTop)) out.push({ key: 'tank', w: 1.6 + tank / n, title: '앞에서 받아 냈어요', text: `받은 피해 1위가 우리 멤버인 판 ${n}판 중 ${tank}판 · 보통은 ${usual(pTop)}` });
  // 증강: 챔프에 맞는(S·A) 증강을 고른 수 — 아무거나 골랐을 때보다 확실히 많을 때만
  let fit = 0;
  const pa: number[] = [];
  for (const g of games) for (const m of g.members) for (const a of m.augs ?? []) { const t = tierFor(m.champ, a); if (!t) continue; pa.push(pFit(m.champ, a)); if (t === 'S' || t === 'A') fit++; }
  if (pa.length >= 6 && unlikely(fit, pa)) out.push({ key: 'augs', w: 1.8 + fit / pa.length, title: '챔프에 맞는 증강을 잘 골랐어요', text: `고른 증강 ${pa.length}개 중 ${fit}개가 S·A · 보통은 ${usual(pa)}` });
  // 데스 관리: 함께한 판 평균 데스
  const ms = games.flatMap((g) => g.members);
  const deaths = ms.reduce((s, m) => s + m.d, 0) / Math.max(1, ms.length);
  if (ms.length >= 4 && deaths <= 6) out.push({ key: 'safe', w: 1.4 + (6 - deaths) / 6, title: '무리하지 않고 함께 싸웠어요', text: `한 사람 평균 데스 ${deaths.toFixed(1)}` });
  return out.sort((a, b) => b.w - a.w).slice(0, 3).map(({ w: _w, ...p }) => p);
}
