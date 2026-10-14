/**
 * 같이 할 판 모집 (CLAUDE.md 9-3).
 * - 판 열기: 시간 + 선택적 한 줄 메모. 연 사람은 자동으로 첫 자리.
 * - 참여/빠지기: 원탭, 확인 없음. 5자리가 차면 '출발'.
 * - 연 사람이 빠지면 다음으로 일찍 들어온 사람이 이어받는다. 아무도 없으면 취소.
 * - 시작 시각 90분이 지나면 목록에서 빠진다 (따로 닫을 필요 없음).
 */
import { can } from './roles.js';
import { FACE, HttpError, json, type Env, type Member } from './util.js';

const SIZE = 5;
const NOTE_MAX = 40;
const SHOW_AFTER_START = 90 * 60_000; // 시작 뒤 90분까지 보인다
const MAX_AHEAD = 7 * 24 * 3600_000;
const MAX_OPEN_PER_HOST = 3;

type Face = { id: string; nick: string; skin: number | null; main: number | null };

export async function listParties(env: Env, me: Member) {
  const now = Date.now();
  const { results: ps } = await env.DB.prepare(
    `SELECT p.id, p.start_at AS startAt, p.note, p.host_id AS hostId, p.created_at AS createdAt
     FROM parties p WHERE p.cancelled_at IS NULL AND p.start_at >= ? ORDER BY p.start_at LIMIT 20`,
  ).bind(now - SHOW_AFTER_START).all<{ id: number; startAt: number; note: string; hostId: string; createdAt: number }>();
  if (!ps.length) return json({ parties: [], size: SIZE, now });
  const ids = ps.map((p) => p.id);
  const { results: slots } = await env.DB.prepare(
    `SELECT s.party_id AS partyId, m.id, m.nick, ${FACE('m')} FROM party_slots s JOIN members m ON m.id = s.member_id
     WHERE s.party_id IN (${ids.map(() => '?').join(',')}) ORDER BY s.joined_at`,
  ).bind(...ids).all<Face & { partyId: number }>();
  const by = new Map<number, Face[]>();
  for (const s of slots) {
    const { partyId, ...f } = s;
    by.set(partyId, [...(by.get(partyId) ?? []), f]);
  }
  return json({
    size: SIZE,
    now,
    parties: ps.map((p) => {
      const members = by.get(p.id) ?? [];
      return { ...p, members, mine: members.some((x) => x.id === me.id), host: p.hostId === me.id };
    }),
  });
}

export async function openParty(req: Request, env: Env, me: Member) {
  const { startAt, note } = (await req.json().catch(() => ({}))) as { startAt?: number; note?: string };
  const now = Date.now();
  if (typeof startAt !== 'number' || !Number.isFinite(startAt)) throw new HttpError(400, '시간을 골라주세요.');
  if (startAt < now - 10 * 60_000 || startAt > now + MAX_AHEAD) throw new HttpError(400, '지금부터 7일 안의 시간만 열 수 있습니다.');
  const t = typeof note === 'string' ? note.replace(/\s+/g, ' ').trim() : '';
  if ([...t].length > NOTE_MAX) throw new HttpError(400, `메모는 ${NOTE_MAX}자까지입니다.`);
  const open = await env.DB.prepare('SELECT COUNT(*) AS n FROM parties WHERE host_id = ? AND cancelled_at IS NULL AND start_at >= ?')
    .bind(me.id, now - SHOW_AFTER_START).first<{ n: number }>();
  if ((open?.n ?? 0) >= MAX_OPEN_PER_HOST) throw new HttpError(429, `한 사람이 동시에 ${MAX_OPEN_PER_HOST}판까지 열 수 있습니다.`);
  const r = await env.DB.prepare('INSERT INTO parties (host_id, start_at, note, created_at) VALUES (?, ?, ?, ?) RETURNING id')
    .bind(me.id, Math.round(startAt), t, now).first<{ id: number }>();
  await env.DB.prepare('INSERT INTO party_slots (party_id, member_id, joined_at) VALUES (?, ?, ?)').bind(r!.id, me.id, now).run();
  return json({ ok: true, id: r!.id });
}

async function active(env: Env, id: number) {
  const p = await env.DB.prepare('SELECT id, host_id AS hostId, start_at AS startAt FROM parties WHERE id = ? AND cancelled_at IS NULL')
    .bind(id).first<{ id: number; hostId: string; startAt: number }>();
  if (!p || p.startAt < Date.now() - SHOW_AFTER_START) throw new HttpError(404, '이미 끝났거나 취소된 판입니다.');
  return p;
}

export async function joinParty(env: Env, me: Member, id: number) {
  await active(env, id);
  // 자리 수 확인과 넣기를 한 문장으로 (동시에 눌러도 5명을 넘지 않게)
  const r = await env.DB.prepare(
    `INSERT OR IGNORE INTO party_slots (party_id, member_id, joined_at)
     SELECT ?1, ?2, ?3 WHERE (SELECT COUNT(*) FROM party_slots WHERE party_id = ?1) < ?4`,
  ).bind(id, me.id, Date.now(), SIZE).run();
  if (r.meta.changes === 0) {
    const already = await env.DB.prepare('SELECT 1 FROM party_slots WHERE party_id = ? AND member_id = ?').bind(id, me.id).first();
    if (!already) throw new HttpError(409, '자리가 다 찼습니다.');
  }
  return json({ ok: true });
}

export async function leaveParty(env: Env, me: Member, id: number) {
  const p = await active(env, id);
  await env.DB.prepare('DELETE FROM party_slots WHERE party_id = ? AND member_id = ?').bind(id, me.id).run();
  if (p.hostId === me.id) {
    const next = await env.DB.prepare('SELECT member_id AS id FROM party_slots WHERE party_id = ? ORDER BY joined_at LIMIT 1').bind(id).first<{ id: string }>();
    if (next) await env.DB.prepare('UPDATE parties SET host_id = ? WHERE id = ?').bind(next.id, id).run();
    else await env.DB.prepare('UPDATE parties SET cancelled_at = ? WHERE id = ?').bind(Date.now(), id).run();
  }
  return json({ ok: true });
}

export async function cancelParty(env: Env, me: Member, id: number) {
  const r = await env.DB.prepare('UPDATE parties SET cancelled_at = ? WHERE id = ? AND cancelled_at IS NULL AND (host_id = ? OR ? = 1)')
    .bind(Date.now(), id, me.id, can(me, 'moderate') ? 1 : 0).run();
  if (r.meta.changes === 0) throw new HttpError(404, '취소할 수 있는 판이 없습니다.');
  return json({ ok: true });
}
