/**
 * 프리즘 픽 (2026-11-05 사용자 결정): Prism 사람들이 최근 60일 가장 많이 고른 증강 (고른 수만 — 승률은 보내지 않는다,
 * 게임 위 작은 창에 쓰이므로 v3.5). 앱이 받아 이 기기에 두고, 증강 카드가 뜨면 작은 창이 '프리즘 픽' 표시를 단다.
 * 모임 전체로 고른 수 5번 이상인 증강 중 많이 고른 20개 + 챔프마다 3번 이상 고른 증강.
 */
import { json, type Env } from './util.js';
export const PICKS = { days: 60, min: 5, top: 20, champMin: 3 };

export async function augPicks(env: Env) {
  const since = Date.now() - PICKS.days * 86_400_000;
  const [all, byChamp] = await env.DB.batch([
    env.DB.prepare(`SELECT a.augment_id AS id, COUNT(*) AS n FROM participant_augments a JOIN participants p ON p.game_id = a.game_id AND p.member_id = a.member_id
      WHERE p.played_at > ? GROUP BY a.augment_id HAVING n >= ? ORDER BY n DESC LIMIT ?`).bind(since, PICKS.min, PICKS.top),
    env.DB.prepare(`SELECT a.champion_id AS c, a.augment_id AS id, COUNT(*) AS n FROM participant_augments a JOIN participants p ON p.game_id = a.game_id AND p.member_id = a.member_id
      WHERE p.played_at > ? GROUP BY a.champion_id, a.augment_id HAVING n >= ?`).bind(since, PICKS.champMin),
  ]);
  const champ: Record<number, number[]> = {};
  for (const r of byChamp.results as { c: number; id: number }[]) (champ[r.c] ??= []).push(r.id);
  return json({ ids: (all.results as { id: number }[]).map((r) => r.id), champ });
}

/**
 * 홈 '프리즘에서 가장 핫한 증강' (2026-11-06 사용자 결정): 최근 14일 Prism 사람들이 가장 많이 고른 증강 5개 —
 * 고른 수 · 고른 멤버 수. 14일 기록으로 5개가 안 차면 60일로 넓힌다. 회원 전용(홈).
 */
export const HOT = { days: 14, wide: 60, top: 5 };
export async function hotAugs(env: Env) {
  const q = (days: number) => env.DB.prepare(`SELECT a.augment_id AS id, COUNT(*) AS n, COUNT(DISTINCT a.member_id) AS m FROM participant_augments a
    JOIN participants p ON p.game_id = a.game_id AND p.member_id = a.member_id
    WHERE p.played_at > ? GROUP BY a.augment_id ORDER BY n DESC, m DESC LIMIT ?`).bind(Date.now() - days * 86_400_000, HOT.top).all<{ id: number; n: number; m: number }>();
  let days = HOT.days, rows = (await q(days)).results;
  if (rows.length < HOT.top) { days = HOT.wide; rows = (await q(days)).results; }
  return json({ days, rows });
}
