/**
 * 멤버 근황 (CLAUDE.md v3.74·v3.76): 모임 화면 '지금 디스코드' 아래.
 *  - 지금: 접속한 멤버 (게임 중 → 챔프 고르는 중 → 롤 켜 둠 → 앱 → 웹 순), 앱이 알린 롤 단계·챔프·시작 시각
 *  - 최근 근황(3일): 하루 판 묶음 · 펜타/쿼드라킬 · 연승 · 회원 셋 이상 함께한 판 · 첫 기록 · 새 회원
 * 회원 전용. 기록에서 늘 다시 만든다(따로 저장하지 않음).
 */
import { presenceOf, PRESENCE_TTL } from '../../packages/core/src/presence.js';
import { parseFeat } from '../../packages/core/src/challenges.js';
import { groupPraiseOf, longestRun, type PraiseGame } from '../../packages/core/src/praise.js';
import { runBonusOf } from '../../packages/core/src/shop.js';
import type { Pulse, PulseItem, PulseNow } from '../../packages/core/src/api.js';
import { FACE, json, type Env } from './util.js';

const KST = 9 * 3600_000;
const DAY = 86400_000;
const SPAN = 3 * DAY;
const dayOf = (t: number) => Math.floor((t + KST) / DAY);

type Face = { id: string; nick: string; skin: number | null; main: number | null };

