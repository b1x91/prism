/**
 * 문의하기 (CLAUDE.md v3.100). 앱·웹 문의 창(`/api/me/inquiry`)과 디스코드 `/문의`(입력 창)가 같은 곳으로 들어온다.
 * 봇이 운영자(ADMIN_DISCORD_IDS 첫 번째)에게 누가·어디서·무엇을 보냈는지 정리한 DM을 보낸다 (앱 진단은 파일로).
 * 운영자가 DM 의 '답장하기'를 누르면 입력 창 → 회원에게 DM + 앱·웹 문의 창에 남는다. '해결'은 표시만 바꾼다.
 * 봇은 늘 켜 둔 프로그램이 아니라서 회원이 봇에게 직접 보낸 DM 은 읽지 못한다 — 그래서 입력은 창·명령으로 받는다.
 */
import { INQUIRY, INQUIRY_KIND_KO, INQUIRY_KINDS, type Inquiry, type InquiryContext, type InquiryKind, type InquiryStatus } from '../../packages/core/src/inquiry.js';
import { EPHEMERAL, V2, card, editMessage, faceUrl, line, reply, section, sendDM, text, thumb, webUrl, type Interaction } from './bot.js';
import { topRole } from './roles.js';
import { HttpError, body, json, type Env, type Member } from './util.js';

type Row = {
  id: number; member_id: string; kind: InquiryKind; body: string; source: Inquiry['source']; context: string | null; diag: string | null;
  at: number; status: InquiryStatus; reply: string | null; replied_at: number | null; admin_dm: string | null;
};
type Who = { nick: string; riot_id: string | null; discord_roles: string | null; profile_skin: number | null; main: number | null };

const KINDS = new Set<string>(INQUIRY_KINDS.map((k) => k.id));
const DIAG_MAX = 60_000;
const ACCENT: Record<InquiryKind, number> = { bug: 0xe5484d, idea: 0x7c9cff, account: 0xf1a33c, etc: 0x8b93a7 };
const LOL_KO: Record<NonNullable<InquiryContext['lol']>, string> = { off: '롤 꺼짐', on: '롤 켜짐', select: '챔프 고르는 중', game: '게임 중' };

