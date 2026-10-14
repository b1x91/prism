/**
 * 내전: 우리끼리 5:5 (사용자 설정 게임).
 * - 여는 사람: 관리자 또는 디스코드 역할 SCRIM_HOST_ROLES 를 가진 회원 (canHostScrim)
 * - 참여/빠지기 원탭, 10자리. 팀이 확정되면 참여·빠지기를 막는다 (연 사람이 '팀 다시'로 풀 수 있음)
 * - 팀 나누기: Prism 기록 승률(판수가 적으면 50%에 가깝게 보정)의 합이 가장 비슷한 조합 중 하나를 고른다
 * - 결과: 시작 30분 전 ~ 6시간 뒤에 기록된 사용자 설정 판 중, 이 내전 참가자가 6명 이상인 판을 자동으로 찾아 점수로 보여준다
 */
import { FACE, HttpError, canHostScrim, json, type Env, type Member } from './util.js';

const SIZE = 10;
const NOTE_MAX = 40;
const SHOW_AFTER_START = 6 * 3600_000;
const MAX_AHEAD = 14 * 24 * 3600_000;

type Slot = { id: string; nick: string; skin: number | null; main: number | null; team: number | null; n: number; w: number };

/** 승률 보정: 판이 적으면 50% 쪽으로 (5승 5패를 미리 깔고 계산) */
const rating = (s: { n: number; w: number }) => (s.w + 5) / (s.n + 10);

async function slotsOf(env: Env, ids: number[]) {
  if (!ids.length) return new Map<number, Slot[]>();
  const { results } = await env.DB.prepare(
    `SELECT s.scrim_id AS scrimId, s.team, m.id, m.nick, ${FACE('m')},
       (SELECT COUNT(*) FROM participants p WHERE p.member_id = m.id) AS n,
       (SELECT COALESCE(SUM(win), 0) FROM participants p WHERE p.member_id = m.id) AS w
     FROM scrim_slots s JOIN members m ON m.id = s.member_id
     WHERE s.scrim_id IN (${ids.map(() => '?').join(',')}) ORDER BY s.joined_at`,
  ).bind(...ids).all<Slot & { scrimId: number }>();
  const by = new Map<number, Slot[]>();
  for (const { scrimId, ...s } of results) by.set(scrimId, [...(by.get(scrimId) ?? []), s]);
  return by;
}

/** 기록된 사용자 설정 판에서 이 내전의 결과 찾기 */
async function resultsOf(env: Env, startAt: number, slots: Slot[]) {
  const teamOf = new Map(slots.filter((s) => s.team).map((s) => [s.id, s.team!]));
  if (teamOf.size < 6) return [];
  const ids = [...teamOf.keys()];
  const { results } = await env.DB.prepare(
    `SELECT p.game_id AS gameId, x.played_at AS at, x.duration, p.member_id AS memberId, p.team_id AS side, p.win
     FROM participants p JOIN matches x ON x.game_id = p.game_id
     WHERE x.queue_id <> 2400 AND x.played_at BETWEEN ? AND ? AND p.member_id IN (${ids.map(() => '?').join(',')})
     ORDER BY x.played_at`,
  ).bind(startAt - 30 * 60_000, startAt + SHOW_AFTER_START, ...ids).all<{ gameId: number; at: number; duration: number; memberId: string; side: number; win: number }>();
  const games = new Map<number, typeof results>();
  for (const r of results) games.set(r.gameId, [...(games.get(r.gameId) ?? []), r]);
  const out: { gameId: number; at: number; duration: number; winner: 1 | 2 }[] = [];
  for (const [gameId, rows] of games) {
    if (rows.length < 6) continue;
    // 블루팀(1) 회원이 많이 있는 진영의 승패로 판정
    const blue = rows.filter((r) => teamOf.get(r.memberId) === 1);
    if (!blue.length) continue;
    const blueWon = blue.filter((r) => r.win === 1).length * 2 > blue.length;
    out.push({ gameId, at: rows[0].at, duration: rows[0].duration, winner: blueWon ? 1 : 2 });
  }
  return out.slice(0, 7);
}

