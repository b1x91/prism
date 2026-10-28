/**
 * 앱 자동 진단 (CLAUDE.md v3.64). 게임 위 작은 창이 한 판 내내 안 뜨면 앱이 그 판의 인식 기록(모니터 수·위치·배율·실패 이유·
 * 읽은 글자 몇 줄)을 보낸다. 세 칸을 못 채운 고르기는 끝까지 못 읽은 카드 그림(카드 한 장만, 작게 줄인 JPEG, 판마다 최대 4장, v3.115)도 함께 온다.
 * 회원마다 최근 20개만 남기고, 관리자만 본다.
 */
import { HttpError, json, type Env, type Member } from './util.js';

const KEEP = 20;
const MAX_BYTES = 400_000;

export async function saveDiag(req: Request, env: Env, me: Member): Promise<Response> {
  const text = await req.text();
  if (text.length > MAX_BYTES) throw new HttpError(413, '너무 큽니다');
  try { JSON.parse(text); } catch { throw new HttpError(400, 'JSON 이 아닙니다'); }
  // 하루 30개까지 (문제가 반복돼도 서버를 채우지 않게)
  const day = await env.DB.prepare('SELECT COUNT(*) n FROM diag WHERE member_id = ? AND at > ?').bind(me.id, Date.now() - 86_400_000).first<{ n: number }>();
  if ((day?.n ?? 0) >= 30) return json({ ok: true, skipped: true });
  await env.DB.batch([
    env.DB.prepare('INSERT INTO diag (member_id, at, body) VALUES (?, ?, ?)').bind(me.id, Date.now(), text),
    env.DB.prepare('DELETE FROM diag WHERE member_id = ? AND id NOT IN (SELECT id FROM diag WHERE member_id = ? ORDER BY at DESC LIMIT ?)').bind(me.id, me.id, KEEP),
  ]);
  return json({ ok: true });
}

export async function listDiag(env: Env, me: Member): Promise<Response> {
  if (me.tier !== 'admin') throw new HttpError(403, '관리자만 볼 수 있어요');
  const r = await env.DB.prepare('SELECT d.id, d.member_id, d.at, d.body, m.nick FROM diag d LEFT JOIN members m ON m.id = d.member_id ORDER BY d.at DESC LIMIT 100').all<{ id: number; member_id: string; at: number; body: string; nick: string | null }>();
  // 목록에는 그림을 빼고 장 수만 (그림은 한 건씩 /api/admin/diag/:id/shots)
  return json({ items: (r.results ?? []).map((x) => {
    const body = JSON.parse(x.body);
    const shots = Array.isArray(body?.diag?.shots) ? body.diag.shots.length : 0;
    if (body?.diag) delete body.diag.shots;
    return { id: x.id, member: x.member_id, nick: x.nick, at: x.at, body, shots };
  }) });
}

/** GET /api/admin/diag/:id/shots — 놓친 카드 그림 (관리자만) */
export async function diagShots(env: Env, me: Member, id: number): Promise<Response> {
  if (me.tier !== 'admin') throw new HttpError(403, '관리자만 볼 수 있어요');
  const r = await env.DB.prepare('SELECT body FROM diag WHERE id = ?').bind(id).first<{ body: string }>();
  if (!r) throw new HttpError(404, '없는 기록이에요');
  const body = JSON.parse(r.body);
  return json({ shots: Array.isArray(body?.diag?.shots) ? body.diag.shots : [] });
}
