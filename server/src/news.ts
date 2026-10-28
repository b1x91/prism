/**
 * 소식 피드 (CLAUDE.md v3.111) — 운영진 공지·이벤트와 저절로 생기는 소식을 날짜순으로 한 줄에.
 *  - 자동 소식 (`ensureAuto`): 앱 새 버전(CI 가 ext_cache 'release-tag'·'release-notes' 에 적는다) · 증강 패치(게임 데이터의 새 증강) · 새 시즌(분기)
 *    auto_key 로 한 번만 넣고, 넣은 뒤에는 운영진이 고칠 수 있다.
 *  - 운영진(운영 권한)만 쓰고·고치고·고정하고·지운다. 올리면 봇이 디스코드 일반 채팅방에도 올린다(끌 수 있음).
 *  - 회원 모두 읽고 하트를 누른다. 어디까지 읽었는지(members.news_read_at)로 메뉴에 빨간 점.
 */
import { sendToChannel, webUrl } from './bot.js';
import { can } from './roles.js';
import { HttpError, json, type Env, type Member } from './util.js';
import { AUGMENTS, DATA_GENERATED_AT, NEWEST_PATCH, NEXT_PATCH } from '../../packages/core/src/data.js';
import { seasonOf } from '../../packages/core/src/ranking.js';
import { NEWS_LIMIT, NEWS_MAX, type NewsItem, type NewsKind } from '../../packages/core/src/news.js';

const WRITE_KINDS: NewsKind[] = ['notice', 'event'];
const RANK = { prismatic: 0, gold: 1, silver: 2 } as const;

/** 앱 업데이트 카드에 넣지 않는 개발용 커밋 제목 (운영진이 나중에 고칠 수 있다) */
const DEV_NOTE = /^앱 \d|CLAUDE\.md|마이그레이션|Secrets|msstore|스토어 제출|스토어 스크린샷|QA|CI |워크플로/;

async function cacheGet(env: Env, k: string) {
  return (await env.DB.prepare('SELECT v, at FROM ext_cache WHERE k = ?').bind(k).first<{ v: string; at: number }>().catch(() => null)) ?? null;
}

