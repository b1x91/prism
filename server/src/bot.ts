/**
 * 디스코드 봇 (CLAUDE.md v3.53). 늘 켜 둔 프로그램 없이 이 Worker 가 봇 역할까지 한다.
 * - 슬래시 명령: 디스코드가 /discord/interactions 로 보낸다 (Ed25519 서명 확인). 답은 그 사람에게만 보인다.
 * - 매일 밤 공지·첫 기록 축하·멤버 환영 카드: 봇 토큰으로 채널에 글을 올린다.
 * 토큰(DISCORD_BOT_TOKEN)은 서버 비밀값에만. 실패해도 회원 기능은 멈추지 않는다 (조용히 죽지 않게 로그만 남김).
 */
import { CHAMPIONS } from '../../packages/core/src/data.js';
import { stateOf } from './missions.js';
import { assertRanking } from './roles.js';
import { json, type Env, type Member } from './util.js';

const API = 'https://discord.com/api/v10';
const COLOR = 0x7c9cff;
const KST = 9 * 3600_000;

export const botReady = (env: Env) => Boolean(env.DISCORD_BOT_TOKEN && env.BOT_CHANNEL_ID);
const webUrl = (env: Env) => (env.WEB_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)[0] ?? 'https://przm.web.app';

/** 디스코드 API 호출: 429 면 알려 준 만큼 기다렸다 다시 (최대 3번), 8초 넘으면 끊는다 */
async function discord(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  for (let i = 0; ; i++) {
    const r = await fetch(API + path, {
      ...init,
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(8000),
    });
    if (r.status !== 429 || i >= 2) return r;
    const wait = Number((await r.json().catch(() => ({})) as { retry_after?: number }).retry_after ?? 1);
    await new Promise((x) => setTimeout(x, Math.min(5000, wait * 1000 + 100)));
  }
}

