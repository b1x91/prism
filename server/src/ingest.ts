/**
 * POST /api/ingest — 모든 수집원 공통 입구 (CLAUDE.md 7-1).
 *   1. 아수라장 큐(2400)와 커스텀 아수라장만 받는다 (커스텀은 10명 모두 사람·5분 이상, 판수 부풀리기 방지).
 *      이미 있는 판은 다시 저장하지 않되, 빠진 회원 기록(나중에 동의한 회원)은 채운다.
 *   2. 10명 전원으로 팀 합계 계산 (있는 필드만).
 *   3. puuid ↔ members.riot_puuid 대조 → crew.
 *   4. matches 1건 + 회원 participants 저장.
 *      비회원은 '포텐 멤버' 후보만 남긴다 (v3.10): 회원과 같은 팀이었거나 사용자 설정 판이면 prospect_games.
 *      판 상세용으로 10명 전체의 그 판 기록(롤 이름·챔프·KDA·피해·아이템·증강)은 matches.players 에 둔다 (v3.44, puuid 는 남기지 않음).
 *   5. 같은 팀 5명 수치가 모두 있을 때만 점유율 계산.
 */
import { featOf, type FeatSource } from '../../packages/core/src/challenges.js';
import { finite, HttpError, int, json, type Env, type Member } from './util.js';

const MAYHEM_QUEUE = 2400;
const MAX_GAMES = 50;

type InParticipant = {
  puuid: string;
  riotId?: string;
  championId: number;
  teamId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  damageToChampions?: number;
  damageTaken?: number;
  goldEarned?: number;
  augments?: number[];
  items?: number[];
  // 도감 역할 챌린지용 (있는 값만)
  largestMultiKill?: number;
  pentaKills?: number;
  quadraKills?: number;
  ccTime?: number;
  healsOnTeammates?: number;
  shieldsOnTeammates?: number;
};
type InGame = { gameId: number; queueId: number; gameType?: string; gameMode?: string; mapId?: number; playedAt: number; duration: number; participants: InParticipant[] };

const CUSTOM_MIN_SECONDS = 300;

/** 커스텀 아수라장: 커스텀 게임 + 증강 기록 있음 + 아레나 아님 + 5분 이상 (10명 모두 사람인지는 validGame 이 puuid 로 본다) */
const isCustomMayhem = (g: InGame) =>
  (g.gameType === 'CUSTOM_GAME' || g.queueId === 0) &&
  g.gameMode !== 'CHERRY' &&
  g.mapId !== 30 &&
  g.duration >= CUSTOM_MIN_SECONDS &&
  g.participants.some((p) => (ids(p.augments) ?? []).length > 0);

type TeamTotal = { win: boolean; kills: number; damageToChampions?: number; damageTaken?: number; goldEarned?: number; champions?: number[] };

const sumIfAll = (ps: InParticipant[], f: (p: InParticipant) => number | null | undefined) => {
  const vs = ps.map(f);
  return vs.every((v) => typeof v === 'number') ? (vs as number[]).reduce((a, b) => a + b, 0) : undefined;
};

const ids = (v: unknown): number[] | null => (Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x) && x > 0) : null);

function validGame(g: any): g is InGame {
  return (
    int(g?.gameId) !== null &&
    int(g?.queueId) !== null &&
    finite(g?.playedAt) !== null &&
    finite(g?.duration) !== null &&
    Array.isArray(g?.participants) &&
    g.participants.length === 10 &&
    g.participants.every(
      (p: any) =>
        typeof p?.puuid === 'string' &&
        p.puuid.length > 0 &&
        int(p.championId) !== null &&
        (p.teamId === 100 || p.teamId === 200) &&
        typeof p.win === 'boolean' &&
        int(p.kills) !== null &&
        int(p.deaths) !== null &&
        int(p.assists) !== null,
    )
  );
}

