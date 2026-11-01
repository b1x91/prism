/**
 * 내전 팀 나누기 — 프리즘 빛 갈래 (CLAUDE.md v3.135).
 *  - 우수회원 이상(`FEATURES.scrim`)·관리자가, 지금 NOW 에 떠 있는 내전(사용자 설정 로비)에서 누른다. 내전에 들어와 있는 사람만 (관리자는 예외).
 *  - 서버가 팀(5:5)과 빛이 지나갈 순서를 정해 두고, 시작 시각(start_at = 누른 때 + LEAD)을 함께 나눠 준다.
 *    모든 화면은 서버 시계에 맞춰 같은 순간에 같은 연출을 시작한다 (늦게 연 화면은 그만큼 앞으로 감아서 따라온다).
 *  - 밸런스 맞추기: Prism 점수(`rankScore`) 합 차이가 가장 작은 조합들 중에서 무작위. 끄면 그냥 무작위 5:5.
 *  - 손님(비회원)은 '손님 N', 점수 500 (기준점). 이름·puuid 는 남기지 않는다.
 *  - '팀 확정'은 표시만 (롤 로비의 팀은 방장이 롤에서 직접 옮긴다 — 클라이언트를 조작하지 않는다).
 */
import { rankScore } from '../../packages/core/src/ranking.js';
import type { NowDraw } from '../../packages/core/src/api.js';
import { FACE, HttpError, json, type Env, type Member } from './util.js';
import { can } from './roles.js';

/** 누른 뒤 연출이 시작되기까지 — 모든 화면이 소식을 받아 둘 시간 (화면은 1.5초마다 묻는다) */
export const DRAW_LEAD = 3_500;
const KEEP = 6 * 3600_000;
const AGAIN = 8_000;
const GUEST_SCORE = 500;

type Person = { key: string; id: string | null; team: 'blue' | 'red'; score: number };

const shuffle = <T>(a: T[]) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

/** 반반 나누기: 밸런스면 점수 합 차이가 가장 작은 쪽(최소 + 10점 안)에서 무작위, 아니면 그냥 무작위 */
function split(scores: number[], balanced: boolean): ('blue' | 'red')[] {
  const n = scores.length, k = n / 2, total = scores.reduce((a, b) => a + b, 0);
  const masks: { m: number; d: number }[] = [];
  for (let m = 0; m < 1 << n; m++) {
    if (!(m & 1)) continue; // 0번은 한쪽에 (뒤집은 같은 조합을 한 번만)
    let c = 0, s = 0;
    for (let i = 0; i < n; i++) if ((m >> i) & 1) { c++; s += scores[i]; }
    if (c === k) masks.push({ m, d: Math.abs(total - 2 * s) });
  }
  let pool = masks;
  if (balanced) { const best = Math.min(...masks.map((x) => x.d)); pool = masks.filter((x) => x.d <= best + 10); }
  const pick = pool[Math.floor(Math.random() * pool.length)].m;
  const flip = Math.random() < 0.5;
  return scores.map((_, i) => (((pick >> i) & 1) === (flip ? 0 : 1) ? 'blue' : 'red'));
}

async function scrimRow(env: Env, lobbyId: string) {
  return env.DB.prepare("SELECT id, members, size, phase, teams FROM now_lobbies WHERE id = ? AND kind = 'scrim'").bind(lobbyId).first<{ id: string; members: string; size: number; phase: string; teams: string | null }>();
}

const idsOf = (s: string): string[] => { try { const v = JSON.parse(s); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } };

function toDraw(r: { id: number; lobby_id: string; host_id: string; start_at: number; people: string; balanced: number; confirmed_at: number | null }): NowDraw {
  let people: Person[] = [];
  try { people = JSON.parse(r.people); } catch { /* 빈 */ }
  return { id: r.id, lobby: r.lobby_id, host: r.host_id, start: r.start_at, people, balanced: Boolean(r.balanced), confirmed: Boolean(r.confirmed_at) };
}