export async function listScrims(env: Env, me: Member) {
  const now = Date.now();
  const { results: ss } = await env.DB.prepare(
    `SELECT id, start_at AS startAt, note, host_id AS hostId, locked_at AS lockedAt FROM scrims
     WHERE cancelled_at IS NULL AND start_at >= ? ORDER BY start_at LIMIT 10`,
  ).bind(now - SHOW_AFTER_START).all<{ id: number; startAt: number; note: string; hostId: string; lockedAt: number | null }>();
  const by = await slotsOf(env, ss.map((s) => s.id));
  const scrims = [];
  for (const s of ss) {
    const slots = by.get(s.id) ?? [];
    scrims.push({
      ...s,
      members: slots.map((x) => ({ ...x, rating: Math.round(rating(x) * 1000) / 1000 })),
      mine: slots.some((x) => x.id === me.id),
      host: s.hostId === me.id || me.tier === 'admin',
      results: s.lockedAt ? await resultsOf(env, s.startAt, slots) : [],
    });
  }
  return json({ size: SIZE, now, canHost: canHostScrim(env, me), scrims });
}

export async function openScrim(req: Request, env: Env, me: Member) {
  if (!canHostScrim(env, me)) throw new HttpError(403, '내전은 정해진 디스코드 역할이 있는 회원만 열 수 있습니다.');
  const { startAt, note } = (await req.json().catch(() => ({}))) as { startAt?: number; note?: string };
  const now = Date.now();
  if (typeof startAt !== 'number' || !Number.isFinite(startAt)) throw new HttpError(400, '시간을 골라주세요.');
  if (startAt < now - 10 * 60_000 || startAt > now + MAX_AHEAD) throw new HttpError(400, '지금부터 14일 안의 시간만 열 수 있습니다.');
  const t = typeof note === 'string' ? note.replace(/\s+/g, ' ').trim() : '';
  if ([...t].length > NOTE_MAX) throw new HttpError(400, `메모는 ${NOTE_MAX}자까지입니다.`);
  const r = await env.DB.prepare('INSERT INTO scrims (host_id, start_at, note, created_at) VALUES (?, ?, ?, ?) RETURNING id').bind(me.id, Math.round(startAt), t, now).first<{ id: number }>();
  await env.DB.prepare('INSERT INTO scrim_slots (scrim_id, member_id, joined_at) VALUES (?, ?, ?)').bind(r!.id, me.id, now).run();
  return json({ ok: true, id: r!.id });
}

async function scrim(env: Env, id: number) {
  const s = await env.DB.prepare('SELECT id, host_id AS hostId, start_at AS startAt, locked_at AS lockedAt FROM scrims WHERE id = ? AND cancelled_at IS NULL')
    .bind(id).first<{ id: number; hostId: string; startAt: number; lockedAt: number | null }>();
  if (!s || s.startAt < Date.now() - SHOW_AFTER_START) throw new HttpError(404, '이미 끝났거나 취소된 내전입니다.');
  return s;
}
const isHost = (s: { hostId: string }, me: Member) => s.hostId === me.id || me.tier === 'admin';

