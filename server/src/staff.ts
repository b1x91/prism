/**
 * 운영 (CLAUDE.md v3.107) — 운영진(역할 단계 5·관리자)만.
 *  - 승인 대기: 디스코드 회원 역할이 아직 없는 회원. '승인'을 누르면 봇이 준회원 역할을 붙인다.
 *  - 정회원 심사: 준회원 중 운영진과 같은 판을 PROMOTION.regularReview.withStaff 판 이상 한 회원. '승인'을 누르면 정회원.
 *  - 정회원·우수회원은 카톡방에 있는 회원만 (v3.190): 운영진이 '카톡방 확인'을 눌러 둔 회원(members.kakao_at)만 올릴 수 있다. 서버도 막는다.
 *  - 우수회원은 운영진이 고른다 (v3.190). 예전 자동 기준을 채운 정회원은 '우수회원 후보'로 추천만.
 *  - 단계(대기·준·정·우수)·특별회원을 직접 바꿀 수도 있다. 운영진 역할은 디스코드에서 사람이 정한다 (여기서는 건드리지 않는다).
 *  - 친구 초대: 초대한 친구가 승인되는 순간 초대한 회원에게 보너스 피스 (invite_rewards, 한 번만 확정).
 */
import { sendToChannel } from './bot.js';
import { PROMOTION, excellentHints, liveRoles, setRole } from './promote.js';
import { ROLES, can, isPending, isSpecial, unapproved, levelOf, rolesOf, topRole } from './roles.js';
import { FACE, HttpError, json, type Env, type Member } from './util.js';
import { INVITE_BONUS } from '../../packages/core/src/shop.js';
import { weekStart } from '../../packages/core/src/missions.js';
import { rankScore } from '../../packages/core/src/ranking.js';
import { PICK_POINTS } from '../../packages/core/src/staff.js';

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
export async function staffIds(env: Env): Promise<string[]> {
  const { results } = await env.DB.prepare('SELECT id, tier, discord_roles FROM members').all<Pick<Member, 'id' | 'tier' | 'discord_roles'>>();
  return results.filter((m) => levelOf(m) >= 5).map((m) => m.id);
}

/**
 * 디스코드에서 지금 운영진 역할을 가진 사람 (가입 신청 알림용, v3.148).
 * 앱 권한(staffIds)은 로그인 때·12시간마다 받은 역할로 보므로, 운영진이 된 지 얼마 안 됐거나
 * Prism 에 아직 로그인하지 않은 운영진은 빠질 수 있다 → 디스코드에 바로 묻는다.
 *  ① 서버 회원 목록(봇에 '서버 회원' 권한이 켜져 있을 때) ② 안 되면 Prism 회원마다 지금 역할
 * 어느 쪽이든 앱 권한 운영진·관리자와 합친다.
 */
export async function staffDiscordIds(env: Env): Promise<string[]> {
  const out = new Set(await staffIds(env));
  for (const id of (env.ADMIN_DISCORD_IDS ?? '').split(',').map((x) => x.trim()).filter(Boolean)) out.add(id);
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return [...out];
  const staffRole = ROLES.find((r) => r.key === 'staff')!.id;
  const list = await fetch(`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members?limit=1000`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }, signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (list?.ok) {
    const rows = (await list.json().catch(() => [])) as { user?: { id: string; bot?: boolean }; roles?: string[] }[];
    for (const m of rows) if (m.user && !m.user.bot && m.roles?.includes(staffRole)) out.add(m.user.id);
    return [...out];
  }
  const { results } = await env.DB.prepare('SELECT id FROM members ORDER BY last_seen_at DESC LIMIT 150').all<{ id: string }>();
  for (let i = 0; i < results.length; i += 10) {
    const part = await Promise.all(results.slice(i, i + 10).map(async (m) => ({ id: m.id, roles: await liveRoles(env, m.id) })));
    for (const x of part) if (x.roles?.includes(staffRole)) out.add(x.id);
  }
  return [...out];
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

/**
 * 운영 메뉴의 빨간 점 (v3.125): 처리할 멤버(승인 대기 · 정회원 심사) 중 이 운영진이 운영 화면에서 아직 못 본 사람 수.
 * 운영진이 아니면 undefined. 운영 화면(멤버 목록)을 열면 그때의 처리할 멤버를 '본 것'으로 적는다.
 */
async function todoIds(env: Env): Promise<string[]> {
  const [{ results }, withStaff] = await Promise.all([
    env.DB.prepare('SELECT id, tier, discord_roles, app_first_at FROM members').all<Pick<Member, 'id' | 'tier' | 'discord_roles' | 'app_first_at'>>(),
    gamesWithStaff(env),
  ]);
  const need = PROMOTION.regularReview.withStaff;
  return results.filter((m) => isPending(m) || (Math.min(levelOf(m), 5) === 1 && (withStaff.get(m.id) ?? 0) >= need)).map((m) => m.id);
}
/** 처리할 가입 신청 (v3.148: 신청 · 확정되어 초대를 보내야 하는 것) — 'a:번호' */
async function joinTodoIds(env: Env): Promise<string[]> {
  const r = await env.DB.prepare(`SELECT id FROM applications WHERE status IN ('new', 'confirmed')`).all<{ id: number }>().catch(() => null);
  return (r?.results ?? []).map((x) => `a:${x.id}`);
}
const seenOf = (me: Member) => { try { const v = JSON.parse(me.staff_seen ?? '[]'); return new Set<string>(Array.isArray(v) ? v : []); } catch { return new Set<string>(); } };
export async function staffUnread(env: Env, me: Member): Promise<number | undefined> {
  return (await staffBadge(env, me)).staffUnread;
}
/**
 * 운영 메뉴의 빨간 점 + 운영 탭 숫자 (v3.160): 할 일(승인 대기 · 정회원 심사 · 처리할 가입 신청) · 문의(답을 기다리는 것).
 * 운영진이 아니면 빈 객체.
 */
export async function staffBadge(env: Env, me: Member): Promise<{ staffUnread?: number; staffTodo?: number; staffInq?: number }> {
  if (!can(me, 'manage')) return {};
  const seen = seenOf(me);
  const [mem, apps, interview, inq] = await Promise.all([
    todoIds(env).catch(() => [] as string[]), joinTodoIds(env),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM applications WHERE status = 'interview'`).first<{ n: number }>().catch(() => null),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM inquiries WHERE status = 'open'`).first<{ n: number }>().catch(() => null),
  ]);
  return { staffUnread: [...mem, ...apps].filter((id) => !seen.has(id)).length, staffTodo: mem.length + apps.length + (interview?.n ?? 0), staffInq: inq?.n ?? 0 };
}

