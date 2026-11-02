/**
 * 가입 신청 (CLAUDE.md v3.148).
 *  공개(로그인 없이): GET /public/join[?code=] 초대한 멤버 + 모임 숫자 · POST /public/apply 신청 · GET /public/apply/:token 내 신청
 *  운영(운영진만): GET /api/staff/applications · POST /api/staff/applications/:id · POST /api/staff/applications/room
 *  로그인한 회원이 롤 계정을 연결할 때 확정된 신청과 롤 이름이 맞으면 바로 준회원 승인 + 추천인 (onRiotLinked).
 * 신청자의 전화번호·실명·나이는 받지 않는다. 주소(IP)는 해시만 남겨 하루 신청 수를 센다.
 */
import { sendDM } from './bot.js';
import { widget } from './discord-now.js';
import { can, isSpecial, levelOf, unapproved } from './roles.js';
import { applyLevel, cheer, staffIds } from './staff.js';
import { FACE, HttpError, json, type Env, type Member } from './util.js';
import { INVITE_BONUS } from '../../packages/core/src/shop.js';
import { weekStart } from '../../packages/core/src/missions.js';
import { JOIN, cleanRiotId, joinNo, riotKey, type JoinStats, type JoinStatus, type MyApplication, type StaffApplication } from '../../packages/core/src/join.js';

const DAY = 86_400_000, HOUR = 3_600_000;
const kstDay = (t: number) => Math.floor((t + 9 * HOUR) / DAY);
const SITE = 'https://przm.web.app';
const OPEN: JoinStatus[] = ['new', 'interview', 'hold'];

