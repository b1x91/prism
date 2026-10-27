/**
 * 운영 (CLAUDE.md v3.107) — 운영진(역할 단계 5·관리자)만.
 *  - 승인 대기: 디스코드 회원 역할이 아직 없는 회원. '승인'을 누르면 봇이 준회원 역할을 붙인다.
 *  - 정회원 심사: 준회원 중 운영진과 같은 판을 PROMOTION.regularReview.withStaff 판 이상 한 회원. '승인'을 누르면 정회원.
 *  - 단계(대기·준·정·우수)·특별회원을 직접 바꿀 수도 있다. 운영진 역할은 디스코드에서 사람이 정한다 (여기서는 건드리지 않는다).
 *  - 친구 초대: 초대한 친구가 승인되는 순간 초대한 회원에게 보너스 피스 (invite_rewards, 한 번만 확정).
 */
import { sendToChannel } from './bot.js';
import { PROMOTION, liveRoles, setRole } from './promote.js';
import { ROLES, can, isPending, isSpecial, levelOf, rolesOf, topRole } from './roles.js';
import { FACE, HttpError, json, type Env, type Member } from './util.js';
import { INVITE_BONUS } from '../../packages/core/src/shop.js';

const roleId = (key: string) => ROLES.find((r) => r.key === key)!.id;
/** 여기서 바꾸는 회원 역할 (단계 1~3). 승급은 아래 단계 역할을 남긴다 (자동 승급과 같은 규칙) */
const STEPS = [
  { key: 'associate', level: 1, name: '준회원' },
  { key: 'regular', level: 2, name: '정회원' },
  { key: 'excellent', level: 3, name: '우수회원' },
] as const;

function assertStaff(me: Member) {
  if (!can(me, 'manage')) throw new HttpError(403, '운영진만 쓸 수 있어요.');
}

async function memberRow(env: Env, id: string) {
  const m = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(id).first<Member>();
  if (!m) throw new HttpError(404, '없는 회원입니다.');
  return m;
}

/** 운영진(운영진 역할·관리자) ID 목록 */
async function staffIds(env: Env): Promise<string[]> {
  const { results } = await env.DB.prepare('SELECT id, tier, discord_roles FROM members').all<Pick<Member, 'id' | 'tier' | 'discord_roles'>>();
  return results.filter((m) => levelOf(m) >= 5).map((m) => m.id);
}

/** 회원마다 운영진과 같은 판 수 (본인이 운영진이면 다른 운영진과) */
async function gamesWithStaff(env: Env): Promise<Map<string, number>> {
  const ids = await staffIds(env);
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const { results } = await env.DB.prepare(
    `SELECT p.member_id AS id, COUNT(DISTINCT p.game_id) AS n FROM participants p
     WHERE EXISTS (SELECT 1 FROM participants h WHERE h.game_id = p.game_id AND h.member_id != p.member_id AND h.member_id IN (SELECT value FROM json_each(?1)))
     GROUP BY p.member_id`,
  ).bind(JSON.stringify(ids)).all<{ id: string; n: number }>();
  for (const r of results) out.set(r.id, r.n);
  return out;
}

/** GET /api/staff/members — 멤버 목록 (승인 대기 · 정회원 심사 · 전체) */
export async function staffMembers(env: Env, me: Member) {
  assertStaff(me);
  const [{ results }, withStaff, rewards] = await Promise.all([
    env.DB.prepare(
      `SELECT m.id, m.nick, m.discord_name AS discordName, ${FACE('m')}, m.tier, m.discord_roles, m.joined_at AS joined,
         MAX(COALESCE(m.last_seen_at, 0), COALESCE(m.web_seen_at, 0), COALESCE(m.app_seen_at, 0)) AS seen,
         m.riot_id AS riotId, m.invited_by AS invitedBy, m.approved_at AS approvedAt,
         (SELECT COUNT(*) FROM participants p WHERE p.member_id = m.id) AS games
       FROM members m ORDER BY m.joined_at DESC`,
    ).all<Record<string, any>>(),
    gamesWithStaff(env),
    env.DB.prepare('SELECT inviter, COUNT(*) AS n FROM invite_rewards GROUP BY inviter').all<{ inviter: string; n: number }>(),
  ]);
  const nick = new Map(results.map((r) => [r.id as string, r.nick as string]));
  const invited = new Map(rewards.results.map((r) => [r.inviter, r.n]));
  const need = PROMOTION.regularReview.withStaff;
  const members = results.map(({ discord_roles, tier, ...r }) => {
    const m = { tier, discord_roles } as Pick<Member, 'tier' | 'discord_roles'>;
    const level = Math.min(levelOf(m), 5);
    const staffGames = withStaff.get(r.id) ?? 0;
    return {
      ...r,
      level, special: isSpecial(m) && level < 5, pending: isPending(m), role: topRole(m), admin: tier === 'admin',
      rolesKnown: discord_roles != null,
      staffGames,
      review: level === 1 && staffGames >= need,
      inviter: r.invitedBy ? { id: r.invitedBy, nick: nick.get(r.invitedBy) ?? '알 수 없음' } : null,
      invitedCount: invited.get(r.id) ?? 0,
    };
  });
  return json({ members, reviewNeed: need, inviteBonus: INVITE_BONUS });
}