/** GET /api/staff/members — 멤버 목록 (승인 대기 · 정회원 심사 · 전체) */
export async function staffMembers(env: Env, me: Member) {
  assertStaff(me);
  const kakaoPending = (await applyKakaoList(env).catch(() => ({ left: [] as string[] }))).left;
  const [{ results }, withStaff, rewards, recentRows, hints] = await Promise.all([
    env.DB.prepare(
      `SELECT m.id, m.nick, m.discord_name AS discordName, ${FACE('m')}, m.tier, m.discord_roles, m.app_first_at, m.joined_at AS joined,
         MAX(COALESCE(m.last_seen_at, 0), COALESCE(m.web_seen_at, 0), COALESCE(m.app_seen_at, 0)) AS seen,
         m.riot_id AS riotId, m.invited_by AS invitedBy, m.approved_at AS approvedAt, m.kakao_at AS kakaoAt,
         (SELECT a.kakao FROM applications a WHERE a.member_id = m.id ORDER BY a.updated_at DESC LIMIT 1) AS kakaoName,
         (SELECT COUNT(*) FROM participants p WHERE p.member_id = m.id) AS games,
         (SELECT COALESCE(SUM(p.win), 0) FROM participants p WHERE p.member_id = m.id) AS wins,
         (SELECT MAX(p.played_at) FROM participants p WHERE p.member_id = m.id) AS lastPlayed,
         (SELECT MIN(p.played_at) FROM participants p WHERE p.member_id = m.id) AS firstPlayed
       FROM members m ORDER BY m.joined_at DESC`,
    ).all<Record<string, any>>(),
    gamesWithStaff(env),
    env.DB.prepare('SELECT inviter, COUNT(*) AS n FROM invite_rewards GROUP BY inviter').all<{ inviter: string; n: number }>(),
    env.DB.prepare('SELECT member_id AS id, game_id AS g, played_at AS t, win AS w, crew_count AS c FROM participants WHERE played_at >= ?')
      .bind(weekStart(Date.now()) - (OVERVIEW_WEEKS * 2 - 1) * WEEK).all<{ id: string; g: number; t: number; w: number; c: number }>(),
    excellentHints(env).catch(() => new Set<string>()),
  ]);
  const nick = new Map(results.map((r) => [r.id as string, r.nick as string]));
  const invited = new Map(rewards.results.map((r) => [r.inviter, r.n]));
  const need = PROMOTION.regularReview.withStaff;
  // 최근 2주 판수 (멤버 관리 거르기·내전 인원 고르기용)
  const since14 = Date.now() - 14 * DAY, recent = new Map<string, number>();
  for (const r of recentRows.results) if (r.t >= since14) recent.set(r.id, (recent.get(r.id) ?? 0) + 1);
  const ws0 = weekStart(Date.now()) - (OVERVIEW_WEEKS - 1) * WEEK;
  const wk = new Map<string, number[]>(), byGame = new Map<number, string[]>();
  for (const r of recentRows.results) {
    const i = Math.floor((r.t - ws0) / WEEK);
    if (i >= 0 && i < OVERVIEW_WEEKS) { const a = wk.get(r.id) ?? Array(OVERVIEW_WEEKS).fill(0); a[i]++; wk.set(r.id, a); }
    (byGame.get(r.g) ?? byGame.set(r.g, []).get(r.g)!).push(r.id);
  }
  const pairs = new Map<string, Map<string, number>>();
  for (const ids of byGame.values()) for (const a of ids) for (const b of ids) if (a !== b) { const m = pairs.get(a) ?? new Map<string, number>(); m.set(b, (m.get(b) ?? 0) + 1); pairs.set(a, m); }
  const faceOf = new Map(results.map((r) => [r.id as string, { id: r.id as string, nick: r.nick as string, skin: (r.skin ?? null) as number | null, main: (r.main ?? null) as number | null }]));
  const matesOf = (id: string) => [...(pairs.get(id) ?? new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([x, n]) => ({ ...faceOf.get(x)!, n })).filter((x) => x.id);
  const members = results.map(({ discord_roles, tier, app_first_at, ...r }) => {
    const m = { tier, discord_roles, app_first_at: Number(app_first_at ?? 0) } as Pick<Member, 'tier' | 'discord_roles'> & { app_first_at: number };
    const level = Math.min(levelOf(m), 5);
    const staffGames = withStaff.get(r.id) ?? 0;
    return {
      ...r,
      level, special: isSpecial(m) && level < 5, pending: isPending(m), app: (m.app_first_at ?? 0) > 0, role: topRole(m), admin: tier === 'admin',
      rolesKnown: discord_roles != null,
      staffGames,
      recent: recent.get(r.id) ?? 0,
      score: rankScore(Number(r.wins) || 0, Number(r.games) || 0),
      review: level === 1 && staffGames >= need,
      kakao: r.kakaoAt != null,
      excellentHint: level === 2 && hints.has(r.id) && !isSpecial(m),
      inviter: r.invitedBy ? { id: r.invitedBy, nick: nick.get(r.invitedBy) ?? '알 수 없음' } : null,
      invitedCount: invited.get(r.id) ?? 0,
      wk: wk.get(r.id) ?? Array(OVERVIEW_WEEKS).fill(0),
      mates: matesOf(r.id),
      appAt: m.app_first_at || null,
    };
  });
  // 지금 처리할 멤버를 '본 것'으로 (메뉴의 빨간 점이 꺼진다)
  const todo = members.filter((x) => x.pending || x.review).map((x) => (x as unknown as { id: string }).id);
  const keepApps = [...seenOf(me)].filter((x) => x.startsWith('a:'));
  await env.DB.prepare('UPDATE members SET staff_seen = ? WHERE id = ?').bind(JSON.stringify([...todo, ...keepApps]), me.id).run().catch(() => {});
  const apps = await env.DB.prepare(`SELECT status, COUNT(*) AS n FROM applications WHERE status IN ('new', 'interview', 'confirmed') GROUP BY status`).all<{ status: string; n: number }>().catch(() => null);
  const ac = Object.fromEntries((apps?.results ?? []).map((r) => [r.status, r.n]));
  const inq = await env.DB.prepare("SELECT COUNT(*) AS n FROM inquiries WHERE status IN ('open', 'working')").first<{ n: number }>().catch(() => null);
  return json({ members, kakaoPending, reviewNeed: need, inviteBonus: INVITE_BONUS, applications: { new: ac.new ?? 0, interview: ac.interview ?? 0, confirmed: ac.confirmed ?? 0 }, inquiries: inq?.n ?? 0, overview: overviewOf(members as unknown as Row[], recentRows.results) });
}

const DAY = 86_400_000, WEEK = 7 * DAY;
const OVERVIEW_WEEKS = 8;
/** 날짜별 판 칸 (열지도): 9주 */
const DAILY_DAYS = 63;
/** 잘하는 멤버: 최근 2주 판수가 이만큼은 돼야 (점수가 판수로 흔들리지 않게) */
const STAR_MIN = 5;
/** 챙겨야 하는 멤버: 이만큼 안 보이면 / 가입하고 이만큼 지나도 판이 없으면 */
const AWAY_DAYS = 14, QUIET_DAYS = 3;

type Row = { id: string; nick: string; app: boolean; appAt: number | null; riotId: string | null; skin: number | null; main: number | null; joined: number; seen: number; games: number; lastPlayed: number | null; firstPlayed: number | null; wins: number; level: number; pending: boolean; review: boolean; staffGames: number; admin: boolean };

/** 운영 대시보드: 주별 흐름 · 단계 분포 · 최근 2주 잘하는 멤버 · 챙겨야 하는 멤버 (판 기록·접속에서 계산) */
function overviewOf(members: Row[], rows: { id: string; g: number; t: number; w: number; c: number }[]) {
  const now = Date.now(), ws = weekStart(now);
  const weeks = Array.from({ length: OVERVIEW_WEEKS }, (_, i) => ({ start: ws - (OVERVIEW_WEEKS - 1 - i) * WEEK, games: 0, crew: 0, active: 0 }));
  const seenGame = new Set<number>(), act = weeks.map(() => new Set<string>());
  for (const r of rows) {
    const i = Math.floor((r.t - weeks[0].start) / WEEK);
    if (i < 0 || i >= OVERVIEW_WEEKS) continue;
    act[i].add(r.id);
    if (seenGame.has(r.g)) continue;
    seenGame.add(r.g);
    weeks[i].games++;
    if (r.c >= 2) weeks[i].crew++;
  }
  weeks.forEach((w, i) => (w.active = act[i].size));
  // 최근 2주 개인 성적
  const since = now - 14 * DAY, per = new Map<string, { n: number; w: number; crew: number }>();
  for (const r of rows) {
    if (r.t < since) continue;
    const x = per.get(r.id) ?? { n: 0, w: 0, crew: 0 };
    x.n++; x.w += r.w; if (r.c >= 2) x.crew++;
    per.set(r.id, x);
  }
  const face = (m: Row) => ({ id: m.id, nick: m.nick, skin: m.skin, main: m.main });
  // 승인 대기 멤버는 '챙겨야 할 멤버'에 있으니 여기에는 두지 않는다 (한 화면에 같은 사람 두 번 금지, v3.32)
  const stars = members
    .filter((m) => !m.pending)
    .map((m) => ({ m, s: per.get(m.id) }))
    .filter((x): x is { m: Row; s: { n: number; w: number; crew: number } } => Boolean(x.s && x.s.n >= STAR_MIN))
    .map(({ m, s }) => ({ ...face(m), n: s.n, w: s.w, crew: s.crew, score: rankScore(s.w, s.n) }))
    .sort((a, b) => b.score - a.score || b.n - a.n)
    .slice(0, 5);
  const days = (t: number) => Math.max(0, Math.floor((now - t) / DAY));
  const care: { id: string; nick: string; skin: number | null; main: number | null; kind: 'pending' | 'review' | 'quiet' | 'away'; days: number; n?: number }[] = [];
  for (const m of members) {
    if (m.admin || m.level >= 5) continue;
    const last = Math.max(m.seen || 0, m.lastPlayed || 0);
    if (m.pending) care.push({ ...face(m), kind: 'pending', days: days(m.joined) });
    else if (m.review) care.push({ ...face(m), kind: 'review', days: 0, n: m.staffGames });
    else if (m.level >= 1 && m.games === 0 && days(m.joined) >= QUIET_DAYS) care.push({ ...face(m), kind: 'quiet', days: days(m.joined) });
    else if (m.level >= 1 && last > 0 && days(last) >= AWAY_DAYS) care.push({ ...face(m), kind: 'away', days: days(last) });
  }
  const order = { pending: 0, review: 1, quiet: 2, away: 3 };
  care.sort((a, b) => order[a.kind] - order[b.kind] || b.days - a.days);
  const lv = (k: number) => members.filter((m) => !m.pending && Math.min(m.level, 5) === k).length;
  const cur = weeks[OVERVIEW_WEEKS - 1], prev = weeks[OVERVIEW_WEEKS - 2];
  // 기간 숫자 (v3.159): 이번 주는 지난주 '같은 때까지'와, 4주·8주는 바로 앞 같은 길이와 비교한다
  const span = (from: number, to: number) => {
    const ids = new Set<string>(), gs = new Set<number>(), cs = new Set<number>();
    for (const r of rows) if (r.t >= from && r.t < to) { ids.add(r.id); gs.add(r.g); if (r.c >= 2) cs.add(r.g); }
    return { active: ids.size, games: gs.size, crew: cs.size, joined: members.filter((m) => m.joined >= from && m.joined < to).length };
  };
  const into = now - ws;
  const periods = {
    week: { now: span(ws, now + 1), prev: span(ws - WEEK, ws - WEEK + into) },
    w4: { now: span(ws - 3 * WEEK, now + 1), prev: span(ws - 7 * WEEK, ws - 4 * WEEK + into) },
    w8: { now: span(ws - 7 * WEEK, now + 1), prev: span(ws - 15 * WEEK, ws - 8 * WEEK + into) },
  };
  // 언제 모이나요: 최근 4주, 요일(월~일) × 시간대(오전 6~12 · 낮 12~18 · 저녁 18~21 · 밤 21~24 · 새벽 0~6), 서로 다른 판 (한국 시간)
  const heat = Array.from({ length: 5 }, () => Array(7).fill(0) as number[]);
  const heatSeen = new Set<number>();
  for (const r of rows) {
    if (r.t < now - 28 * DAY || heatSeen.has(r.g)) continue;
    heatSeen.add(r.g);
    const k = new Date(r.t + 9 * 3_600_000), h = k.getUTCHours(), dow = (k.getUTCDay() + 6) % 7;
    const slot = h >= 6 && h < 12 ? 0 : h >= 12 && h < 18 ? 1 : h >= 18 && h < 21 ? 2 : h >= 21 ? 3 : 4;
    heat[slot][dow]++;
  }
  // 새 멤버 정착: 최근 4주 가입 → 롤 연결 → 앱 → 첫 판 → 모임 판 3판 → 정회원 이상
  const crewOf = new Map<string, number>();
  for (const r of rows) if (r.c >= 2) crewOf.set(r.id, (crewOf.get(r.id) ?? 0) + 1);
  const fresh = members.filter((m) => !m.admin && m.joined >= now - 28 * DAY);
  const funnel = {
    joined: fresh.length,
    linked: fresh.filter((m) => m.riotId).length,
    app: fresh.filter((m) => m.app).length,
    played: fresh.filter((m) => m.games > 0).length,
    crew3: fresh.filter((m) => (crewOf.get(m.id) ?? 0) >= 3).length,
    regular: fresh.filter((m) => !m.pending && m.level >= 2).length,
  };
  // 단계마다 걸린 시간 (가입부터, 일): 앱 설치 · 첫 판 — 기록이 있는 멤버만
  const avgDays = (vals: number[]) => (vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null);
  const funnelDays = {
    app: avgDays(fresh.filter((m) => m.appAt && m.appAt >= m.joined).map((m) => (m.appAt! - m.joined) / DAY)),
    played: avgDays(fresh.filter((m) => m.firstPlayed && m.firstPlayed >= m.joined).map((m) => (m.firstPlayed! - m.joined) / DAY)),
  };
  // 날짜별 서로 다른 판 (오늘까지 DAILY_DAYS 일, 한국 날짜) · 시간대별(0~23시, 최근 4주)
  const kday = (t: number) => Math.floor((t + 9 * 3_600_000) / DAY);
  const today = kday(now), daily = Array(DAILY_DAYS).fill(0) as number[], hours = Array(24).fill(0) as number[];
  const dSeen = new Set<number>();
  for (const r of rows) {
    if (dSeen.has(r.g)) continue;
    dSeen.add(r.g);
    const i = DAILY_DAYS - 1 - (today - kday(r.t));
    if (i >= 0 && i < DAILY_DAYS) daily[i]++;
    if (r.t >= now - 28 * DAY) hours[new Date(r.t + 9 * 3_600_000).getUTCHours()]++;
  }
  // 위 고리 넷: 이번 주 활동률 · 모임 판 비율 · 온보딩(최근 4주 가입 중 모임 판 3판) · 앱 쓰는 멤버
  const base = members.filter((m) => !m.pending).length;
  const rings = {
    active: cur.active, base, activePrev: periods.week.prev.active,
    crew: cur.crew, games: cur.games, crewPrevRate: periods.week.prev.games ? Math.round((periods.week.prev.crew / periods.week.prev.games) * 100) : null,
    settled: funnel.crew3, joined: funnel.joined,
    app: members.filter((m) => m.app).length, linked: members.filter((m) => m.riotId).length, total: members.length,
  };
  // 잘하고 있는 멤버 (v3.160): 최근 2주, 다섯 기준의 합 100점 — 활동량 · 참여도(모임 판 비율) · 꾸준함(판을 한 날) · 어울림(함께한 서로 다른 멤버) · 성적(Prism 점수)
  const recentGames = new Map<number, string[]>();
  for (const r of rows) if (r.t >= since) (recentGames.get(r.g) ?? recentGames.set(r.g, []).get(r.g)!).push(r.id);
  const daysOf = new Map<string, Set<number>>(), matesN = new Map<string, Set<string>>();
  for (const r of rows) if (r.t >= since) (daysOf.get(r.id) ?? daysOf.set(r.id, new Set()).get(r.id)!).add(kday(r.t));
  for (const ids of recentGames.values()) for (const a of ids) for (const b of ids) if (a !== b) (matesN.get(a) ?? matesN.set(a, new Set()).get(a)!).add(b);
  const cand = members.filter((m) => !m.pending && (per.get(m.id)?.n ?? 0) >= STAR_MIN);
  const maxN = Math.max(1, ...cand.map((m) => per.get(m.id)!.n)), maxM = Math.max(1, ...cand.map((m) => matesN.get(m.id)?.size ?? 0));
  const picks = cand.map((m) => {
    const s = per.get(m.id)!, days = daysOf.get(m.id)?.size ?? 0, mates = matesN.get(m.id)?.size ?? 0, score = rankScore(s.w, s.n);
    const pts = {
      act: PICK_POINTS.act * (s.n / maxN), crew: PICK_POINTS.crew * (s.crew / s.n), days: PICK_POINTS.days * Math.min(1, days / 14),
      mates: PICK_POINTS.mates * (mates / maxM), perf: PICK_POINTS.perf * Math.max(0, Math.min(1, (score - 400) / 250)),
    };
    const r1 = (v: number) => Math.round(v * 10) / 10;
    return { ...face(m), n: s.n, w: s.w, crew: s.crew, days, mates, score, pts: { act: r1(pts.act), crew: r1(pts.crew), days: r1(pts.days), mates: r1(pts.mates), perf: r1(pts.perf) }, total: Math.round(pts.act + pts.crew + pts.days + pts.mates + pts.perf) };
  }).sort((a, b) => b.total - a.total || b.n - a.n).slice(0, 5);
  // 멤버 수 흐름 (주마다 그 주 끝까지 가입한 멤버)
  const memberWeeks = weeks.map((w) => members.filter((m) => m.joined < w.start + WEEK).length);
  return {
    weeks,
    periods, heat, funnel, funnelDays, memberWeeks, weekInto: into,
    daily, today, hours, rings, picks,
    kpi: {
      members: members.length,
      joinedWeek: members.filter((m) => m.joined >= ws).length,
      active: cur.active, activePrev: prev.active,
      crew: cur.crew, crewPrev: prev.crew,
      online: members.filter((m) => now - (m.seen || 0) < 150_000).length,
      app: members.filter((m) => m.app).length,
      linked: members.filter((m) => m.riotId).length,
    },
    levels: { pending: members.filter((m) => m.pending).length, none: lv(0), associate: lv(1), regular: lv(2), excellent: lv(3), staff: lv(5) },
    stars,
    care: care.slice(0, 8),
    careTotal: care.length,
  };
}

/**
 * 단계를 정한다 (0 승인 대기 · 1 준회원 · 2 정회원 · 3 우수회원). 디스코드의 지금 역할을 다시 읽고 바뀌는 역할만 붙이고 뗀다.
 * 1 이상이 되면 승인으로 보고, 초대한 회원이 있으면 초대 보너스를 확정한다.
 */
export async function applyLevel(env: Env, me: Pick<Member, 'id' | 'nick'>, target: Member, level: number): Promise<{ from: number; to: number }> {
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
    // 초대 보너스는 초대한 사람이 승인된 회원일 때만 (v3.107-4). 승인 대기 중에 초대한 친구는, 초대한 사람이 승인되는 순간 함께 확정 (v3.188)
    const inv = (await env.DB.prepare('SELECT invited_by AS i FROM members WHERE id = ?').bind(target.id).first<{ i: string | null }>())?.i;
    if (inv && await approvedId(env, inv)) await env.DB.prepare('INSERT OR IGNORE INTO invite_rewards (invitee, inviter, at) VALUES (?, ?, ?)').bind(target.id, inv, now).run();
    await env.DB.prepare('INSERT OR IGNORE INTO invite_rewards (invitee, inviter, at) SELECT id, ?1, ?2 FROM members WHERE invited_by = ?1 AND approved_at IS NOT NULL').bind(target.id, now).run();
  }
  return { from, to: level };
}