export async function pulse(env: Env): Promise<Response> {
  const now = Date.now();
  const since = now - SPAN;
  const [online, games, crew, joined] = await env.DB.batch([
    env.DB.prepare(`SELECT m.id, m.nick, ${FACE('m')}, m.web_seen_at AS webAt, m.app_seen_at AS appAt, m.app_lol AS lol, m.app_open AS open,
        m.app_phase AS phase, m.app_champ AS champ, m.app_phase_at AS phaseAt
      FROM members m WHERE m.app_seen_at > ?1 OR m.web_seen_at > ?1`).bind(now - PRESENCE_TTL),
    env.DB.prepare(`SELECT p.member_id AS id, m.nick, ${FACE('m')}, p.game_id AS g, p.played_at AS t, p.champion_id AS c, p.win AS w, p.feats AS f,
        p.kills AS k, p.deaths AS d, p.assists AS a, p.augments AS au, p.team_id AS tm,
        (SELECT MIN(q.played_at) FROM participants q WHERE q.member_id = p.member_id) AS first
      FROM participants p JOIN members m ON m.id = p.member_id WHERE p.played_at >= ? ORDER BY p.played_at DESC LIMIT 800`).bind(since),
    env.DB.prepare(`SELECT g.game_id AS g, g.played_at AS t, g.team_totals AS tt FROM matches g WHERE g.played_at >= ? AND g.crew_count >= 2 ORDER BY g.played_at DESC LIMIT 160`).bind(since),
    env.DB.prepare(`SELECT m.id, m.nick, ${FACE('m')}, m.joined_at AS t FROM members m WHERE m.joined_at >= ? ORDER BY m.joined_at DESC LIMIT 10`).bind(now - 7 * DAY),
  ]);

  // ── 지금
  const order = { game: 0, select: 1, lobby: 2, '': 3 } as const;
  const nowList: PulseNow[] = (online.results as any[]).map((r) => {
    const presence = presenceOf({ webAt: r.webAt, appAt: r.appAt, lol: Boolean(r.lol), open: Boolean(r.open) }, now);
    const appLive = now - r.appAt < PRESENCE_TTL && r.lol;
    const phase = (appLive ? r.phase : '') as PulseNow['phase'];
    return { id: r.id, nick: r.nick, skin: r.skin, main: r.main, presence, phase, champ: phase === 'select' || phase === 'game' ? r.champ : 0, since: phase ? r.phaseAt : 0 };
  }).filter((x) => x.presence !== 'off')
    .sort((a, b) => order[a.phase] - order[b.phase] || (a.presence === 'web' ? 1 : 0) - (b.presence === 'web' ? 1 : 0) || a.nick.localeCompare(b.nick, 'ko'));

  // ── 최근 근황
  const rows = games.results as any[];
  const face = (r: any): Face => ({ id: r.id, nick: r.nick, skin: r.skin, main: r.main });
  const feed: PulseItem[] = [];
  const today = dayOf(now);
  // 함께한 판 (멤버 2명 이상) → 같은 사람들끼리 같은 날 한 장의 칭찬 카드 (v3.83). 이 판들은 한 사람씩 다시 띄우지 않는다
  const byGame = new Map<number, any[]>();
  for (const r of rows) (byGame.get(r.g) ?? byGame.set(r.g, []).get(r.g)!).push(r);
  const groups = new Map<string, { members: Face[]; games: { c: any; ps: any[] }[]; at: number }>();
  const grouped = new Set<number>();
  for (const c of crew.results as any[]) {
    const ps = byGame.get(c.g); if (!ps || ps.length < 2) continue;
    const ms = ps.map(face).sort((a, b) => a.id.localeCompare(b.id));
    const k = `${ms.map((m) => m.id).join(',')}:${dayOf(c.t)}`;
    const e = groups.get(k) ?? { members: ms, games: [] as { c: any; ps: any[] }[], at: c.t };
    e.games.push({ c, ps }); e.at = Math.max(e.at, c.t);
    groups.set(k, e);
  }
  for (const e of groups.values()) {
    if (e.games.length < 2 && e.members.length < 3) continue; // 둘이서 한 판은 카드로 만들지 않는다 (각자 근황에 남김)
    for (const x of e.games) grouped.add(x.c.g);
    const pg: PraiseGame[] = e.games.map(({ c, ps }) => {
      let tt: any = null; try { tt = JSON.parse(c.tt); } catch { /* 없음 */ }
      const tm = ps[0].tm;
      return { at: c.t, win: Boolean(ps[0].w), team: (tt?.[tm]?.champions ?? []) as number[], members: ps.map((r) => {
        let augs: number[] | null = null; try { augs = r.au ? JSON.parse(r.au) : null; } catch { /* 없음 */ }
        return { id: r.id, nick: r.nick, champ: r.c, k: r.k, d: r.d, a: r.a, augs, feat: parseFeat(r.f) };
      }) };
    });
    const times = pg.map((g) => g.at);
    const multis = e.games.flatMap(({ ps }) => ps.map((r) => ({ r, m: parseFeat(r.f)?.multi ?? 0 })).filter((x) => x.m >= 4))
      .sort((a, b) => b.m - a.m).slice(0, 4).map(({ r, m }) => ({ id: r.id, nick: r.nick, multi: m, champ: r.c, win: Boolean(r.w) }));
    feed.push({ kind: 'together', at: e.at, members: e.members, n: pg.length, w: pg.filter((g) => g.win).length,
      run: longestRun(times), bonus: runBonusOf(times), multis, praise: groupPraiseOf(pg) });
  }
  // 하루 판 묶음 (회원 × KST 날짜), 가장 많이 한 챔프
  const sess = new Map<string, { r: any; n: number; w: number; at: number; champs: Map<number, number> }>();
  for (const r of rows) {
    if (grouped.has(r.g)) continue;
    const k = `${r.id}:${dayOf(r.t)}`;
    const e = sess.get(k) ?? { r, n: 0, w: 0, at: r.t, champs: new Map() };
    e.n++; e.w += r.w; e.at = Math.max(e.at, r.t); e.champs.set(r.c, (e.champs.get(r.c) ?? 0) + 1);
    sess.set(k, e);
  }
  for (const [k, e] of sess) {
    if (e.n < 2) continue; // 한 판은 묶음으로 내지 않는다 (근황이 너무 잘게 쪼개진다)
    const d = Number(k.split(':')[1]);
    const champ = [...e.champs].sort((a, b) => b[1] - a[1])[0][0];
    feed.push({ kind: 'session', at: e.at, ...face(e.r), n: e.n, w: e.w, champ, day: d === today ? 'today' : d === today - 1 ? 'yesterday' : 'before' });
  }
  // 펜타·쿼드라킬
  for (const r of rows) {
    if (grouped.has(r.g)) continue;
    const m = parseFeat(r.f)?.multi ?? 0;
    if (m >= 4) feed.push({ kind: 'multi', at: r.t, ...face(r), multi: m, champ: r.c, win: Boolean(r.w) });
  }
  // 연승 (지금 이어지는 4연승 이상, 최근 판 기준)
  const byMember = new Map<string, any[]>();
  const firsts: { at: number; f: Face; champ: number }[] = [];
  for (const r of rows) (byMember.get(r.id) ?? byMember.set(r.id, []).get(r.id)!).push(r);
  for (const list of byMember.values()) {
    let s = 0; for (const r of list) { if (r.w) s++; else break; }
    if (s >= 4) feed.push({ kind: 'streak', at: list[0].t, ...face(list[0]), streak: s });
    // 첫 기록 (3일 안에 처음 기록된 회원) — 같은 시간대에 여럿이면 아래에서 한 줄로 묶는다
    const first = list[list.length - 1];
    if (first.first >= since) firsts.push({ at: first.first, f: face(first), champ: first.c });
  }
  // 같은 시간(1시간 안)에 첫 기록이 여럿이면 한 줄 (예: 내전 한 판에 처음 들어온 사람들)
  firsts.sort((a, b) => a.at - b.at);
  for (let i = 0; i < firsts.length;) {
    let j = i + 1;
    while (j < firsts.length && firsts[j].at - firsts[i].at < 3600_000) j++;
    const grp = firsts.slice(i, j);
    if (grp.length === 1) feed.push({ kind: 'first', at: grp[0].at, ...grp[0].f, champ: grp[0].champ });
    else feed.push({ kind: 'firsts', at: grp[grp.length - 1].at, members: grp.map((x) => x.f) });
    i = j;
  }
  // 새 회원
  for (const r of joined.results as any[]) feed.push({ kind: 'joined', at: r.t, ...face(r) });

  // 오늘(KST) 요약: 플레이한 멤버 · 서로 다른 판 수 · 멤버 판 승패
  const todayRows = rows.filter((r) => dayOf(r.t) === today);
  const players = new Map<string, Face & { n: number }>();
  for (const r of todayRows) { const e = players.get(r.id) ?? { ...face(r), n: 0 }; e.n++; players.set(r.id, e); }
  const todaySum = {
    players: [...players.values()].sort((a, b) => b.n - a.n).map(({ n: _n, ...f }) => f),
    games: new Set(todayRows.map((r) => r.g)).size,
    n: todayRows.length,
    w: todayRows.reduce((a, r) => a + (r.w ? 1 : 0), 0),
  };

  feed.sort((a, b) => b.at - a.at);
  return json({ now: nowList, feed: feed.slice(0, 30), today: todaySum, at: now } satisfies Pulse);
}