export async function scrimAction(req: Request, env: Env, me: Member, id: number, action: string) {
  const s = await scrim(env, id);
  const now = Date.now();
  switch (action) {
    case 'join': {
      if (s.lockedAt) throw new HttpError(409, '팀이 확정된 내전입니다.');
      const r = await env.DB.prepare(
        `INSERT OR IGNORE INTO scrim_slots (scrim_id, member_id, joined_at)
         SELECT ?1, ?2, ?3 WHERE (SELECT COUNT(*) FROM scrim_slots WHERE scrim_id = ?1) < ?4`,
      ).bind(id, me.id, now, SIZE).run();
      if (r.meta.changes === 0 && !(await env.DB.prepare('SELECT 1 FROM scrim_slots WHERE scrim_id = ? AND member_id = ?').bind(id, me.id).first()))
        throw new HttpError(409, '자리가 다 찼습니다.');
      break;
    }
    case 'leave':
      if (s.hostId === me.id) throw new HttpError(400, '연 사람은 빠질 수 없습니다. 내전을 취소해주세요.');
      if (s.lockedAt) throw new HttpError(409, '팀이 확정된 뒤에는 연 사람에게 말해 팀을 다시 풀어야 합니다.');
      await env.DB.prepare('DELETE FROM scrim_slots WHERE scrim_id = ? AND member_id = ?').bind(id, me.id).run();
      // 누가 빠지면 나눠둔 팀은 다시 나눠야 한다
      await env.DB.prepare('UPDATE scrim_slots SET team = NULL WHERE scrim_id = ?').bind(id).run();
      break;
    case 'cancel':
      if (!isHost(s, me)) throw new HttpError(403, '연 사람만 취소할 수 있습니다.');
      await env.DB.prepare('UPDATE scrims SET cancelled_at = ? WHERE id = ?').bind(now, id).run();
      break;
    case 'balance': {
      if (!isHost(s, me)) throw new HttpError(403, '연 사람만 팀을 나눌 수 있습니다.');
      if (s.lockedAt) throw new HttpError(409, '팀을 다시 풀고 나눠주세요.');
      const slots = (await slotsOf(env, [id])).get(id) ?? [];
      if (slots.length < 2 || slots.length % 2) throw new HttpError(400, '짝수 인원(2~10명)일 때 나눌 수 있습니다.');
      const teams = balance(slots);
      await env.DB.batch(slots.map((x, i) => env.DB.prepare('UPDATE scrim_slots SET team = ? WHERE scrim_id = ? AND member_id = ?').bind(teams[i], id, x.id)));
      break;
    }
    case 'swap': {
      if (!isHost(s, me)) throw new HttpError(403, '연 사람만 바꿀 수 있습니다.');
      if (s.lockedAt) throw new HttpError(409, '팀을 다시 풀고 바꿔주세요.');
      const { a, b } = (await req.json().catch(() => ({}))) as { a?: string; b?: string };
      const rows = await env.DB.prepare('SELECT member_id AS id, team FROM scrim_slots WHERE scrim_id = ? AND member_id IN (?, ?)').bind(id, a ?? '', b ?? '').all<{ id: string; team: number | null }>();
      if (rows.results.length !== 2) throw new HttpError(400, '두 사람을 골라주세요.');
      const [x, y] = rows.results;
      await env.DB.batch([
        env.DB.prepare('UPDATE scrim_slots SET team = ? WHERE scrim_id = ? AND member_id = ?').bind(y.team, id, x.id),
        env.DB.prepare('UPDATE scrim_slots SET team = ? WHERE scrim_id = ? AND member_id = ?').bind(x.team, id, y.id),
      ]);
      break;
    }
    case 'lock': {
      if (!isHost(s, me)) throw new HttpError(403, '연 사람만 확정할 수 있습니다.');
      const open = await env.DB.prepare('SELECT COUNT(*) AS n FROM scrim_slots WHERE scrim_id = ? AND team IS NULL').bind(id).first<{ n: number }>();
      if ((open?.n ?? 1) > 0) throw new HttpError(400, '먼저 팀을 나눠주세요.');
      await env.DB.prepare('UPDATE scrims SET locked_at = ? WHERE id = ?').bind(now, id).run();
      break;
    }
    case 'unlock':
      if (!isHost(s, me)) throw new HttpError(403, '연 사람만 풀 수 있습니다.');
      await env.DB.prepare('UPDATE scrims SET locked_at = NULL WHERE id = ?').bind(id).run();
      break;
    default:
      throw new HttpError(404, 'not found');
  }
  return json({ ok: true });
}

/**
 * 팀 나누기: 모든 반반 조합(10명이면 126가지) 중 보정 승률 합의 차이가 가장 작은 것들 가운데 하나를 무작위로.
 * 무작위를 섞는 이유: 매번 같은 팀만 나오지 않게 ('다시 나누기'를 누르면 비슷한 다른 조합)
 */
export function balance(slots: { n: number; w: number }[]): number[] {
  const r = slots.map(rating);
  const k = slots.length / 2, total = r.reduce((a, b) => a + b, 0);
  const combos: { mask: number; diff: number }[] = [];
  const walk = (i: number, picked: number, mask: number, sum: number) => {
    if (picked === k) { combos.push({ mask, diff: Math.abs(total - 2 * sum) }); return; }
    if (i >= slots.length) return;
    walk(i + 1, picked + 1, mask | (1 << i), sum + r[i]);
    if (i > 0) walk(i + 1, picked, mask, sum); // 0번은 늘 블루에 (뒤집은 같은 조합을 한 번만)
  };
  walk(0, 0, 0, 0);
  const best = Math.min(...combos.map((c) => c.diff));
  const near = combos.filter((c) => c.diff <= best + 0.02);
  const pick = near[Math.floor(Math.random() * near.length)];
  // 0번이 늘 블루면 재미없으니 진영도 무작위로
  const flip = Math.random() < 0.5;
  return slots.map((_, i) => ((pick.mask >> i) & 1 ? 1 : 2)).map((t) => (flip ? 3 - t : t));
}