const admins = (env: Env) => (env.ADMIN_DISCORD_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const kst = (t: number) => new Date(t + 9 * 3600_000).toISOString().slice(5, 16).replace('-', '/').replace('T', ' ');
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const quote = (s: string) => s.split('\n').map((l) => `> ${l}`).join('\n');

/** 앱·웹이 보낸 상태에서 아는 칸만, 짧게 */
function cleanContext(c: unknown): InquiryContext {
  const x = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
  const str = (v: unknown, n: number) => (typeof v === 'string' && v ? v.slice(0, n) : undefined);
  const lol = ['off', 'on', 'select', 'game'].includes(x.lol as string) ? (x.lol as InquiryContext['lol']) : undefined;
  return {
    app: str(x.app, 20), web: x.web === true ? true : undefined, lol,
    vision: typeof x.vision === 'boolean' ? x.vision : undefined, fullscreen: x.fullscreen === true ? true : undefined,
    path: str(x.path, 80), ua: str(x.ua, 200),
  };
}

const toItem = (r: Row): Inquiry => ({ id: r.id, kind: r.kind, body: r.body, source: r.source, at: r.at, status: r.status, reply: r.reply, repliedAt: r.replied_at });

async function listMine(env: Env, memberId: string): Promise<Inquiry[]> {
  const r = await env.DB.prepare('SELECT * FROM inquiries WHERE member_id = ? ORDER BY at DESC LIMIT 10').bind(memberId).all<Row>();
  return (r.results ?? []).map(toItem);
}

export async function myInquiries(env: Env, me: Member): Promise<Response> {
  return json({ items: await listMine(env, me.id) });
}

/** 접수: 확인 → 저장. 운영자 DM 은 응답을 늦추지 않게 뒤에서 (ctx 가 없으면 기다린다) */
async function create(env: Env, me: Member, kind: string, raw: string, source: Inquiry['source'], context: InquiryContext, diag: string | null, ctx?: ExecutionContext) {
  if (!KINDS.has(kind)) throw new HttpError(400, '문의 종류를 골라 주세요.');
  const msg = raw.trim();
  if (msg.length < INQUIRY.min) throw new HttpError(400, `${INQUIRY.min}자 이상 적어 주세요.`);
  if (msg.length > INQUIRY.max) throw new HttpError(400, `${INQUIRY.max}자까지 보낼 수 있어요.`);
  const now = Date.now();
  const recent = await env.DB.prepare('SELECT MAX(at) last, SUM(CASE WHEN at > ? THEN 1 ELSE 0 END) day FROM inquiries WHERE member_id = ?').bind(now - 86_400_000, me.id).first<{ last: number | null; day: number | null }>();
  if (recent?.last && now - recent.last < INQUIRY.gapMs) throw new HttpError(429, '조금 뒤에 다시 보내 주세요.');
  if ((recent?.day ?? 0) >= INQUIRY.perDay) throw new HttpError(429, '오늘은 더 보낼 수 없어요. 내일 다시 보내 주세요.');
  const ins = await env.DB.prepare('INSERT INTO inquiries (member_id, kind, body, source, context, diag, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(me.id, kind, msg, source, JSON.stringify(context), diag, now).run();
  const id = Number(ins.meta.last_row_id);
  const job = deliver(env, id).catch((e) => console.error('문의 전달 실패', e));
  if (ctx) ctx.waitUntil(job); else await job;
  return id;
}

export async function postInquiry(req: Request, env: Env, me: Member, ctx?: ExecutionContext): Promise<Response> {
  const b = await body<{ kind?: string; body?: string; context?: unknown; diag?: unknown }>(req);
  const context = cleanContext(b.context);
  const diag = typeof b.diag === 'string' && b.diag ? b.diag.slice(0, DIAG_MAX) : null;
  await create(env, me, String(b.kind ?? ''), String(b.body ?? ''), context.app ? 'app' : 'web', context, diag, ctx);
  return json({ ok: true, items: await listMine(env, me.id) });
}

async function load(env: Env, id: number) {
  const q = await env.DB.prepare('SELECT * FROM inquiries WHERE id = ?').bind(id).first<Row>();
  if (!q) return null;
  const who = await env.DB.prepare(`SELECT nick, riot_id, discord_roles, profile_skin,
      (SELECT champion_id FROM participants WHERE member_id = m.id GROUP BY champion_id ORDER BY COUNT(*) DESC LIMIT 1) main
    FROM members m WHERE id = ?`).bind(q.member_id).first<Who>();
  return { q, who };
}

/** 운영자 DM 카드: 누가 · 어디서 · 상태 · 내용 · 처리 */
function adminCard(env: Env, q: Row, who: Who | null, note?: string) {
  const ctx = cleanContext(q.context ? JSON.parse(q.context) : {});
  const role = who ? topRole(who)?.name ?? '준회원' : '알 수 없음';
  const nick = who?.nick ?? '탈퇴한 회원';
  const src = q.source === 'app' ? `앱 ${ctx.app ?? ''}`.trim() : q.source === 'web' ? '웹' : '디스코드 /문의';
  const state = [ctx.lol && LOL_KO[ctx.lol], ctx.vision != null && `자동 인식 ${ctx.vision ? '켜짐' : '꺼짐'}`, ctx.fullscreen && '전체 화면', ctx.path && `보던 화면 ${ctx.path}`].filter(Boolean);
  const head = [
    `### 문의 #${q.id} · ${INQUIRY_KIND_KO[q.kind]}`,
    `<@${q.member_id}> · **${nick}** · ${role}`,
    `-# ${src} · ${kst(q.at)}${state.length ? ` · ${state.join(' · ')}` : ''}${q.diag ? ' · 앱 진단 파일 첨부' : ''}`,
  ].join('\n');
  const face = who ? faceUrl(who.profile_skin, who.main) : '';
  const status = q.status === 'done' ? '-# 해결로 표시함' : q.status === 'replied' && q.reply ? `**보낸 답장** · ${kst(q.replied_at ?? Date.now())}\n${quote(cut(q.reply, 1500))}` : '-# 아직 답장하지 않았어요';
  return card([
    face ? section([head], thumb(face)) : text(head),
    line(),
    text(quote(q.body)),
    line(),
    text(note ? `${status}\n-# ${note}` : status),
    { type: 1, components: [
      { type: 2, style: 1, label: q.status === 'open' ? '답장하기' : '다시 답장', custom_id: `inq:reply:${q.id}` },
      { type: 2, style: 2, label: q.status === 'done' ? '해결됨' : '해결', custom_id: `inq:done:${q.id}`, disabled: q.status === 'done' },
      { type: 2, style: 5, label: '회원 페이지', url: `${webUrl(env)}/members/${q.member_id}` },
    ] },
  ], ACCENT[q.kind]);
}

/** 운영자에게 DM. 앱 진단이 있으면 다음 메시지에 파일로 */
async function deliver(env: Env, id: number): Promise<boolean> {
  const admin = admins(env)[0];
  const got = await load(env, id);
  if (!admin || !got) return false;
  const msg = await sendDM(env, admin, { flags: V2, components: adminCard(env, got.q, got.who), allowed_mentions: { parse: [] } });
  if (!msg) return false;
  await env.DB.prepare('UPDATE inquiries SET admin_dm = ? WHERE id = ?').bind(`${msg.channel}/${msg.id}`, id).run();
  if (got.q.diag) await sendDM(env, admin, { content: `-# 문의 #${id} 앱 진단 (다른 플레이어 이름은 지움)`, allowed_mentions: { parse: [] } }, { name: `prism-inquiry-${id}.json`, data: got.q.diag });
  return true;
}

// ───────── 디스코드 상호작용 ─────────

/** /문의 → 입력 창 */
export function inquiryModal(kind?: string) {
  const k = (KINDS.has(kind ?? '') ? kind : 'etc') as InquiryKind;
  const info = INQUIRY_KINDS.find((x) => x.id === k)!;
  return json({ type: 9, data: {
    custom_id: `inq:new:${k}`, title: `문의하기 · ${info.name}`,
    components: [{ type: 1, components: [{ type: 4, custom_id: 'body', label: '내용', style: 2, min_length: INQUIRY.min, max_length: INQUIRY.max, required: true, placeholder: info.hint.slice(0, 100) }] }],
  } });
}

const fieldOf = (it: Interaction, id: string) => it.data?.components?.flatMap((r) => r.components ?? []).find((c) => c.custom_id === id)?.value ?? '';
const isAdmin = (env: Env, me: Member) => me.tier === 'admin' || admins(env).includes(me.id);
const errText = (e: unknown) => (e instanceof HttpError ? e.message : '잠시 뒤에 다시 해 주세요.');

/** 운영자 DM 의 버튼: 답장하기 → 입력 창, 해결 → 카드 바꾸기 */
export async function onInquiryButton(env: Env, it: Interaction, me: Member): Promise<Response> {
  const [, act, raw] = (it.data?.custom_id ?? '').split(':');
  const id = Number(raw);
  if (!isAdmin(env, me)) return reply({ content: '운영자만 쓸 수 있어요.' });
  const got = id ? await load(env, id) : null;
  if (!got) return reply({ content: '문의를 찾지 못했어요.' });
  if (act === 'reply') {
    return json({ type: 9, data: {
      custom_id: `inq:ans:${id}`, title: `문의 #${id} 답장`,
      components: [{ type: 1, components: [{ type: 4, custom_id: 'reply', label: `${got.who?.nick ?? '회원'}님께 보낼 답장`, style: 2, min_length: 1, max_length: 1500, required: true, value: got.q.reply ?? undefined }] }],
    } });
  }
  if (act === 'done') {
    await env.DB.prepare("UPDATE inquiries SET status = 'done' WHERE id = ?").bind(id).run();
    got.q.status = 'done';
    return json({ type: 7, data: { components: adminCard(env, got.q, got.who) } });
  }
  return reply({ content: '모르는 버튼이에요.' });
}

/** 입력 창 제출: 회원의 새 문의(inq:new) · 운영자의 답장(inq:ans) */
export async function onInquirySubmit(env: Env, it: Interaction, me: Member, ctx?: ExecutionContext): Promise<Response> {
  const [, act, arg] = (it.data?.custom_id ?? '').split(':');
  if (act === 'new') {
    try {
      await create(env, me, arg, fieldOf(it, 'body'), 'discord', {}, null, ctx);
      return reply({ content: '문의를 보냈어요. 답장은 디스코드 DM과 앱 설정 · 웹 아래쪽 \'문의하기\'에서 볼 수 있어요.' });
    } catch (e) {
      return reply({ content: errText(e) });
    }
  }
  if (act === 'ans') {
    if (!isAdmin(env, me)) return reply({ content: '운영자만 쓸 수 있어요.' });
    const id = Number(arg), answer = fieldOf(it, 'reply').trim();
    const got = id ? await load(env, id) : null;
    if (!got || !answer) return reply({ content: '문의를 찾지 못했어요.' });
    const now = Date.now();
    await env.DB.prepare("UPDATE inquiries SET status = 'replied', reply = ?, replied_at = ? WHERE id = ?").bind(answer, now, id).run();
    Object.assign(got.q, { status: 'replied', reply: answer, replied_at: now });
    // 회원에게 DM — 3초 안에 답해야 하므로 응답 뒤에 보낸다. DM을 막아 두었으면 운영자 카드에 그렇게 적는다 (앱·웹 문의 창에는 남는다)
    const q = got.q, who = got.who;
    const job = sendDM(env, q.member_id, { flags: V2, allowed_mentions: { parse: [] }, components: card([
      text(`### Prism 문의 답장\n-# 문의 #${id} · ${INQUIRY_KIND_KO[q.kind]} · ${kst(q.at)}`),
      text(quote(cut(q.body, 300))),
      line(),
      text(answer),
      text('-# 앱 설정 · 웹 아래쪽 \'문의하기\'에서도 다시 볼 수 있어요.'),
    ], ACCENT[q.kind]) }).then(async (sent) => {
      if (!sent && q.admin_dm) await editMessage(env, q.admin_dm, { components: adminCard(env, q, who, '회원이 DM을 막아 두어 앱·웹 문의 창에만 남았어요') });
    }).catch((e) => console.error('문의 답장 DM 실패', e));
    if (ctx) ctx.waitUntil(job); else await job;
    return json({ type: 7, data: { components: adminCard(env, q, who, '회원에게 DM으로 보냈어요 · 앱·웹 문의 창에도 남아요') } });
  }
  return json({ type: 4, data: { flags: EPHEMERAL, content: '모르는 요청이에요.' } });
}