export async function ingest(req: Request, env: Env, me: Member) {
  if (!me.opt_in_at) throw new HttpError(403, '수집 동의가 필요합니다.');
  const payload = (await req.json().catch(() => null)) as { source?: string; games?: unknown[] } | null;
  if (!payload || !Array.isArray(payload.games)) throw new HttpError(400, 'games 가 없습니다.');
  if (payload.games.length > MAX_GAMES) throw new HttpError(413, `한 번에 ${MAX_GAMES}판까지 보낼 수 있습니다.`);
  const source = payload.source === 'lcu' ? 'lcu' : 'unknown';

  // accepted: 받아들인 판 ID (새로 저장 + 이미 있음). 앱은 이 판들만 '보냈음'으로 표시한다
  const result = { received: payload.games.length, stored: 0, duplicate: 0, skipped: 0, crewGames: 0, accepted: [] as number[] };
  const games = payload.games.filter((g): g is InGame => {
    const ok = validGame(g) && (g.queueId === MAYHEM_QUEUE || isCustomMayhem(g));
    if (!ok) result.skipped++;
    return ok;
  });
  if (games.length === 0) return json(result);

  // 이미 있는 판 제외 (여러 회원 앱이 같은 판을 보내도 1회)
  const existing = new Set<number>();
  const gameIds = games.map((g) => g.gameId);
  const { results: ex } = await env.DB.prepare(`SELECT game_id FROM matches WHERE game_id IN (${gameIds.map(() => '?').join(',')})`)
    .bind(...gameIds)
    .all<{ game_id: number }>();
  for (const r of ex) existing.add(r.game_id);

  // 이번 요청에 등장한 puuid 중 동의한 회원만
  const puuids = [...new Set(games.flatMap((g) => g.participants.map((p) => p.puuid)))];
  const memberByPuuid = new Map<string, string>(); // 수집에 동의한 회원
  const linked = new Set<string>(); // 롤 계정을 연결한 회원 전체 (동의를 철회했어도 포텐 멤버로 모으지 않는다)
  for (let i = 0; i < puuids.length; i += 90) {
    const chunk = puuids.slice(i, i + 90);
    const { results } = await env.DB.prepare(`SELECT id, riot_puuid, opt_in_at FROM members WHERE riot_puuid IN (${chunk.map(() => '?').join(',')})`)
      .bind(...chunk)
      .all<{ id: string; riot_puuid: string; opt_in_at: number | null }>();
    for (const r of results) {
      linked.add(r.riot_puuid);
      if (r.opt_in_at !== null) memberByPuuid.set(r.riot_puuid, r.id);
    }
  }

  const now = Date.now();
  const perGame: D1PreparedStatement[][] = [];
  const seenInRequest = new Set<number>();
  for (const g of games) {
    if (seenInRequest.has(g.gameId)) continue;
    seenInRequest.add(g.gameId);
    result.accepted.push(g.gameId);
    // 이미 있는 판이어도 회원 기록은 넣는다: 다른 회원이 먼저 올렸을 때 아직 동의 전이던 회원이 나중에 동의하면 빠지지 않도록 (모두 INSERT OR IGNORE)
    const dup = existing.has(g.gameId);
    if (dup) result.duplicate++;

    const teams: Record<'100' | '200', InParticipant[]> = { '100': [], '200': [] };
    for (const p of g.participants) teams[String(p.teamId) as '100' | '200'].push(p);
    const totals: Record<string, TeamTotal> = {};
    for (const [t, ps] of Object.entries(teams)) {
      totals[t] = {
        win: ps.some((p) => p.win),
        kills: ps.reduce((a, p) => a + p.kills, 0),
        damageToChampions: sumIfAll(ps, (p) => finite(p.damageToChampions)),
        damageTaken: sumIfAll(ps, (p) => finite(p.damageTaken)),
        goldEarned: sumIfAll(ps, (p) => finite(p.goldEarned)),
        // 팀 조합 (챔피언 번호만, 누가 했는지는 남기지 않는다): 판 복기의 조합 피드백용
        champions: ps.map((p) => Number(p.championId)).filter((id) => Number.isInteger(id) && id > 0),
      };
    }

    // 판 상세용 10명 (puuid 없이)
    const players = JSON.stringify(g.participants.map((p) => ({
      name: typeof p.riotId === 'string' ? p.riotId.slice(0, 40) : null, championId: p.championId, teamId: p.teamId, win: p.win,
      kills: p.kills, deaths: p.deaths, assists: p.assists, damageToChampions: finite(p.damageToChampions), damageTaken: finite(p.damageTaken),
      goldEarned: finite(p.goldEarned), items: ids(p.items) ?? [], augments: ids(p.augments) ?? [],
    })));

    const crew = g.participants.filter((p) => memberByPuuid.has(p.puuid));
    if (crew.length >= 2 && !dup) result.crewGames++;
    const stmts: D1PreparedStatement[] = [];
    perGame.push(stmts);
    stmts.push(
      env.DB.prepare(
        'INSERT OR IGNORE INTO matches (game_id, queue_id, played_at, duration, source, collected_by, crew_count, team_totals, players, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(g.gameId, g.queueId, g.playedAt, g.duration, source, me.id, crew.length, JSON.stringify(totals), players, now),
    );
    if (dup) stmts.push(env.DB.prepare('UPDATE matches SET crew_count = MAX(crew_count, ?) WHERE game_id = ?').bind(crew.length, g.gameId));
    // 예전에 조합 없이 들어온 판이면 양 팀 챔피언 번호를 채운다 (판 복기용)
    // 예전에 회원 것만 들어온 판이면 10명 기록을 채운다
    if (dup) stmts.push(env.DB.prepare('UPDATE matches SET players = ? WHERE game_id = ? AND players IS NULL').bind(players, g.gameId));
    if (dup) stmts.push(env.DB.prepare("UPDATE matches SET team_totals = ? WHERE game_id = ? AND team_totals NOT LIKE '%champions%'").bind(JSON.stringify(totals), g.gameId));

    // 활약 기록의 재료: 10명 전체 (순위를 가리려고). 회원 것만 저장하고 나머지는 버린다
    const featSrc = (p: InParticipant): FeatSource => ({
      teamId: p.teamId, win: p.win, kills: p.kills, deaths: p.deaths, items: ids(p.items) ?? [],
      damageToChampions: finite(p.damageToChampions) ?? undefined, damageTaken: finite(p.damageTaken) ?? undefined,
      largestMultiKill: finite(p.largestMultiKill) ?? undefined, pentaKills: finite(p.pentaKills) ?? undefined, quadraKills: finite(p.quadraKills) ?? undefined,
      ccTime: finite(p.ccTime) ?? undefined, healsOnTeammates: finite(p.healsOnTeammates) ?? undefined, shieldsOnTeammates: finite(p.shieldsOnTeammates) ?? undefined,
    });
    const allSrc = g.participants.map(featSrc);
    for (const p of crew) {
      const memberId = memberByPuuid.get(p.puuid)!;
      const team = teams[String(p.teamId) as '100' | '200'];
      const tt = totals[String(p.teamId)];
      const full = team.length === 5;
      const share = (mine: number | null, total: number | undefined) => (full && mine !== null && total ? mine / total / 0.2 : null);
      const augments = ids(p.augments);
      const items = ids(p.items);
      stmts.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO participants (game_id, member_id, champion_id, team_id, win, kills, deaths, assists, dmg_champ, dmg_taken, gold,
             items, augments, share_deal, share_tank, share_growth, kp, played_at, crew_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          g.gameId,
          memberId,
          p.championId,
          p.teamId,
          p.win ? 1 : 0,
          p.kills,
          p.deaths,
          p.assists,
          finite(p.damageToChampions),
          finite(p.damageTaken),
          finite(p.goldEarned),
          items ? JSON.stringify(items) : null,
          augments ? JSON.stringify(augments) : null,
          share(finite(p.damageToChampions), tt.damageToChampions),
          share(finite(p.damageTaken), tt.damageTaken),
          share(finite(p.goldEarned), tt.goldEarned),
          tt.kills > 0 ? (p.kills + p.assists) / tt.kills : null,
          g.playedAt,
          crew.length,
        ),
      );
      // 활약 기록: 새 판이든, 기록 없이 먼저 들어온 판이든 비어 있으면 채운다
      stmts.push(env.DB.prepare('UPDATE participants SET feats = ? WHERE game_id = ? AND member_id = ? AND feats IS NULL').bind(JSON.stringify(featOf(featSrc(p), allSrc)), g.gameId, memberId));
      for (const a of new Set(augments ?? [])) {
        stmts.push(
          env.DB.prepare('INSERT OR IGNORE INTO participant_augments (game_id, member_id, augment_id, champion_id, win) VALUES (?, ?, ?, ?, ?)').bind(
            g.gameId,
            memberId,
            a,
            p.championId,
            p.win ? 1 : 0,
          ),
        );
      }
      stmts.push(
        env.DB.prepare('UPDATE members SET last_played_at = MAX(COALESCE(last_played_at, 0), ?1), riot_id = COALESCE(?2, riot_id), nick = COALESCE(?2, nick) WHERE id = ?3').bind(
          g.playedAt,
          typeof p.riotId === 'string' && p.riotId.includes('#') ? p.riotId : null,
          memberId,
        ),
      );
    }
    // 포텐 멤버 후보: 회원이 1명 이상 있는 판에서, 회원과 같은 팀이었거나 사용자 설정(내전) 판에 함께한 비회원
    if (crew.length > 0) {
      const custom = g.queueId !== MAYHEM_QUEUE;
      for (const p of g.participants) {
        if (memberByPuuid.has(p.puuid) || linked.has(p.puuid)) continue;
        const mates = crew.filter((c) => c.teamId === p.teamId).length;
        if (!custom && mates === 0) continue;
        const augments = ids(p.augments), items = ids(p.items);
        stmts.push(
          env.DB.prepare(
            `INSERT OR IGNORE INTO prospect_games (puuid, game_id, riot_id, champion_id, team_id, win, kills, deaths, assists, dmg_champ, dmg_taken, gold, items, augments, played_at, custom, with_members, crew_count)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(
            p.puuid, g.gameId, typeof p.riotId === 'string' && p.riotId.includes('#') ? p.riotId : null, p.championId, p.teamId, p.win ? 1 : 0,
            p.kills, p.deaths, p.assists, finite(p.damageToChampions), finite(p.damageTaken), finite(p.goldEarned),
            items ? JSON.stringify(items) : null, augments ? JSON.stringify(augments) : null, g.playedAt, custom ? 1 : 0, mates, crew.length,
          ),
        );
      }
    }
    if (!dup) result.stored++;
  }

  // D1 batch 는 트랜잭션으로 실행된다. 한 판이 두 트랜잭션으로 갈라지지 않도록 판 단위로 묶어 보낸다
  let chunk: D1PreparedStatement[] = [];
  for (const stmts of perGame) {
    if (chunk.length + stmts.length > 400) {
      await env.DB.batch(chunk);
      chunk = [];
    }
    chunk.push(...stmts);
  }
  if (chunk.length) await env.DB.batch(chunk);
  return json(result);
}