type Row = {
  id: number; num: number; token: string; riot_id: string; riot_key: string; kakao: string; times: string; note: string | null;
  invite_code: string | null; inviter: string | null; status: JoinStatus; signs: string; sent_kakao: number; sent_discord: number;
  memo: string | null; log: string; member_id: string | null; created_at: number; updated_at: number;
};
const arr = <T,>(v: string | null | undefined): T[] => { try { const x = JSON.parse(v ?? '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };
const approvedMember = (m: Pick<Member, 'tier' | 'discord_roles'>) => m.tier === 'admin' || levelOf(m) >= 1 || isSpecial(m);

// ───────── 면접방 설정 ─────────

async function room(env: Env): Promise<{ url: string; pw: string | null }> {
  const r = await env.DB.prepare('SELECT v FROM ext_cache WHERE k = ?').bind('interview-room').first<{ v: string }>().catch(() => null);
  try { const v = JSON.parse(r?.v ?? '{}'); return { url: typeof v.url === 'string' ? v.url : '', pw: typeof v.pw === 'string' && v.pw ? v.pw : null }; } catch { return { url: '', pw: null }; }
}

// ───────── 공개: 초대 페이지 ─────────

let statsMemo: { at: number; v: JoinStats } | null = null;
async function stats(env: Env, now = Date.now()): Promise<JoinStats> {
  if (statsMemo && now - statsMemo.at < 60_000) return statsMemo.v;
  const today = kstDay(now);
  const monthStart = (() => { const d = new Date(now + 9 * HOUR); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - 9 * HOUR; })();
  const since28 = now - 28 * DAY;
  const [mem, online, week, month, recent, yday, w] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN app_first_at > 0 THEN 1 ELSE 0 END) AS app FROM members`).first<{ n: number; app: number | null }>(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM members WHERE app_seen_at > ?1 OR web_seen_at > ?1').bind(now - 150_000).first<{ n: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM matches WHERE played_at >= ?').bind(weekStart(now)).first<{ n: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM matches WHERE played_at >= ?').bind(monthStart).first<{ n: number }>(),
    env.DB.prepare('SELECT played_at AS t, crew_count AS c FROM matches WHERE played_at >= ?').bind(Math.min(since28, monthStart)).all<{ t: number; c: number }>(),
    env.DB.prepare('SELECT COUNT(DISTINCT p.member_id) AS n FROM participants p JOIN matches m ON m.game_id = p.game_id WHERE m.played_at >= ?1 AND m.played_at < ?2')
      .bind((today - 1) * DAY - 9 * HOUR, today * DAY - 9 * HOUR).first<{ n: number }>(),
    widget(env).catch(() => null),
  ]);
  const hours = Array.from({ length: 24 }, () => 0);
  let in28 = 0, crew28 = 0;
  const days = new Set<number>();
  for (const r of recent.results) {
    if (r.t >= since28) { in28++; if (r.c >= 2) crew28++; hours[new Date(r.t + 9 * HOUR).getUTCHours()]++; }
    if (r.t >= monthStart) days.add(kstDay(r.t));
  }
  const v: JoinStats = {
    members: mem?.n ?? 0, online: online?.n ?? 0, week: week?.n ?? 0, month: month?.n ?? 0,
    together: in28 ? Math.round((crew28 / in28) * 100) : 0, days: days.size, monthDays: today - kstDay(monthStart) + 1,
    hours, voice: w && w !== 'off' ? w.members.filter((m) => m.channel_id).length : null, appUsers: mem?.app ?? 0, yesterday: yday?.n ?? 0,
  };
  statsMemo = { at: now, v };
  return v;
}

async function inviterOf(env: Env, code: string | null) {
  if (!code || !/^[a-z0-9]{4,12}$/.test(code)) return null;
  const m = await env.DB.prepare(`SELECT m.id, m.nick, m.intro, m.tier, m.discord_roles, ${FACE('m')} FROM members m WHERE m.invite_code = ?`).bind(code).first<Record<string, any>>();
  if (!m || !approvedMember({ tier: m.tier, discord_roles: m.discord_roles })) return null;
  return { id: m.id as string, nick: m.nick as string, intro: (m.intro as string) || null, skin: m.skin as number | null, main: m.main as number | null };
}

/** GET /public/join?code= — 초대한 멤버(승인된 회원일 때만) + 모임 숫자. 1분 담아 둔다 */
export async function joinLanding(env: Env, code: string | null) {
  const [inv, st] = await Promise.all([inviterOf(env, code), stats(env)]);
  const res = json({ inviter: inv ? { nick: inv.nick, intro: inv.intro, skin: inv.skin, main: inv.main } : null, stats: st });
  res.headers.set('Cache-Control', 'public, max-age=60');
  return res;
}

// ───────── 공개: 신청 ─────────

async function ipHash(req: Request) {
  const ip = req.headers.get('CF-Connecting-IP') ?? '';
  if (!ip) return null;
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`prism-join:${ip}:${kstDay(Date.now())}`));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const token = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
const logAdd = (log: string, by: string, act: string) => JSON.stringify([...arr<{ at: number; by: string; act: string }>(log), { at: Date.now(), by, act }].slice(-40));

function mine(r: Row, inviterNick: string | null, rm: { url: string; pw: string | null }, discord: string | null): MyApplication {
  const waiting = OPEN.includes(r.status);
  return {
    no: joinNo(r.num), status: r.status, riotId: r.riot_id, kakao: r.kakao, inviter: inviterNick,
    room: waiting && rm.url ? rm : null, discord: r.status === 'confirmed' || r.status === 'invited' || r.status === 'joined' ? discord : null, createdAt: r.created_at,
  };
}

/** POST /public/apply { code?, riotId, kakao, times[], note?, agree } */
export async function apply(req: Request, env: Env, ctx?: ExecutionContext) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.agree !== true) throw new HttpError(400, '규칙 7개를 모두 확인해 주세요.');
  const riotId = cleanRiotId(b.riotId);
  if (!riotId) throw new HttpError(400, "롤 이름을 '이름#태그'로 적어 주세요. 예: 은하수산책#KR1");
  const kakao = typeof b.kakao === 'string' ? b.kakao.trim().slice(0, JOIN.kakaoMax) : '';
  if (kakao.length < 1) throw new HttpError(400, '카카오톡 오픈프로필 이름을 적어 주세요.');
  const times = Array.isArray(b.times) ? [...new Set(b.times.filter((t): t is string => ['day', 'evening', 'night', 'dawn'].includes(t as string)))] : [];
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, JOIN.noteMax) : null;
  const code = typeof b.code === 'string' && /^[a-z0-9]{4,12}$/.test(b.code) ? b.code : null;
  const key = riotKey(riotId);
  const now = Date.now();
  const rm = await room(env);

  // 이미 멤버 · 이미 신청
  const member = await env.DB.prepare('SELECT id FROM members WHERE lower(replace(riot_id, \' \', \'\')) = ?').bind(key).first();
  if (member) throw new HttpError(409, '이미 Prism 멤버인 롤 계정이에요. 디스코드로 로그인해 주세요.');
  const dup = await env.DB.prepare('SELECT * FROM applications WHERE riot_key = ?').bind(key).first<Row>();
  if (dup) {
    if (dup.status === 'rejected') throw new HttpError(409, '이번에는 함께하기 어려워요. 찾아와 주셔서 고마워요.');
    const inv = dup.inviter ? (await env.DB.prepare('SELECT nick FROM members WHERE id = ?').bind(dup.inviter).first<{ nick: string }>())?.nick ?? null : null;
    return json({ token: dup.token, dup: true, mine: mine(dup, inv, rm, env.DISCORD_INVITE_URL ?? null) });
  }

  // 하루 상한 (링크 하나 · 같은 곳)
  const ip = await ipHash(req);
  const dayStart = kstDay(now) * DAY - 9 * HOUR;
  if (code) {
    const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM applications WHERE invite_code = ? AND created_at >= ?').bind(code, dayStart).first<{ n: number }>())?.n ?? 0;
    if (n >= JOIN.perCodeDay) throw new HttpError(429, '오늘 이 초대 링크로 신청이 많았어요. 내일 다시 신청해 주세요.');
  }
  if (ip) {
    const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM applications WHERE ip_hash = ?').bind(ip).first<{ n: number }>())?.n ?? 0;
    if (n >= JOIN.perIpDay) throw new HttpError(429, '잠시 뒤에 다시 신청해 주세요.');
  }

  const inv = await inviterOf(env, code);
  // 면접 번호: 100~999 중 비어 있는 번호 (다 차면 네 자리)
  let num = 0;
  for (let i = 0; i < 20 && !num; i++) {
    const n = 100 + Math.floor(Math.random() * (i < 15 ? 900 : 9000));
    if (!(await env.DB.prepare('SELECT 1 FROM applications WHERE num = ?').bind(n).first())) num = n;
  }
  if (!num) throw new HttpError(503, '잠시 뒤에 다시 신청해 주세요.');
  const t = token();
  await env.DB.prepare(
    `INSERT INTO applications (num, token, riot_id, riot_key, kakao, times, note, invite_code, inviter, status, log, ip_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)`,
  ).bind(num, t, riotId, key, kakao, JSON.stringify(times), note, code, inv?.id ?? null, logAdd('[]', '신청자', '신청'), ip, now, now).run();
  const row = (await env.DB.prepare('SELECT * FROM applications WHERE token = ?').bind(t).first<Row>())!;
  const n = notifyStaff(env, row, inv?.nick ?? null).catch(() => {});
  if (ctx) ctx.waitUntil(n); else await n;
  return json({ token: t, mine: mine(row, inv?.nick ?? null, rm, env.DISCORD_INVITE_URL ?? null) });
}

/** GET /public/apply/:token — 내 신청 */
export async function myApplication(env: Env, t: string) {
  const r = await env.DB.prepare('SELECT * FROM applications WHERE token = ?').bind(t).first<Row>();
  if (!r) throw new HttpError(404, '신청을 찾지 못했어요. 기간이 지나 정리되었을 수 있어요.');
  const inv = r.inviter ? (await env.DB.prepare('SELECT nick FROM members WHERE id = ?').bind(r.inviter).first<{ nick: string }>())?.nick ?? null : null;
  return json(mine(r, inv, await room(env), env.DISCORD_INVITE_URL ?? null));
}

const TIME_KO: Record<string, string> = { day: '낮', evening: '저녁', night: '밤', dawn: '새벽' };
/** 새 신청을 운영진에게 DM (실패해도 신청은 그대로, 운영 메뉴의 빨간 점이 함께 켜진다) */
async function notifyStaff(env: Env, r: Row, inviter: string | null) {
  if (!env.DISCORD_BOT_TOKEN) return;
  const ids = (await staffIds(env)).slice(0, 6);
  const times = arr<string>(r.times).map((x) => TIME_KO[x]).filter(Boolean).join(' · ');
  const payload = {
    embeds: [{
      color: 0xfee500, title: `새 가입 신청 · ${joinNo(r.num)}`,
      description: [`**${r.riot_id}** · 카톡 '${r.kakao}'${times ? ` · ${times}` : ''}`, `초대: ${inviter ?? '추천인 없음'}`, r.note ? `"${r.note}"` : ''].filter(Boolean).join('\n'),
    }],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: '운영 화면에서 보기', url: `${SITE}/staff/join` }] }],
  };
  await Promise.all(ids.map((id) => sendDM(env, id, payload)));
}

// ───────── 운영 ─────────

function assertStaff(me: Member) { if (!can(me, 'manage')) throw new HttpError(403, '운영진만 쓸 수 있어요.'); }
async function signsNeeded(env: Env) { return Math.max(1, Math.min(JOIN.signs, (await staffIds(env)).length)); }

/** 처리할 신청 (운영 메뉴 빨간 점): 신청 · 확정(초대 보내기 전) */
export async function joinTodo(env: Env): Promise<string[]> {
  const { results } = await env.DB.prepare(`SELECT id FROM applications WHERE status IN ('new', 'confirmed')`).all<{ id: number }>().catch(() => ({ results: [] as { id: number }[] }));
  return results.map((r) => `a:${r.id}`);
}

/** GET /api/staff/applications */
export async function staffApplications(env: Env, me: Member) {
  assertStaff(me);
  const now = Date.now();
  const { results } = await env.DB.prepare(`SELECT * FROM applications WHERE status != 'joined' OR updated_at > ? ORDER BY created_at DESC LIMIT 200`).bind(now - 7 * DAY).all<Row>();
  const ids = new Set<string>();
  for (const r of results) { if (r.inviter) ids.add(r.inviter); if (r.member_id) ids.add(r.member_id); for (const s of arr<string>(r.signs)) ids.add(s); }
  const people = new Map<string, { id: string; nick: string; skin: number | null; main: number | null }>();
  if (ids.size) {
    const { results: ms } = await env.DB.prepare(`SELECT m.id, m.nick, ${FACE('m')} FROM members m WHERE m.id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify([...ids])).all<{ id: string; nick: string; skin: number | null; main: number | null }>();
    for (const m of ms) people.set(m.id, m);
  }
  const dayStart = kstDay(now) * DAY - 9 * HOUR;
  const codeToday = new Map<string, number>();
  for (const r of results) if (r.invite_code && r.created_at >= dayStart) codeToday.set(r.invite_code, (codeToday.get(r.invite_code) ?? 0) + 1);
  const items: StaffApplication[] = results.map((r) => ({
    id: r.id, no: joinNo(r.num), status: r.status, riotId: r.riot_id, kakao: r.kakao, times: arr<string>(r.times), note: r.note,
    inviter: r.inviter ? people.get(r.inviter) ?? null : null, codeToday: r.invite_code ? codeToday.get(r.invite_code) ?? 0 : 0,
    signs: arr<string>(r.signs).map((id) => ({ id, nick: people.get(id)?.nick ?? '운영진' })),
    sentKakao: Boolean(r.sent_kakao), sentDiscord: Boolean(r.sent_discord), memo: r.memo,
    member: r.member_id ? { id: r.member_id, nick: people.get(r.member_id)?.nick ?? '' } : null,
    createdAt: r.created_at, updatedAt: r.updated_at, log: arr(r.log),
  }));
  // '신청서와 연결'에 고를 수 있는 회원: 아직 승인 전인 회원
  const { results: pend } = await env.DB.prepare('SELECT id, nick, tier, discord_roles, app_first_at FROM members ORDER BY joined_at DESC LIMIT 300').all<Pick<Member, 'id' | 'nick' | 'tier' | 'discord_roles' | 'app_first_at'>>();
  const pendingMembers = pend.filter((m) => unapproved(m as Member)).map((m) => ({ id: m.id, nick: m.nick })).slice(0, 50);
  // 열어 본 처리할 신청은 '본 것'으로 (빨간 점)
  const todo = await joinTodo(env);
  // 멤버 쪽 '본 것'은 그대로 두고 신청 쪽만 바꾼다
  const seen = new Set<string>(arr<string>(me.staff_seen ?? '[]'));
  if (todo.some((x) => !seen.has(x))) await env.DB.prepare('UPDATE members SET staff_seen = ? WHERE id = ?').bind(JSON.stringify([...[...seen].filter((x) => !x.startsWith('a:')), ...todo]), me.id).run();
  return json({ items, me: me.id, signsNeeded: await signsNeeded(env), room: await room(env), pendingMembers });
}