/** 채널에 글 올리기. 성공하면 true */
export async function sendToChannel(env: Env, channelId: string, payload: unknown): Promise<boolean> {
  if (!env.DISCORD_BOT_TOKEN) return false;
  try {
    const r = await discord(env, `/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify(payload) });
    if (!r.ok) console.error('디스코드 글 올리기 실패', r.status, await r.text().catch(() => ''));
    return r.ok;
  } catch (e) {
    console.error('디스코드 글 올리기 실패', e);
    return false;
  }
}

/** 같은 일을 두 번 하지 않게 표시 (ext_cache). 처음이면 true */
async function once(env: Env, key: string): Promise<boolean> {
  const r = await env.DB.prepare('INSERT OR IGNORE INTO ext_cache (k, v, at) VALUES (?, ?, ?)').bind(key, '1', Date.now()).run();
  return (r.meta.changes ?? 0) > 0;
}

// ───────── 슬래시 명령 ─────────

const hex = (s: string) => new Uint8Array((s.match(/../g) ?? []).map((b) => parseInt(b, 16)));

/** 디스코드가 보낸 요청인지 서명으로 확인 */
async function verified(env: Env, req: Request, body: string): Promise<boolean> {
  const sig = req.headers.get('X-Signature-Ed25519'), ts = req.headers.get('X-Signature-Timestamp');
  if (!sig || !ts || !env.DISCORD_PUBLIC_KEY) return false;
  try {
    const key = await crypto.subtle.importKey('raw', hex(env.DISCORD_PUBLIC_KEY), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, hex(sig), new TextEncoder().encode(ts + body));
  } catch {
    return false;
  }
}

type Interaction = { type: number; data?: { name?: string }; member?: { user?: { id: string } }; user?: { id: string } };
const EPHEMERAL = 64;
const reply = (data: Record<string, unknown>) => json({ type: 4, data: { flags: EPHEMERAL, allowed_mentions: { parse: [] }, ...data } });

export async function interactions(req: Request, env: Env): Promise<Response> {
  const body = await req.text();
  if (!(await verified(env, req, body))) return new Response('서명이 맞지 않습니다.', { status: 401 });
  const it = JSON.parse(body) as Interaction;
  if (it.type === 1) return json({ type: 1 }); // PING
  if (it.type !== 2) return reply({ content: '지원하지 않는 요청이에요.' });
  const uid = it.member?.user?.id ?? it.user?.id;
  const me = uid ? await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(uid).first<Member>() : null;
  if (!me) return reply({ content: `아직 Prism 에 로그인한 적이 없어요. ${webUrl(env)} 에서 디스코드로 로그인해 주세요.` });
  try {
    switch (it.data?.name) {
      case '내기록': return reply(await myRecord(env, me));
      case '랭킹': return reply(await rankTop(env, me));
      case '미션': return reply(await myMissions(env, me));
    }
  } catch (e) {
    return reply({ content: e instanceof Error ? e.message : '잠시 뒤에 다시 해 주세요.' });
  }
  return reply({ content: '모르는 명령이에요.' });
}

const pct = (w: number, n: number) => (n ? `${Math.round((w / n) * 100)}%` : '–');

async function myRecord(env: Env, me: Member) {
  const all = await env.DB.prepare('SELECT champion_id AS c, win AS w, kills AS k, deaths AS d, assists AS a, played_at AS t FROM participants WHERE member_id = ? ORDER BY played_at DESC')
    .bind(me.id).all<{ c: number; w: number; k: number; d: number; a: number; t: number }>();
  const g = all.results;
  if (!g.length) return { content: '아직 기록된 판이 없어요. 앱을 켜 두고 한 판 하면 여기에 쌓여요.' };
  const w = g.filter((x) => x.w).length;
  const k = g.reduce((s, x) => s + x.k, 0), d = g.reduce((s, x) => s + x.d, 0), a = g.reduce((s, x) => s + x.a, 0);
  let streak = 0; for (const x of g) { if (Boolean(x.w) === Boolean(g[0].w)) streak++; else break; }
  const byC = new Map<number, { n: number; w: number }>();
  for (const x of g) { const e = byC.get(x.c) ?? { n: 0, w: 0 }; e.n++; e.w += x.w; byC.set(x.c, e); }
  const top = [...byC].sort((p, q) => q[1].n - p[1].n).slice(0, 3).map(([c, e]) => `${CHAMPIONS[c]?.name ?? c} ${e.n}판 ${pct(e.w, e.n)}`);
  return {
    embeds: [{
      color: COLOR, title: `${me.nick.split('#')[0]} 님의 기록`, url: `${webUrl(env)}/me`,
      fields: [
        { name: '기록된 판', value: `${g.length}판`, inline: true },
        { name: '승률', value: pct(w, g.length), inline: true },
        { name: 'KDA', value: ((k + a) / Math.max(1, d)).toFixed(2), inline: true },
        { name: '지금', value: `${streak}${g[0].w ? '연승' : '연패'}`, inline: true },
        { name: '최근 10판', value: g.slice(0, 10).map((x) => (x.w ? '🟦' : '🟥')).join(''), inline: true },
        { name: '많이 한 챔프', value: top.join('\n') || '–', inline: false },
      ],
    }],
  };
}

async function rankTop(env: Env, me: Member) {
  await assertRanking(env, me); // 랭킹이 아직 열리지 않았으면 그 안내가 그대로 답이 된다
  const r = await env.DB.prepare(`SELECT m.nick AS nick, COUNT(*) AS n, SUM(p.win) AS w FROM participants p JOIN members m ON m.id = p.member_id
    GROUP BY p.member_id ORDER BY n DESC, w DESC LIMIT 5`).all<{ nick: string; n: number; w: number }>();
  const medal = ['🥇', '🥈', '🥉', '4.', '5.'];
  return {
    embeds: [{
      color: COLOR, title: 'Prism 랭킹 · 판수', url: `${webUrl(env)}/ranking`,
      description: r.results.map((x, i) => `${medal[i]} **${x.nick.split('#')[0]}** ${x.n}판 · ${pct(x.w, x.n)}`).join('\n') || '아직 기록된 판이 없어요.',
    }],
  };
}

async function myMissions(env: Env, me: Member) {
  const s = await stateOf(env, me);
  const lines = s.week.missions.map((m) => `${m.done ? '✅' : '▫️'} ${m.title} · ${m.progress}/${m.target} · ${m.reward} 피스`);
  return { embeds: [{ color: COLOR, title: '이번 주 미션', url: `${webUrl(env)}/missions`, description: lines.join('\n') }] };
}

// ───────── 채널에 올리는 글 ─────────

/** 매일 밤 공지 (크론). 하루 한 번만 */
export async function dailyPost(env: Env, now = Date.now()) {
  if (!botReady(env)) return;
  const day = new Date(now + KST).toISOString().slice(0, 10);
  // 올리는 데 성공했을 때만 '오늘 올림'으로 표시한다 (실패하면 다음 크론이 아니라도 수동 재시도 가능)
  if (await env.DB.prepare('SELECT 1 FROM ext_cache WHERE k = ?').bind(`bot-daily-${day}`).first()) return;
  const since = now - 24 * 3600_000;
  const t = await env.DB.prepare(`SELECT COUNT(*) AS games, SUM(CASE WHEN crew_count >= 2 THEN 1 ELSE 0 END) AS crew FROM matches WHERE played_at >= ?`).bind(since).first<{ games: number; crew: number | null }>();
  const who = await env.DB.prepare('SELECT COUNT(DISTINCT member_id) AS n FROM participants WHERE played_at >= ?').bind(since).first<{ n: number }>();
  // 이번 주(월요일 0시 KST부터) 가장 많이 한 세 사람
  const d = new Date(now + KST); const ws = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)) - KST;
  const top = await env.DB.prepare(`SELECT m.nick AS nick, COUNT(*) AS n FROM participants p JOIN members m ON m.id = p.member_id WHERE p.played_at >= ?
    GROUP BY p.member_id ORDER BY n DESC LIMIT 3`).bind(ws).all<{ nick: string; n: number }>();
  const games = t?.games ?? 0;
  const fields = [
    { name: '지난 24시간', value: games ? `${games}판 · 모임 판 ${t?.crew ?? 0} · ${who?.n ?? 0}명` : '조용했어요', inline: false },
    ...(top.results.length ? [{ name: '이번 주 가장 많이 함께한', value: top.results.map((x, i) => `${['🥇', '🥈', '🥉'][i]} ${x.nick.split('#')[0]} ${x.n}판`).join('  '), inline: false }] : []),
  ];
  const ok = await sendToChannel(env, env.BOT_CHANNEL_ID!, {
    embeds: [{ color: COLOR, title: '오늘 밤 증바람? 💎', description: '음성 채널에서 만나요. 이번 주 미션도 잊지 마세요.', fields }],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: '이번 주 미션', url: `${webUrl(env)}/missions` }, { type: 2, style: 5, label: '모임 기록', url: `${webUrl(env)}/crew` }] }],
  });
  if (ok) await once(env, `bot-daily-${day}`);
}

/** 첫 판이 기록된 회원 축하 (회원마다 한 번) */
export async function firstRecord(env: Env, memberId: string, championId: number, win: boolean) {
  if (!botReady(env)) return;
  if (!(await once(env, `bot-first-${memberId}`))) return;
  const c = CHAMPIONS[championId]?.name;
  await sendToChannel(env, env.BOT_CHANNEL_ID!, {
    content: `<@${memberId}> 님의 첫 판이 Prism 에 기록됐어요! 🎉${c ? ` (${c}${win ? ' · 승리' : ''})` : ''}`,
    allowed_mentions: { users: [memberId] },
  });
}