/** 채널에 알린다 (실패해도 운영 처리는 그대로) */
export async function cheer(env: Env, content: string, users: string[]) {
  if (!env.BOT_CHANNEL_ID || !env.DISCORD_BOT_TOKEN) return;
  await sendToChannel(env, env.BOT_CHANNEL_ID, { content, allowed_mentions: { users } }).catch(() => false);
}

/** 승인된 회원인가 (관리자 · 준회원 이상 · 특별회원) */
async function approvedId(env: Env, id: string) {
  const m = await env.DB.prepare('SELECT tier, discord_roles FROM members WHERE id = ?').bind(id).first<Pick<Member, 'tier' | 'discord_roles'>>();
  return Boolean(m && (m.tier === 'admin' || levelOf(m) >= 1 || isSpecial(m)));
}

async function setInviterIfEmpty(env: Env, target: Member, inviter: unknown) {
  if (typeof inviter !== 'string' || !inviter || inviter === target.id || target.invited_by) return;
  const ok = await env.DB.prepare('SELECT 1 AS x FROM members WHERE id = ?').bind(inviter).first();
  if (!ok) throw new HttpError(400, '추천인으로 고른 회원을 찾지 못했어요.');
  await env.DB.prepare('UPDATE members SET invited_by = ? WHERE id = ? AND invited_by IS NULL').bind(inviter, target.id).run();
  target.invited_by = inviter;
}