/** POST /api/staff/applications/room { url, pw } */
export async function setRoom(req: Request, env: Env, me: Member) {
  assertStaff(me);
  const b = (await req.json().catch(() => ({}))) as { url?: unknown; pw?: unknown };
  const url = typeof b.url === 'string' ? b.url.trim() : '';
  if (url && !/^https:\/\/open\.kakao\.com\/o\/[0-9A-Za-z]+$/.test(url)) throw new HttpError(400, "오픈채팅 주소는 'https://open.kakao.com/o/…' 모양이에요.");
  const pw = typeof b.pw === 'string' ? b.pw.trim().slice(0, 12) : '';
  await env.DB.prepare('INSERT INTO ext_cache (k, v, at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, at = excluded.at')
    .bind('interview-room', JSON.stringify({ url, pw }), Date.now()).run();
  return json({ ok: true });
}

/** 확정된 신청을 회원과 이어 준다: 추천인(비어 있으면) + 준회원 승인 + 채널 축하 */
async function joinMember(env: Env, r: Row, target: Member, actor: Pick<Member, 'id' | 'nick'>) {
  if (r.inviter && !target.invited_by && r.inviter !== target.id) {
    await env.DB.prepare('UPDATE members SET invited_by = ? WHERE id = ? AND invited_by IS NULL').bind(r.inviter, target.id).run();
    target.invited_by = r.inviter;
  }
  const res = unapproved(target) ? await applyLevel(env, actor, target, 1) : null;
  await env.DB.prepare(`UPDATE applications SET status = 'joined', member_id = ?, log = ?, updated_at = ? WHERE id = ?`).bind(target.id, logAdd(r.log, actor.nick, '가입 완료'), Date.now(), r.id).run();
  if (res && res.from === 0) {
    const inv = target.invited_by;
    await cheer(env, `🎉 <@${target.id}> 님이 Prism 멤버가 되었어요! 반갑게 맞아 주세요.${inv ? `\n초대해 준 <@${inv}> 님께는 **${INVITE_BONUS} 피스**를 드렸어요.` : ''}`, inv ? [target.id, inv] : [target.id]);
  }
}