/**
 * 단계를 정한다 (0 승인 대기 · 1 준회원 · 2 정회원 · 3 우수회원). 디스코드의 지금 역할을 다시 읽고 바뀌는 역할만 붙이고 뗀다.
 * 1 이상이 되면 승인으로 보고, 초대한 회원이 있으면 초대 보너스를 확정한다.
 */
async function applyLevel(env: Env, me: Member, target: Member, level: number): Promise<{ from: number; to: number }> {
  if (target.tier === 'admin' || levelOf(target) >= 5) throw new HttpError(400, '운영진의 역할은 디스코드에서 직접 바꿔 주세요.');
  if (!env.DISCORD_BOT_TOKEN) throw new HttpError(503, '디스코드 봇이 연결되어 있지 않아요.');
  const live = await liveRoles(env, target.id);
  if (live === null) throw new HttpError(502, '디스코드에서 이 멤버를 찾지 못했어요. 서버를 나갔을 수 있어요.');
  const roles = new Set(live);
  const from = levelOf({ tier: target.tier, discord_roles: JSON.stringify(live) });
  for (const s of STEPS) {
    const id = roleId(s.key), want = level >= s.level;
    if (want === roles.has(id)) continue;
    const ok = await setRole(env, target.id, id, want, `Prism 운영: ${me.nick} 님이 ${level === 0 ? '승인 대기' : STEPS[level - 1].name}(으)로`);
    if (!ok) throw new HttpError(502, '디스코드 역할을 바꾸지 못했어요. 봇 권한(역할 관리)과 역할 순서(봇이 회원 역할보다 위)를 확인해 주세요.');
    want ? roles.add(id) : roles.delete(id);
  }
  const now = Date.now();
  await env.DB.prepare('UPDATE members SET discord_roles = ?, roles_at = ? WHERE id = ?').bind(JSON.stringify([...roles]), now, target.id).run();
  if (level >= 1) {
    await env.DB.prepare('UPDATE members SET approved_at = COALESCE(approved_at, ?), approved_by = COALESCE(approved_by, ?) WHERE id = ?').bind(now, me.id, target.id).run();
    const inv = (await env.DB.prepare('SELECT invited_by AS i FROM members WHERE id = ?').bind(target.id).first<{ i: string | null }>())?.i;
    if (inv) await env.DB.prepare('INSERT OR IGNORE INTO invite_rewards (invitee, inviter, at) VALUES (?, ?, ?)').bind(target.id, inv, now).run();
  }
  return { from, to: level };
}

/** 채널에 알린다 (실패해도 운영 처리는 그대로) */
async function cheer(env: Env, content: string, users: string[]) {
  if (!env.BOT_CHANNEL_ID || !env.DISCORD_BOT_TOKEN) return;
  await sendToChannel(env, env.BOT_CHANNEL_ID, { content, allowed_mentions: { users } }).catch(() => false);
}

async function setInviterIfEmpty(env: Env, target: Member, inviter: unknown) {
  if (typeof inviter !== 'string' || !inviter || inviter === target.id || target.invited_by) return;
  const ok = await env.DB.prepare('SELECT 1 AS x FROM members WHERE id = ?').bind(inviter).first();
  if (!ok) throw new HttpError(400, '추천인으로 고른 회원을 찾지 못했어요.');
  await env.DB.prepare('UPDATE members SET invited_by = ? WHERE id = ? AND invited_by IS NULL').bind(inviter, target.id).run();
  target.invited_by = inviter;
}