// ───────── 카톡방 명단 (v3.191) ─────────
/** 이름 맞추기: 태그(#…)를 떼고 띄어쓰기를 지우고 소문자로 — 톡방 이름 '멍 대 장' ↔ 롤 이름 '멍대장#KR1' */
export const kakaoKey = (s: string | null | undefined) => (s ?? '').split('#')[0].replace(/\s+/g, '').toLowerCase();
const KAKAO_LIST = 'kakao-list';
async function kakaoList(env: Env): Promise<string[]> {
  const r = await env.DB.prepare('SELECT v FROM ext_cache WHERE k = ?').bind(KAKAO_LIST).first<{ v: string }>().catch(() => null);
  try { const v = JSON.parse(r?.v ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}
async function saveKakaoList(env: Env, names: string[]) {
  await env.DB.prepare('INSERT OR REPLACE INTO ext_cache (k, v, at) VALUES (?, ?, ?)').bind(KAKAO_LIST, JSON.stringify(names.slice(0, 500)), Date.now()).run();
}
/**
 * 명단에 남아 있는 이름(아직 Prism 에 없던 분)과 맞는 회원이 생겼으면 카톡방 확인을 붙이고 명단에서 뺀다.
 * 롤 이름(모든 연결 계정)·디스코드 이름·디스코드 별명으로 맞춘다. 운영 멤버 화면을 열 때·매일 크론에서 부른다.
 */
export async function applyKakaoList(env: Env, by: string | null = null): Promise<{ matched: { id: string; nick: string; name: string }[]; left: string[] }> {
  const names = await kakaoList(env);
  if (!names.length) return { matched: [], left: [] };
  const [{ results: mem }, { results: acc }] = await Promise.all([
    env.DB.prepare('SELECT id, nick, discord_name, discord_nick, kakao_at FROM members').all<{ id: string; nick: string; discord_name: string | null; discord_nick: string | null; kakao_at: number | null }>(),
    env.DB.prepare('SELECT member_id AS id, riot_id FROM member_accounts').all<{ id: string; riot_id: string | null }>(),
  ]);
  const byKey = new Map<string, Set<string>>();
  const add = (k: string, id: string) => { if (k) (byKey.get(k) ?? byKey.set(k, new Set()).get(k)!).add(id); };
  for (const m of mem) { add(kakaoKey(m.nick), m.id); add(kakaoKey(m.discord_name), m.id); add(kakaoKey(m.discord_nick), m.id); }
  for (const a of acc) add(kakaoKey(a.riot_id), a.id);
  const info = new Map(mem.map((m) => [m.id, m]));
  const matched: { id: string; nick: string; name: string }[] = [], left: string[] = [];
  for (const name of names) {
    const ids = byKey.get(kakaoKey(name));
    // 두 명 이상과 맞으면 누구인지 모르니 명단에 남겨 둔다 (운영진이 멤버 서랍에서 직접)
    if (ids?.size === 1) { const id = [...ids][0]; matched.push({ id, nick: info.get(id)?.nick ?? '', name }); } else left.push(name);
  }
  const now = Date.now();
  const todo = matched.filter((x) => !info.get(x.id)?.kakao_at);
  if (todo.length) await env.DB.batch(todo.map((x) => env.DB.prepare('UPDATE members SET kakao_at = ?, kakao_by = ? WHERE id = ? AND kakao_at IS NULL').bind(now, by, x.id)));
  if (left.length !== names.length) await saveKakaoList(env, left);
  return { matched, left };
}

/** POST /api/staff/kakao-names { text } — 카톡방 명단 붙여 넣기. 쉼표·줄바꿈으로 나눈 이름을 명단에 더하고 바로 맞춘다 */
export async function staffKakaoNames(req: Request, env: Env, me: Member) {
  assertStaff(me);
  const body = (await req.json().catch(() => ({}))) as { text?: unknown; clear?: unknown };
  if (body.clear === true) { await saveKakaoList(env, []); return json({ ok: true, matched: [], left: [] }); }
  const text = typeof body.text === 'string' ? body.text.slice(0, 20000) : '';
  const names = text.split(/[,\n\r\t]+/).map((x) => x.trim()).filter((x) => x.length >= 1 && x.length <= 40);
  if (!names.length) throw new HttpError(400, '이름을 쉼표나 줄바꿈으로 나눠 붙여 넣어 주세요.');
  const prev = await kakaoList(env);
  const seen = new Set(prev.map(kakaoKey));
  const merged = [...prev];
  for (const n of names) if (kakaoKey(n) && !seen.has(kakaoKey(n))) { seen.add(kakaoKey(n)); merged.push(n); }
  await saveKakaoList(env, merged);
  const r = await applyKakaoList(env, me.id);
  // 이번에 붙여 넣은 이름 기준으로 결과를 돌려준다 (이미 확인된 회원도 '맞음'으로)
  const pasted = new Set(names.map(kakaoKey));
  const [{ results: mem }, { results: acc }] = await Promise.all([
    env.DB.prepare('SELECT id, nick, discord_name, discord_nick, kakao_at FROM members').all<{ id: string; nick: string; discord_name: string | null; discord_nick: string | null; kakao_at: number | null }>(),
    env.DB.prepare('SELECT member_id AS id, riot_id FROM member_accounts').all<{ id: string; riot_id: string | null }>(),
  ]);
  const hit = new Map<string, string>();
  for (const m of mem) for (const k of [m.nick, m.discord_name, m.discord_nick].map(kakaoKey)) if (k && pasted.has(k) && m.kakao_at) hit.set(m.id, m.nick);
  for (const a of acc) { const k = kakaoKey(a.riot_id); const m = mem.find((x) => x.id === a.id); if (k && pasted.has(k) && m?.kakao_at) hit.set(a.id, m.nick); }
  return json({ ok: true, matched: [...hit.entries()].map(([id, nick]) => ({ id, nick })), left: r.left.filter((n) => pasted.has(kakaoKey(n))), pending: r.left });
}

/** POST /api/staff/kakao-bulk { ids } — 카톡방 확인 한꺼번에 (v3.191, 처음 정리용: 멤버 화면에 보이는 멤버를 한 번에) */
export async function staffKakaoBulk(req: Request, env: Env, me: Member) {
  assertStaff(me);
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((x): x is string => typeof x === 'string' && /^[0-9A-Za-z_-]{1,40}$/.test(x)))].slice(0, 300) : [];
  if (!ids.length) throw new HttpError(400, '확인할 멤버를 골라 주세요.');
  const now = Date.now();
  await env.DB.batch(ids.map((id) => env.DB.prepare('UPDATE members SET kakao_at = ?, kakao_by = ? WHERE id = ? AND kakao_at IS NULL').bind(now, me.id, id)));
  return json({ ok: true, n: ids.length });
}