async function insertAuto(env: Env, key: string, row: { kind: NewsKind; title: string; body: string; data?: unknown; at: number }) {
  await env.DB.prepare('INSERT OR IGNORE INTO news (kind, title, body, data, auto_key, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(row.kind, row.title, row.body, row.data == null ? null : JSON.stringify(row.data), key, row.at).run();
}

/** 저절로 생기는 소식을 채운다 (소식을 열 때·매일 밤 공지 때). 이미 있으면 아무것도 하지 않는다 */
export async function ensureAuto(env: Env, now = Date.now()) {
  // 앱 새 버전
  const tag = await cacheGet(env, 'release-tag');
  if (tag?.v && /^app-v\d+\.\d+\.\d+$/.test(tag.v)) {
    const notesRow = await cacheGet(env, 'release-notes');
    let notes: string[] = [];
    try { const n = notesRow ? JSON.parse(notesRow.v) as { tag?: string; notes?: string[] } : null; if (n?.tag === tag.v) notes = (n.notes ?? []).filter((s) => !DEV_NOTE.test(s)).slice(0, 8); } catch { /* 없음 */ }
    const ver = tag.v.replace(/^app-v/, '');
    await insertAuto(env, `app:${tag.v}`, { kind: 'update', title: `앱 ${ver}`, body: notes.map((s) => `• ${s}`).join('\n'), data: { version: ver }, at: tag.at || now });
  }
  // 증강 패치: 가장 최근 패치에 새로 나온 증강 (패치가 실제로 열린 뒤에만)
  if (NEWEST_PATCH) {
    const at = NEXT_PATCH?.version === NEWEST_PATCH ? NEXT_PATCH.at : null;
    if (!at || now >= at) {
      const added = AUGMENTS.filter((a) => a.added === NEWEST_PATCH && !a.disabled && a.name).sort((a, b) => RANK[a.rarity] - RANK[b.rarity]);
      const removed = AUGMENTS.filter((a) => a.removed === NEWEST_PATCH).length;
      if (added.length) await insertAuto(env, `patch:${NEWEST_PATCH}`, {
        kind: 'patch', title: `${NEWEST_PATCH} 아수라장 · 새 증강 ${added.length}개`,
        body: removed ? `증강 ${removed}개가 빠지고 ${added.length}개가 새로 들어왔어요. 증강 탭 '새로운 증강'에서 어울리는 챔프를 볼 수 있어요.` : `새 증강 ${added.length}개가 들어왔어요. 증강 탭 '새로운 증강'에서 어울리는 챔프를 볼 수 있어요.`,
        data: { patch: NEWEST_PATCH, augments: added.map((a) => a.id) }, at: at ?? Math.min(now, DATA_GENERATED_AT ?? now),
      });
    }
  }
  // 새 시즌
  const s = seasonOf(now);
  await insertAuto(env, `season:${s.key}`, { kind: 'season', title: `${s.label} 시작`, body: '랭킹 점수가 처음부터 다시 쌓여요. 이번 시즌 1위는 누가 될까요?', data: { season: s.key }, at: s.start });
}

/** GET /api/news — 고정 소식 먼저, 그다음 최근순 */
export async function listNews(env: Env, me: Member) {
  await ensureAuto(env).catch((e) => console.error('자동 소식 실패', e));
  const { results } = await env.DB.prepare(
    `SELECT n.id, n.kind, n.title, n.body, n.data, n.pinned, n.created_at AS at, n.edited_at AS edited, n.auto_key AS autoKey,
       a.nick AS authorNick,
       (SELECT COUNT(*) FROM news_hearts h WHERE h.news_id = n.id) AS hearts,
       EXISTS (SELECT 1 FROM news_hearts h WHERE h.news_id = n.id AND h.member_id = ?1) AS mine
     FROM news n LEFT JOIN members a ON a.id = n.author WHERE n.kind != 'hidden'
     ORDER BY (n.auto_key LIKE 'fixed:%') DESC, n.pinned DESC, n.created_at DESC LIMIT ?2`,
  ).bind(me.id, NEWS_LIMIT).all<Record<string, any>>();
  const items: NewsItem[] = results.map((r) => {
    const fixed = typeof r.autoKey === 'string' && r.autoKey.startsWith('fixed:');
    let data: Record<string, unknown> | null = null;
    try { data = r.data ? JSON.parse(r.data) : null; } catch { /* 없음 */ }
    return { id: r.id, kind: r.kind, title: r.title, body: r.body, data, pinned: fixed || Boolean(r.pinned), fixed, at: r.at, edited: r.edited ?? null, auto: Boolean(r.autoKey) && !fixed, author: r.authorNick ?? null, hearts: r.hearts, mine: Boolean(r.mine) };
  });
  return json({ items, readAt: me.news_read_at ?? 0, canWrite: can(me, 'manage') });
}

/** 안 읽은 소식 수 (/api/me 에 함께) */
export async function unreadNews(env: Env, me: Member): Promise<number> {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM news WHERE created_at > ? AND kind != 'hidden'").bind(me.news_read_at ?? 0).first<{ n: number }>().catch(() => null);
  return r?.n ?? 0;
}

/** POST /api/news/read — 여기까지 읽었다 */
export async function readNews(env: Env, me: Member) {
  const now = Date.now();
  await env.DB.prepare('UPDATE members SET news_read_at = ? WHERE id = ?').bind(now, me.id).run();
  return json({ ok: true, readAt: now });
}

/** POST /api/news/:id/heart — 하트 켜고 끄기 */
export async function heartNews(env: Env, me: Member, id: number) {
  const has = await env.DB.prepare('SELECT 1 AS x FROM news_hearts WHERE news_id = ? AND member_id = ?').bind(id, me.id).first();
  if (has) await env.DB.prepare('DELETE FROM news_hearts WHERE news_id = ? AND member_id = ?').bind(id, me.id).run();
  else {
    const ok = await env.DB.prepare('SELECT 1 AS x FROM news WHERE id = ?').bind(id).first();
    if (!ok) throw new HttpError(404, '없는 소식이에요.');
    await env.DB.prepare('INSERT OR IGNORE INTO news_hearts (news_id, member_id, at) VALUES (?, ?, ?)').bind(id, me.id, Date.now()).run();
  }
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM news_hearts WHERE news_id = ?').bind(id).first<{ n: number }>();
  return json({ hearts: n?.n ?? 0, mine: !has });
}

function assertWriter(me: Member) {
  if (!can(me, 'manage')) throw new HttpError(403, '운영진만 소식을 쓸 수 있어요.');
}
function clean(body: { kind?: unknown; title?: unknown; body?: unknown }, partial = false) {
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, NEWS_MAX.title) : '';
  const text = typeof body.body === 'string' ? body.body.trim().slice(0, NEWS_MAX.body) : '';
  if (!partial && title.length < 2) throw new HttpError(400, '제목을 두 글자 이상 적어 주세요.');
  return { title, text };
}