/** POST /api/staff/members/:id/:action — approve(승인 대기 → 준회원) · promote(정회원 심사 → 정회원) · level · special · inviter */
export async function staffAction(req: Request, env: Env, me: Member, id: string, action: string) {
  assertStaff(me);
  const body = (await req.json().catch(() => ({}))) as { level?: unknown; on?: unknown; inviter?: unknown };
  const target = await memberRow(env, id);
  if (action === 'inviter') {
    await setInviterIfEmpty(env, target, body.inviter);
    // 이미 승인된 회원이면 보너스를 바로 확정
    if (target.invited_by && levelOf(target) >= 1) await env.DB.prepare('INSERT OR IGNORE INTO invite_rewards (invitee, inviter, at) VALUES (?, ?, ?)').bind(target.id, target.invited_by, Date.now()).run();
    return json({ ok: true });
  }
  if (action === 'approve') {
    await setInviterIfEmpty(env, target, body.inviter);
    const r = await applyLevel(env, me, target, Math.max(1, levelOf(target)));
    if (r.from === 0) {
      const inv = target.invited_by;
      await cheer(env, `🎉 <@${target.id}> 님이 Prism 멤버가 되었어요! 반갑게 맞아 주세요.${inv ? `\n초대해 준 <@${inv}> 님께는 **${INVITE_BONUS} 피스**를 드렸어요.` : ''}`, inv ? [target.id, inv] : [target.id]);
    }
    return json({ ok: true, ...r });
  }
  if (action === 'promote') {
    if (levelOf(target) !== 1) throw new HttpError(400, '준회원만 정회원 심사를 받을 수 있어요.');
    const r = await applyLevel(env, me, target, 2);
    await cheer(env, `🎉 <@${target.id}> 님이 **정회원**이 되었어요!`, [target.id]);
    return json({ ok: true, ...r });
  }
  if (action === 'level') {
    const lv = Number(body.level);
    if (![0, 1, 2, 3].includes(lv)) throw new HttpError(400, '단계는 0~3 이에요.');
    return json({ ok: true, ...(await applyLevel(env, me, target, lv)) });
  }
  if (action === 'special') {
    if (target.tier === 'admin' || levelOf(target) >= 5) throw new HttpError(400, '운영진은 이미 모든 혜택을 받아요.');
    const sid = roleId('special');
    const on = Boolean(body.on);
    if (rolesOf(target).includes(sid) !== on) {
      if (!(await setRole(env, target.id, sid, on, `Prism 운영: ${me.nick} 님이 특별회원 ${on ? '부여' : '해제'}`))) throw new HttpError(502, '디스코드 역할을 바꾸지 못했어요. 봇 권한과 역할 순서를 확인해 주세요.');
      const roles = new Set(rolesOf(target));
      on ? roles.add(sid) : roles.delete(sid);
      await env.DB.prepare('UPDATE members SET discord_roles = ?, roles_at = ? WHERE id = ?').bind(JSON.stringify([...roles]), Date.now(), target.id).run();
    }
    return json({ ok: true });
  }
  throw new HttpError(404, 'not found');
}

// ───────── 친구 초대 ─────────

const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
async function inviteCode(env: Env, me: Member): Promise<string> {
  const row = await env.DB.prepare('SELECT invite_code AS c FROM members WHERE id = ?').bind(me.id).first<{ c: string | null }>();
  if (row?.c) return row.c;
  for (let tries = 0; tries < 6; tries++) {
    const c = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
    const r = await env.DB.prepare('UPDATE members SET invite_code = ? WHERE id = ? AND invite_code IS NULL').bind(c, me.id).run().catch(() => null);
    if (r?.meta.changes) return c;
    const again = await env.DB.prepare('SELECT invite_code AS c FROM members WHERE id = ?').bind(me.id).first<{ c: string | null }>();
    if (again?.c) return again.c;
  }
  throw new HttpError(500, '초대 링크를 만들지 못했어요. 다시 눌러 주세요.');
}