/** POST /api/now/:lobby/draw { balance } — 팀 나누기 시작 */
export async function startDraw(env: Env, me: Member, lobbyId: string, body: { balance?: unknown }) {
  if (!can(me, 'scrim')) throw new HttpError(403, '내전 팀 나누기는 우수회원부터 쓸 수 있어요.');
  const row = await scrimRow(env, lobbyId);
  if (!row) throw new HttpError(404, '지금 열린 내전이 없어요.');
  const members = idsOf(row.members);
  if (me.tier !== 'admin' && !members.includes(me.id)) throw new HttpError(403, '이 내전에 들어와 있어야 팀을 나눌 수 있어요.');
  if (row.phase !== 'lobby') throw new HttpError(400, '모이는 중일 때만 팀을 나눌 수 있어요.');
  const total = Math.max(row.size, members.length);
  if (total < 4 || total % 2) throw new HttpError(400, `${total}명이에요. 짝수(4명 이상)일 때 나눌 수 있어요.`);
  if (total > 10) throw new HttpError(400, '10명까지 나눌 수 있어요.');
  const now = Date.now();
  const last = await env.DB.prepare('SELECT created_at FROM scrim_draws WHERE lobby_id = ? ORDER BY created_at DESC LIMIT 1').bind(lobbyId).first<{ created_at: number }>();
  if (last && now - last.created_at < AGAIN) throw new HttpError(429, '방금 나눴어요. 잠깐 뒤에 다시 눌러 주세요.');
  // 회원 점수 = Prism 점수 (전체 기록)
  const { results } = await env.DB.prepare('SELECT member_id AS id, COUNT(*) AS n, SUM(win) AS w FROM participants WHERE member_id IN (SELECT value FROM json_each(?)) GROUP BY member_id').bind(JSON.stringify(members)).all<{ id: string; n: number; w: number }>();
  const rec = new Map(results.map((r) => [r.id, r]));
  const base = [
    ...members.map((id) => ({ key: id, id, score: rankScore(rec.get(id)?.w ?? 0, rec.get(id)?.n ?? 0) })),
    ...Array.from({ length: total - members.length }, (_, i) => ({ key: `g${i + 1}`, id: null, score: GUEST_SCORE })),
  ];
  const balanced = body.balance !== false;
  const teams = split(base.map((p) => p.score), balanced);
  const people: Person[] = shuffle(base.map((p, i) => ({ ...p, team: teams[i] })));
  const start = now + DRAW_LEAD;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM scrim_draws WHERE created_at < ?').bind(now - KEEP),
    env.DB.prepare('INSERT INTO scrim_draws (lobby_id, host_id, created_at, start_at, people, balanced) VALUES (?, ?, ?, ?, ?, ?)').bind(lobbyId, me.id, now, start, JSON.stringify(people), balanced ? 1 : 0),
  ]);
  return getDraw(env, lobbyId);
}

/** GET /api/now/draw?lobby= — 그 내전의 마지막 팀 나누기 + 서버 시각 (화면이 시계를 맞춘다) */
export async function getDraw(env: Env, lobbyId: string | null) {
  const now = Date.now();
  if (!lobbyId) return json({ draw: null, now });
  const r = await env.DB.prepare('SELECT * FROM scrim_draws WHERE lobby_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1').bind(lobbyId, now - KEEP).first<Parameters<typeof toDraw>[0]>();
  if (!r) return json({ draw: null, now });
  const d = toDraw(r);
  // 얼굴·이름은 지금 값으로 (기록에는 회원 번호만)
  const ids = d.people.map((p) => p.id).filter((x): x is string => Boolean(x));
  const { results } = ids.length
    ? await env.DB.prepare(`SELECT m.id, m.nick, ${FACE('m')} FROM members m WHERE m.id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all<{ id: string; nick: string; skin: number | null; main: number | null }>()
    : { results: [] };
  const face = new Map(results.map((f) => [f.id, f]));
  let g = 0;
  d.people = d.people.map((p) => {
    const f = p.id ? face.get(p.id) : null;
    return { ...p, nick: f?.nick ?? (p.id ? '멤버' : `손님 ${++g}`), skin: f?.skin ?? null, main: f?.main ?? null };
  });
  return json({ draw: d, now });
}

/** POST /api/now/draw/:id/confirm — 나눈 사람(또는 관리자)이 팀 확정 */
export async function confirmDraw(env: Env, me: Member, id: number) {
  const r = await env.DB.prepare('SELECT * FROM scrim_draws WHERE id = ?').bind(id).first<Parameters<typeof toDraw>[0]>();
  if (!r) throw new HttpError(404, '팀 나누기를 찾지 못했어요.');
  if (r.host_id !== me.id && me.tier !== 'admin') throw new HttpError(403, '팀을 나눈 분만 확정할 수 있어요.');
  await env.DB.prepare('UPDATE scrim_draws SET confirmed_at = ? WHERE id = ?').bind(Date.now(), id).run();
  return getDraw(env, r.lobby_id);
}