/** POST /api/news — 운영진이 공지·이벤트를 올린다. discord: true 면 봇이 일반 채팅방에도 */
export async function createNews(req: Request, env: Env, me: Member) {
  assertWriter(me);
  const b = (await req.json().catch(() => ({}))) as { kind?: unknown; title?: unknown; body?: unknown; pinned?: unknown; discord?: unknown };
  const kind = WRITE_KINDS.includes(b.kind as NewsKind) ? (b.kind as NewsKind) : 'notice';
  const { title, text } = clean(b);
  const now = Date.now();
  const r = await env.DB.prepare('INSERT INTO news (kind, title, body, pinned, author, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(kind, title, text, b.pinned ? 1 : 0, me.id, now).first<{ id: number }>();
  // 쓴 사람은 읽은 것으로
  await env.DB.prepare('UPDATE members SET news_read_at = ? WHERE id = ?').bind(now, me.id).run();
  let posted = false;
  if (b.discord !== false && env.BOT_CHANNEL_ID) {
    const label = kind === 'event' ? '이벤트' : '공지';
    const plain = text.replace(/^\[(.+?)\]\?\s*$/gm, '[$1]');
    const short = plain.length > 600 ? `${plain.slice(0, 600)}…` : plain;
    posted = await sendToChannel(env, env.BOT_CHANNEL_ID, {
      content: `📢 **[${label}] ${title}**${short ? `\n${short}` : ''}\n${webUrl(env)}/news`,
      allowed_mentions: { parse: [] },
    });
  }
  return json({ ok: true, id: r?.id, posted });
}

/** POST /api/news/:id — 고치기·고정 (자동 소식도 고칠 수 있다) */
export async function editNews(req: Request, env: Env, me: Member, id: number) {
  assertWriter(me);
  const b = (await req.json().catch(() => ({}))) as { title?: unknown; body?: unknown; pinned?: unknown };
  const row = await env.DB.prepare('SELECT id, auto_key FROM news WHERE id = ?').bind(id).first<{ id: number; auto_key: string | null }>();
  if (!row) throw new HttpError(404, '없는 소식이에요.');
  const fixed = Boolean(row.auto_key?.startsWith('fixed:'));
  if (typeof b.pinned === 'boolean' && !fixed) await env.DB.prepare('UPDATE news SET pinned = ? WHERE id = ?').bind(b.pinned ? 1 : 0, id).run();
  if (typeof b.title === 'string' || typeof b.body === 'string') {
    const { title, text } = clean(b);
    await env.DB.prepare('UPDATE news SET title = ?, body = ?, edited_at = ? WHERE id = ?').bind(title, text, Date.now(), id).run();
  }
  return json({ ok: true });
}

/** DELETE /api/news/:id — 지우기 (자동 소식은 지워도 다시 생기지 않는다: auto_key 를 남긴 빈 줄로 숨김) */
export async function deleteNews(env: Env, me: Member, id: number) {
  assertWriter(me);
  const row = await env.DB.prepare('SELECT auto_key FROM news WHERE id = ?').bind(id).first<{ auto_key: string | null }>();
  if (!row) throw new HttpError(404, '없는 소식이에요.');
  if (row.auto_key?.startsWith('fixed:')) throw new HttpError(400, '늘 고정되는 공지는 지울 수 없어요. 내용은 고칠 수 있어요.');
  await env.DB.prepare('DELETE FROM news_hearts WHERE news_id = ?').bind(id).run();
  if (row.auto_key) await env.DB.prepare("UPDATE news SET kind = 'hidden', pinned = 0 WHERE id = ?").bind(id).run();
  else await env.DB.prepare('DELETE FROM news WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