/** GET /api/me/invite — 내 초대 링크 번호 + 초대한 친구들 */
export async function myInvite(env: Env, me: Member) {
  const code = await inviteCode(env, me);
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.nick, ${FACE('m')}, m.tier, m.discord_roles, m.joined_at AS joined, r.at AS rewardedAt
     FROM members m LEFT JOIN invite_rewards r ON r.invitee = m.id WHERE m.invited_by = ? ORDER BY m.joined_at DESC`,
  ).bind(me.id).all<Record<string, any>>();
  const friends = results.map(({ tier, discord_roles, ...r }) => ({ ...r, rewardedAt: (r.rewardedAt ?? null) as number | null, approved: Boolean(r.rewardedAt) || levelOf({ tier, discord_roles }) >= 1 }));
  return json({ code, bonus: INVITE_BONUS, friends, rewarded: friends.filter((f) => f.rewardedAt).length });
}

/** 추천인이 될 수 있는가: 승인된 회원(준회원 이상·특별회원·관리자) */
const approved = (m: Pick<Member, 'tier' | 'discord_roles'>) => m.tier === 'admin' || levelOf(m) >= 1 || isSpecial(m);

/**
 * POST /api/me/invited { code } | { member } — 새 회원이 추천인을 남긴다 (승인 전에만, 한 번만).
 * code = 초대 링크 번호, member = 온보딩 '추천인' 칸에서 실제 멤버 목록으로 고른 회원 ID. 추천인은 승인된 회원만.
 */
export async function claimInvite(req: Request, env: Env, me: Member) {
  const { code, member } = (await req.json().catch(() => ({}))) as { code?: unknown; member?: unknown };
  const byCode = typeof code === 'string' && /^[a-z0-9]{4,12}$/.test(code);
  const byId = typeof member === 'string' && /^[0-9A-Za-z_-]{1,40}$/.test(member);
  if (!byCode && !byId) throw new HttpError(400, '추천인을 찾지 못했어요.');
  if (me.invited_by) return json({ ok: false, reason: 'already' });
  // 이미 승인된(예전부터 쓰던) 회원은 초대받은 사람으로 남기지 않는다 — 보너스를 노린 남용을 막는다
  if (!isPending(me)) return json({ ok: false, reason: 'member' });
  const inv = await env.DB.prepare(`SELECT id, tier, discord_roles FROM members WHERE ${byCode ? 'invite_code' : 'id'} = ?`).bind(byCode ? code : member).first<Pick<Member, 'id' | 'tier' | 'discord_roles'>>();
  if (!inv || inv.id === me.id || !approved(inv)) return json({ ok: false, reason: 'invalid' });
  await env.DB.prepare('UPDATE members SET invited_by = ? WHERE id = ? AND invited_by IS NULL').bind(inv.id, me.id).run();
  return json({ ok: true });
}

/** GET /api/members/lookup?q= — 추천인 칸: 이름(롤 이름·디스코드 이름)으로 승인된 멤버를 찾는다 (최대 6명, 나는 빼고) */
export async function lookupMembers(env: Env, me: Member, q: string | null) {
  const t = (q ?? '').trim().replace(/[%_]/g, '').slice(0, 30);
  if (!t) return json({ members: [] });
  const like = `%${t}%`;
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.nick, ${FACE('m')}, m.tier, m.discord_roles FROM members m
     WHERE m.id != ?1 AND (m.nick LIKE ?2 OR m.riot_id LIKE ?2 OR m.discord_name LIKE ?2)
     ORDER BY CASE WHEN m.nick LIKE ?3 THEN 0 ELSE 1 END, m.last_seen_at DESC LIMIT 30`,
  ).bind(me.id, like, `${t}%`).all<Record<string, any>>();
  const members = results.filter((r) => approved({ tier: r.tier, discord_roles: r.discord_roles })).slice(0, 6).map(({ tier: _t, discord_roles: _d, ...r }) => r);
  return json({ members });
}

/** GET /public/invite/:code — 초대 받은 사람에게 보여 줄 초대한 사람 (이름·얼굴만, 로그인 없이) */
export async function publicInvite(env: Env, code: string) {
  const m = await env.DB.prepare(`SELECT m.nick, ${FACE('m')} FROM members m WHERE m.invite_code = ?`).bind(code).first<{ nick: string; skin: number | null; main: number | null }>();
  if (!m) throw new HttpError(404, '없는 초대 링크예요.');
  return json({ nick: m.nick, skin: m.skin, main: m.main });
}