/** 정회원·우수회원은 카톡방 확인을 받은 회원만 (v3.190) */
function needKakao(target: Member) {
  if (!target.kakao_at) throw new HttpError(400, '카톡방에 있는지 먼저 확인해 주세요. 카톡방에 없는 멤버는 정회원·우수회원이 될 수 없어요.');
}

/** POST /api/staff/members/:id/:action — approve(승인 대기 → 준회원) · promote(정회원 심사 → 정회원, 카톡방 확인 필요) · level · special · kakao(카톡방 확인) · inviter */
export async function staffAction(req: Request, env: Env, me: Member, id: string, action: string) {
  assertStaff(me);
  const body = (await req.json().catch(() => ({}))) as { level?: unknown; on?: unknown; inviter?: unknown };
  // 카톡방 명단에 있는 이름이면 올리기 전에 확인을 붙여 둔다 (v3.191)
  if (action === 'promote' || action === 'level') await applyKakaoList(env, me.id).catch(() => null);
  const target = await memberRow(env, id);
  if (action === 'inviter') {
    await setInviterIfEmpty(env, target, body.inviter);
    // 이미 승인된 회원이면 보너스를 바로 확정
    if (target.invited_by && levelOf(target) >= 1 && await approvedId(env, target.invited_by)) await env.DB.prepare('INSERT OR IGNORE INTO invite_rewards (invitee, inviter, at) VALUES (?, ?, ?)').bind(target.id, target.invited_by, Date.now()).run();
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
  if (action === 'kakao') {
    const on = Boolean(body.on);
    await env.DB.prepare('UPDATE members SET kakao_at = ?, kakao_by = ? WHERE id = ?').bind(on ? Date.now() : null, on ? me.id : null, target.id).run();
    return json({ ok: true });
  }
  if (action === 'promote') {
    if (levelOf(target) !== 1) throw new HttpError(400, '준회원만 정회원 심사를 받을 수 있어요.');
    needKakao(target);
    const r = await applyLevel(env, me, target, 2);
    await cheer(env, `🎉 <@${target.id}> 님이 **정회원**이 되었어요!`, [target.id]);
    return json({ ok: true, ...r });
  }
  if (action === 'level') {
    const lv = Number(body.level);
    if (![0, 1, 2, 3].includes(lv)) throw new HttpError(400, '단계는 0~3 이에요.');
    if (lv >= 2 && lv > Math.min(levelOf(target), 3)) needKakao(target);
    const r = await applyLevel(env, me, target, lv);
    if (r.from < lv && lv >= 2) await cheer(env, `🎉 <@${target.id}> 님이 **${STEPS[lv - 1].name}**${lv === 3 ? '으로 선발되었어요' : '이 되었어요'}!`, [target.id]);
    return json({ ok: true, ...r });
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
    `SELECT m.id, m.nick, ${FACE('m')}, m.tier, m.discord_roles, m.app_first_at, m.joined_at AS joined, r.at AS rewardedAt
     FROM members m LEFT JOIN invite_rewards r ON r.invitee = m.id WHERE m.invited_by = ? ORDER BY m.joined_at DESC`,
  ).bind(me.id).all<Record<string, any>>();
  const friends = results.map(({ tier, discord_roles, app_first_at, ...r }) => ({ ...r, pending: isPending({ tier, discord_roles, app_first_at }), rewardedAt: (r.rewardedAt ?? null) as number | null, approved: Boolean(r.rewardedAt) || levelOf({ tier, discord_roles }) >= 1 }));
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
  if (!unapproved(me)) return json({ ok: false, reason: 'member' });
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

/** GET /api/members/search?q= — 멤버 화면 '멤버 검색' (v3.149): 롤 이름·디스코드 이름으로 모든 회원 (최대 8명, 승인 대기 표시) */
export async function searchMembers(env: Env, q: string | null) {
  const t = (q ?? '').trim().replace(/[%_]/g, '').slice(0, 30);
  if (!t) return json({ members: [] });
  const like = `%${t}%`;
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.nick, ${FACE('m')}, m.tier, m.discord_roles, m.app_first_at,
       (SELECT COUNT(*) FROM participants p WHERE p.member_id = m.id) AS n, (SELECT COALESCE(SUM(p.win), 0) FROM participants p WHERE p.member_id = m.id) AS w
     FROM members m
     WHERE m.nick LIKE ?1 OR m.riot_id LIKE ?1 OR m.discord_name LIKE ?1 OR m.id IN (SELECT member_id FROM member_accounts WHERE riot_id LIKE ?1)
     ORDER BY CASE WHEN m.nick LIKE ?2 THEN 0 ELSE 1 END, MAX(COALESCE(m.app_seen_at, 0), COALESCE(m.web_seen_at, 0), COALESCE(m.last_seen_at, 0)) DESC LIMIT 8`,
  ).bind(like, `${t}%`).all<Record<string, any>>();
  return json({ members: results.map(({ tier, discord_roles, app_first_at, ...r }) => ({ ...r, pending: isPending({ tier, discord_roles, app_first_at }) })) });
}

/** GET /public/invite/:code — 초대 받은 사람에게 보여 줄 초대한 사람 (이름·얼굴만, 로그인 없이) */
export async function publicInvite(env: Env, code: string) {
  const m = await env.DB.prepare(`SELECT m.nick, ${FACE('m')} FROM members m WHERE m.invite_code = ?`).bind(code).first<{ nick: string; skin: number | null; main: number | null }>();
  if (!m) throw new HttpError(404, '없는 초대 링크예요.');
  return json({ nick: m.nick, skin: m.skin, main: m.main });
}