/** 롤 계정을 연결한 순간: 확정·초대한 신청과 롤 이름이 맞으면 바로 준회원 (crew.ts linkRiot) */
export async function onRiotLinked(env: Env, memberId: string, riotId: string | null) {
  if (!riotId) return;
  const r = await env.DB.prepare(`SELECT * FROM applications WHERE riot_key = ? AND status IN ('confirmed', 'invited')`).bind(riotKey(riotId)).first<Row>();
  if (!r) return;
  const target = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(memberId).first<Member>();
  if (!target) return;
  const signer = arr<string>(r.signs)[0];
  const actor = signer ? await env.DB.prepare('SELECT id, nick FROM members WHERE id = ?').bind(signer).first<{ id: string; nick: string }>() : null;
  await joinMember(env, r, target, actor ?? { id: memberId, nick: '가입 신청' });
}

/** POST /api/staff/applications/:id { action, at, ... } — at = 화면이 본 updated_at (다른 운영진이 먼저 바꿨으면 409) */
export async function staffApplicationAction(req: Request, env: Env, me: Member, id: number) {
  assertStaff(me);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await env.DB.prepare('SELECT * FROM applications WHERE id = ?').bind(id).first<Row>();
  if (!r) throw new HttpError(404, '없는 신청이에요.');
  const action = String(b.action ?? '');
  const quiet = action === 'memo';
  if (!quiet && Number(b.at) !== r.updated_at) {
    const last = arr<{ by: string; act: string }>(r.log).at(-1);
    throw new HttpError(409, last ? `방금 ${last.by} 님이 '${last.act}'(으)로 바꿨어요. 새로 불러올게요.` : '방금 바뀌었어요. 새로 불러올게요.');
  }
  let status = r.status, signs = arr<string>(r.signs), act = '';
  let sk = r.sent_kakao, sd = r.sent_discord, memo = r.memo, inviter = r.inviter, riot = r.riot_id;
  const need = await signsNeeded(env);
  switch (action) {
    case 'interview': if (!['new', 'hold'].includes(status)) throw new HttpError(400, '이미 면접 중이에요.'); status = 'interview'; act = '면접 시작'; break;
    case 'confirm':
      if (!['new', 'interview', 'hold'].includes(status)) throw new HttpError(400, '확정할 수 없는 상태예요.');
      if (signs.includes(me.id)) throw new HttpError(400, '이미 확정을 눌렀어요. 다른 운영진을 기다려요.');
      signs = [...signs, me.id];
      status = signs.length >= need ? 'confirmed' : 'interview';
      act = signs.length >= need ? '확정' : `확정 ${signs.length}/${need}`;
      break;
    case 'unsign': signs = signs.filter((s) => s !== me.id); if (status === 'confirmed') status = 'interview'; act = '확정 취소'; break;
    case 'hold': status = 'hold'; act = '보류'; break;
    case 'reject': status = 'rejected'; signs = []; act = '거절'; break;
    case 'reopen': status = 'interview'; signs = []; act = '다시 면접'; break;
    case 'kakao': sk = b.on ? 1 : 0; act = sk ? '톡방 초대 보냄' : '톡방 초대 취소'; break;
    case 'discord': sd = b.on ? 1 : 0; act = sd ? '디스코드 초대 보냄' : '디스코드 초대 취소'; break;
    case 'invited': if (status !== 'confirmed') throw new HttpError(400, '확정된 신청만 옮길 수 있어요.'); status = 'invited'; act = '초대함'; break;
    case 'memo': memo = typeof b.memo === 'string' ? b.memo.trim().slice(0, 300) || null : null; act = '메모'; break;
    case 'riot': { const v = cleanRiotId(b.riotId); if (!v) throw new HttpError(400, "롤 이름은 '이름#태그'로 적어 주세요."); riot = v; act = `롤 이름 고침 → ${v}`; break; }
    case 'inviter': {
      const m = typeof b.inviter === 'string' ? await env.DB.prepare('SELECT id, tier, discord_roles FROM members WHERE id = ?').bind(b.inviter).first<Pick<Member, 'id' | 'tier' | 'discord_roles'>>() : null;
      if (!m || !approvedMember(m)) throw new HttpError(400, '추천인은 승인된 멤버만 될 수 있어요.');
      inviter = m.id; act = '추천인 지정'; break;
    }
    case 'link': {
      if (!['confirmed', 'invited'].includes(status)) throw new HttpError(400, '확정된 신청만 회원과 이을 수 있어요.');
      const target = typeof b.member === 'string' ? await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(b.member).first<Member>() : null;
      if (!target) throw new HttpError(400, '회원을 찾지 못했어요.');
      await joinMember(env, r, target, me);
      return json({ ok: true });
    }
    default: throw new HttpError(404, 'not found');
  }
  if (action === 'riot') {
    const key = riotKey(riot);
    const other = await env.DB.prepare('SELECT id FROM applications WHERE riot_key = ? AND id != ?').bind(key, r.id).first();
    if (other) throw new HttpError(409, '같은 롤 이름의 신청이 이미 있어요.');
    await env.DB.prepare('UPDATE applications SET riot_id = ?, riot_key = ? WHERE id = ?').bind(riot, key, r.id).run();
  }
  const now = quiet ? r.updated_at : Math.max(Date.now(), r.updated_at + 1);
  await env.DB.prepare('UPDATE applications SET status = ?, signs = ?, sent_kakao = ?, sent_discord = ?, memo = ?, inviter = ?, log = ?, updated_at = ? WHERE id = ?')
    .bind(status, JSON.stringify(signs), sk, sd, memo, inviter, quiet ? r.log : logAdd(r.log, me.nick, act), now, r.id).run();
  // 확정한 순간 이미 가입해 롤을 연결한 회원이 있으면 바로 잇는다
  if (status === 'confirmed' && r.status !== 'confirmed') {
    const m = await env.DB.prepare(`SELECT * FROM members WHERE lower(replace(riot_id, ' ', '')) = ?`).bind(riotKey(riot)).first<Member>();
    if (m) await joinMember(env, { ...r, status, signs: JSON.stringify(signs), updated_at: now }, m, me);
  }
  return json({ ok: true, at: now });
}

/** 매일 정리 (03:17): 오래 그대로인 신청·지난 거절/가입 기록 */
export async function joinSweep(env: Env, now = Date.now()) {
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM applications WHERE status IN ('new', 'interview', 'hold') AND updated_at < ?`).bind(now - JOIN.dropDays * DAY),
    env.DB.prepare(`DELETE FROM applications WHERE status IN ('rejected', 'joined') AND updated_at < ?`).bind(now - JOIN.keepDays * DAY),
  ]);
}
