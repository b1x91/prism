/**
 * Prism 레이팅 실력표 (2026-11-06 사용자 결정, 계산은 packages/core/src/rating.ts).
 * 기록된 모든 판을 시간순으로 거쳐 계정마다 μ·σ 를 만든다. 판의 10명 기록(matches.players)에서 회원은 팀+챔프로
 * 회원 판(participants)과 맞춰 그 계정(puuid)으로, 비회원은 그 판 기록의 롤 이름으로 같은 사람을 이어 본다 —
 * 비회원 실력은 계산하는 동안 메모리에만 있고 저장하지 않는다. 회원 계정 실력만 남긴다.
 * 새 판이 들어오지 않았으면(matches 의 가장 늦은 created_at 이 같으면) 이 Worker 에 담아 둔 표를 그대로 쓴다.
 */
import { rateAll, type RatedGame, type Skill } from '../../packages/core/src/rating.js';
import { prismScores } from '../../packages/core/src/mvp.js';
import type { Env } from './util.js';

let memo: { stamp: string; book: Map<string, Skill> } | null = null;

/** 회원 판 하나의 레이팅 열쇠: 그 판의 계정 → 없으면 회원의 메인 계정 → 그래도 없으면 회원 */
export const ratingKey = (puuid: string | null | undefined, mainPuuid: string | null | undefined, memberId: string) => puuid || mainPuuid || `m:${memberId}`;
// 메인 계정이 member_accounts 에 없으면 accountRows 는 'm' 줄로 세지만 열쇠는 메인 puuid 로 같다 (두 곳 모두 ratingKey)

export async function ratingBook(env: Env): Promise<Map<string, Skill>> {
  const head = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(created_at) AS t FROM matches').first<{ n: number; t: number | null }>();
  const stamp = `${head?.n ?? 0}:${head?.t ?? 0}`;
  if (memo?.stamp === stamp) return memo.book;
  const [ms, ps, us, as] = await env.DB.batch([
    env.DB.prepare('SELECT game_id, played_at, players FROM matches'),
    env.DB.prepare('SELECT game_id, member_id, puuid, champion_id, team_id, win, played_at FROM participants'),
    env.DB.prepare('SELECT id, riot_puuid FROM members'),
    env.DB.prepare('SELECT puuid, member_id FROM member_accounts'),
  ]);
  const main = new Map((us.results as { id: string; riot_puuid: string | null }[]).map((u) => [u.id, u.riot_puuid]));
  const owner = new Map((as.results as { puuid: string; member_id: string }[]).map((a) => [a.puuid, a.member_id]));
  type P = { game_id: number; member_id: string; puuid: string | null; champion_id: number; team_id: number; win: number; played_at: number };
  const parts = new Map<number, P[]>();
  for (const p of ps.results as P[]) { const a = parts.get(p.game_id); if (a) a.push(p); else parts.set(p.game_id, [p]); }
  // 랭킹 줄(members.ts accountRows)과 같은 규칙: 판의 계정이 지금 그 회원에게 연결돼 있지 않으면(뺀 계정·예전 판) 메인 계정으로
  const keyOf = (p: P) => ratingKey(p.puuid && owner.get(p.puuid) === p.member_id ? p.puuid : null, main.get(p.member_id), p.member_id);
  const games: RatedGame[] = [];
  // 판(matches) 줄이 없는 회원 기록도 회원만 아는 판으로 센다 (운영에는 없지만 안전하게)
  const rows = ms.results as { game_id: number; played_at: number; players: string | null }[];
  const seen = new Set(rows.map((m) => m.game_id));
  for (const [id, own] of parts) if (!seen.has(id)) rows.push({ game_id: id, played_at: own[0].played_at, players: null });
  for (const m of rows) {
    const own = parts.get(m.game_id) ?? [];
    let pl: { name: string | null; championId: number; teamId: number; win: boolean; kills: number; deaths: number; assists: number; damageToChampions: number | null; damageTaken: number | null }[] | null = null;
    try { pl = m.players ? JSON.parse(m.players) : null; } catch { pl = null; }
    if (pl && pl.length >= 10) {
      const sc = prismScores(pl);
      games.push({ playedAt: m.played_at, players: pl.map((x, i) => {
        const mp = own.find((p) => p.team_id === x.teamId && p.champion_id === x.championId);
        return { key: mp ? keyOf(mp) : x.name ? `n:${String(x.name).toLowerCase()}` : '', teamId: x.teamId, win: Boolean(x.win), score: sc?.[i] ?? null };
      }) });
    } else if (own.length) {
      // 10명 기록이 없는 예전 판: 회원만 알고 나머지 자리는 그 판만 기본 실력으로
      const players = own.map((p) => ({ key: keyOf(p), teamId: p.team_id, win: Boolean(p.win) }));
      const t = own[0].team_id, w = Boolean(own[0].win);
      for (const tid of [100, 200]) for (let k = players.filter((x) => x.teamId === tid).length; k < 5; k++) players.push({ key: '', teamId: tid, win: tid === t ? w : !w });
      games.push({ playedAt: m.played_at, players });
    }
  }
  const all = rateAll(games);
  const book = new Map<string, Skill>();
  for (const [k, v] of all) if (!k.startsWith('n:')) book.set(k, v);
  memo = { stamp, book };
  return book;
}
