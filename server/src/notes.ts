/**
 * 한 줄 생각 — 회원이 남기는 짧은 방명록.
 * 실시간 대화는 디스코드·카카오톡이 맡는다. 여기는 지나가며 한 줄 남기는 곳.
 */
import { HttpError, json, type Env, type Member } from './util.js';

const NOTE_MAX = 60;
const NOTE_GAP = 30_000; // 같은 사람이 30초 안에 연달아 남기지 못하게

export function links(env: Env) {
  const ok = (u?: string) => (u && /^https:\/\//.test(u) ? u : null);
  return { discord: ok(env.DISCORD_INVITE_URL), kakao: ok(env.KAKAO_OPENCHAT_URL) };
}

export async function listNotes(env: Env, me: Member) {
  const r = await env.DB.prepare(
    `SELECT n.id, n.text, n.created_at AS createdAt, m.nick, n.member_id = ?1 AS mine
     FROM notes n JOIN members m ON m.id = n.member_id
     WHERE n.deleted_at IS NULL ORDER BY n.created_at DESC LIMIT 40`,
  )
    .bind(me.id)
    .all();
  return json({ notes: r.results, max: NOTE_MAX });
}

export async function addNote(req: Request, env: Env, me: Member) {
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  const t = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (!t) throw new HttpError(400, '내용을 입력해주세요.');
  if ([...t].length > NOTE_MAX) throw new HttpError(400, `${NOTE_MAX}자까지 남길 수 있습니다.`);
  const last = await env.DB.prepare('SELECT MAX(created_at) AS t FROM notes WHERE member_id = ?').bind(me.id).first<{ t: number | null }>();
  if (last?.t && Date.now() - last.t < NOTE_GAP) throw new HttpError(429, '조금 뒤에 다시 남겨주세요.');
  await env.DB.prepare('INSERT INTO notes (member_id, text, created_at) VALUES (?, ?, ?)').bind(me.id, t, Date.now()).run();
  return json({ ok: true });
}

export async function deleteNote(env: Env, me: Member, id: number) {
  const r = await env.DB.prepare('UPDATE notes SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL AND (member_id = ? OR ? = 1)')
    .bind(Date.now(), id, me.id, me.tier === 'admin' ? 1 : 0)
    .run();
  if (r.meta.changes === 0) throw new HttpError(404, '지울 수 있는 글이 없습니다.');
  return json({ ok: true });
}
