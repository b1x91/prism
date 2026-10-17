/**
 * 디스코드 봇 (CLAUDE.md v3.53). 늘 켜 둔 프로그램 없이 이 Worker 가 봇 역할까지 한다.
 * - 슬래시 명령: 디스코드가 /discord/interactions 로 보낸다 (Ed25519 서명 확인). 답은 그 사람에게만 보인다.
 * - 매일 밤 공지·첫 기록 축하·멤버 환영 카드: 봇 토큰으로 채널에 글을 올린다.
 * 토큰(DISCORD_BOT_TOKEN)은 서버 비밀값에만. 실패해도 회원 기능은 멈추지 않는다 (조용히 죽지 않게 로그만 남김).
 */
import { AUGMENT, CHAMPIONS } from '../../packages/core/src/data.js';
import { cdragon } from '../../packages/core/src/assets.js';
import skinData from '../../packages/core/data/skins.json';
import { stateOf } from './missions.js';
import { byScore, rankScore, seasonOf } from '../../packages/core/src/ranking.js';
import { assertRanking } from './roles.js';
import { RARITY_KO, tonightOf, type AugStat } from '../../packages/core/src/tonight.js';
import { challengeRole, parseFeat, type ChallengeRole } from '../../packages/core/src/challenges.js';
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
const V2 = 1 << 15; // 디스코드 새 메시지 구성 (컨테이너·섹션·썸네일·구분선)
const reply = (data: Record<string, unknown>) =>
  json({ type: 4, data: { flags: EPHEMERAL | (data.components ? V2 : 0), allowed_mentions: { parse: [] }, ...data } });

// ───────── 새 메시지 구성 조각 (Components V2) ─────────
const text = (content: string) => ({ type: 10, content });
const line = (big = false) => ({ type: 14, divider: true, spacing: big ? 2 : 1 });
const thumb = (url: string) => ({ type: 11, media: { url } });
const section = (texts: string[], accessory: unknown) => ({ type: 9, components: texts.map(text), accessory });
const gallery = (url: string) => ({ type: 12, items: [{ media: { url } }] });
const linkButtons = (btns: [string, string][]) => ({ type: 1, components: btns.map(([label, url]) => ({ type: 2, style: 5, label, url })) });
const card = (children: unknown[], accent = COLOR) => [{ type: 17, accent_color: accent, components: children }];
const SKINS = skinData.skins as unknown as Record<string, [string, number, string, string]>;
/** 회원 얼굴: 대표 스킨 → 주 챔프 */
const faceUrl = (skin: number | null, champ: number | null) => {
  const s = skin ? SKINS[String(skin)] : undefined;
  return s?.[2] ? cdragon(s[2]) : champ ? cdragon(CHAMPIONS[champ]?.tile) : '';
};

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
  const champs = [...byC].sort((p, q) => q[1].n - p[1].n || q[1].w - p[1].w).slice(0, 3);
  const main = champs[0]?.[0] ?? null;
  // 증강: 내가 가장 많이 고른 셋 + 하트를 누른 '내 증강'
  const picked = await env.DB.prepare('SELECT augment_id AS id, COUNT(*) AS n, SUM(win) AS w FROM participant_augments WHERE member_id = ? GROUP BY augment_id ORDER BY n DESC, w DESC LIMIT 1')
    .bind(me.id).all<{ id: number; n: number; w: number }>();
  const favs = await env.DB.prepare("SELECT item_id AS id FROM favorites WHERE member_id = ? AND kind = 'aug' ORDER BY at LIMIT 5").bind(me.id).all<{ id: number }>();
  const name = me.nick.split('#')[0];
  const face = faceUrl(me.profile_skin, main);
  const splash = main ? cdragon((me.profile_skin && SKINS[String(me.profile_skin)]?.[3]) || CHAMPIONS[main]?.splash) : '';
  const champLines = champs.map(([c, e]) => `**${CHAMPIONS[c]?.name ?? c}**  ${e.n}판 · 승률 ${pct(e.w, e.n)}`).join('\n');
  // 최애 증강: 가장 많이 고른 하나 (글자로만, 아이콘 없이)
  const best = picked.results[0];
  const ba = best ? AUGMENT[best.id] : undefined;
  const RARITY_NAME: Record<string, string> = { silver: '실버', gold: '골드', prismatic: '프리즘' };
  const bestAug = best ? text(`**최애 증강**\n**${ba?.name ?? best.id}**  ${[RARITY_NAME[ba?.rarity ?? ''], `${best.n}번 고름`, `승률 ${pct(best.w, best.n)}`].filter(Boolean).join(' · ')}`) : null;
  const recent = g.slice(0, 10), rw = recent.filter((x) => x.w).length;
  const favLine = favs.results.map((x) => AUGMENT[x.id]?.name).filter(Boolean).join(' · ');
  return {
    components: card([
      ...(splash ? [gallery(splash)] : []),
      // 큰 그림이 있으면 얼굴 썸네일은 겹치므로 빼고, 그림이 없을 때만 얼굴을 곁들인다
      splash || !face ? text(`## ${name} 님의 기록\n-# Prism · 아수라장 · ${g[0].w ? `🔥 ${streak}연승 중` : `${streak}연패 중`}`)
        : section([`## ${name} 님의 기록`, `-# Prism · 아수라장 · ${g[0].w ? `🔥 ${streak}연승 중` : `${streak}연패 중`}`], thumb(face)),
      line(),
      text(`### ${g.length}판   ·   승률 ${pct(w, g.length)}   ·   KDA ${((k + a) / Math.max(1, d)).toFixed(2)}`),
      // 최근 판은 동그라미 사이를 띄워 촘촘하지 않게 (파랑 승 · 빨강 패)
      text(`**최근 ${recent.length}판**  ${rw}승 ${recent.length - rw}패\n${recent.map((x) => (x.w ? '🔵' : '🔴')).join('  ')}`),
      line(),
      text(`**많이 한 챔프**\n${champLines || '–'}`),
      ...(bestAug ? [bestAug] : []),
      ...(favLine ? [text(`**내 증강**\n${favLine}`)] : []),
      line(true),
      linkButtons([['내 페이지', `${webUrl(env)}/me`], ['도감', `${webUrl(env)}/dex`]]),
    ]),
  };
}

async function rankTop(env: Env, me: Member) {
  await assertRanking(env, me); // 랭킹이 아직 열리지 않았으면 그 안내가 그대로 답이 된다
  // 이번 시즌 점수 순 (승률을 판수만큼 믿은 값, 화면 랭킹과 같은 규칙)
  const season = seasonOf();
  const r = await env.DB.prepare(`SELECT m.nick AS nick, m.profile_skin AS skin, COUNT(*) AS n, SUM(p.win) AS w,
      (SELECT champion_id FROM participants q WHERE q.member_id = p.member_id GROUP BY champion_id ORDER BY COUNT(*) DESC LIMIT 1) AS main
    FROM participants p JOIN members m ON m.id = p.member_id WHERE p.played_at >= ? GROUP BY p.member_id`)
    .bind(season.start).all<{ nick: string; skin: number | null; n: number; w: number; main: number | null }>();
  const rows = r.results.sort(byScore).slice(0, 5);
  if (!rows.length) return { content: `${season.label}에 기록된 판이 아직 없어요.` };
  const top = rows[0];
  const medal = ['🥇', '🥈', '🥉', '`4`', '`5`'];
  const face = faceUrl(top.skin, top.main);
  const head = ['## 🏆 Prism 랭킹', `-# ${season.label} · 점수 기준 · 1위 **${top.nick.split('#')[0]}** ${rankScore(top.w, top.n)}점`];
  return {
    components: card([
      face ? section(head, thumb(face)) : text(head.join('\n')),
      line(),
      text(rows.map((x, i) => `${medal[i]}  **${x.nick.split('#')[0]}**  ·  **${rankScore(x.w, x.n)}점**  ·  ${x.n}판 ${pct(x.w, x.n)}`).join('\n')),
      text('-# 점수 = 승률을 판수만큼 믿은 값 (판이 적으면 500점 쪽으로)'),
      line(true),
      linkButtons([['전체 랭킹', `${webUrl(env)}/ranking`]]),
    ], 0xf2b233),
  };
}

async function myMissions(env: Env, me: Member) {
  const st = await stateOf(env, me);
  const ms = st.week.missions;
  const done = ms.filter((m) => m.done).length;
  return {
    components: card([
      text(`## 🎯 이번 주 미션  ${done}/${ms.length}`),
      text(`-# 월요일 0시에 새로 정해져요${st.ready ? ` · 받을 보상 **${st.ready} 피스**` : ''}`),
      line(),
      ...ms.map((m) => text(`${m.done ? '✅' : '▫️'} **${m.title}**\n-# ${m.progress} / ${m.target}  ·  ${m.reward} 피스`)),
      line(true),
      linkButtons([['미션 보기', `${webUrl(env)}/missions`]]),
    ], 0x3ddc97),
  };
}

// ───────── 채널에 올리는 글 ─────────

/** 매일 밤 공지 (크론, 21:00 KST). 하루 한 번만 (v3.69)
 *  A·B 늘: 오늘의 테마(날마다 무작위) + 증강 3개와 잘 맞는 챔프 (core/tonight.ts)
 *  C 기록이 있을 때만: 어제의 명장면 · 어제 고른 오늘의 증강 결과 · 지난 24시간 · 이번 주 가장 많이 함께한 */
export async function dailyPost(env: Env, now = Date.now()) {
  if (!botReady(env)) return;
  const day = new Date(now + KST).toISOString().slice(0, 10);
  // 올리는 데 성공했을 때만 '오늘 올림'으로 표시한다 (실패하면 다음 크론이 아니라도 수동 재시도 가능)
  if (await env.DB.prepare('SELECT 1 FROM ext_cache WHERE k = ?').bind(`bot-daily-${day}`).first()) return;
  const payload = await dailyPayload(env, now);
  const ok = await sendToChannel(env, env.BOT_CHANNEL_ID!, payload.message);
  if (!ok) return;
  await once(env, `bot-daily-${day}`);
  const hist = [{ day, theme: payload.tonight.theme, augs: payload.tonight.picks.map((p) => p.aug) }, ...payload.hist.filter((h) => h.day !== day)].slice(0, 14);
  await env.DB.prepare('INSERT OR REPLACE INTO ext_cache (k, v, at) VALUES (?, ?, ?)').bind('bot-daily-hist', JSON.stringify(hist), now).run();
}

type DailyHist = { day: string; theme: string; augs: number[] };

/** 공지 내용 만들기 (올리지 않는다 — 미리 보기에도 쓴다) */
export async function dailyPayload(env: Env, now = Date.now()) {
  const day = new Date(now + KST).toISOString().slice(0, 10);
  const since = now - 24 * 3600_000;
  const d = new Date(now + KST); const ws = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)) - KST;
  const histRow = await env.DB.prepare("SELECT v FROM ext_cache WHERE k = 'bot-daily-hist'").first<{ v: string }>();
  let hist: DailyHist[] = [];
  try { hist = histRow ? (JSON.parse(histRow.v) as DailyHist[]).filter((h) => h.day < day) : []; } catch { hist = []; }
  const [statR, weekR, roleR, t, who, top, feats, yPicks] = await env.DB.batch([
    env.DB.prepare('SELECT augment_id AS id, COUNT(*) AS n, SUM(win) AS w FROM participant_augments GROUP BY augment_id'),
    env.DB.prepare(`SELECT a.augment_id AS id, COUNT(*) AS n, SUM(a.win) AS w FROM participant_augments a
      JOIN participants p ON p.game_id = a.game_id AND p.member_id = a.member_id WHERE p.played_at >= ? GROUP BY a.augment_id`).bind(ws),
    env.DB.prepare('SELECT champion_id AS c, COUNT(*) AS n FROM participants WHERE played_at >= ? GROUP BY champion_id').bind(now - 28 * 86400_000),
    env.DB.prepare('SELECT COUNT(*) AS games, SUM(CASE WHEN crew_count >= 2 THEN 1 ELSE 0 END) AS crew FROM matches WHERE played_at >= ?').bind(since),
    env.DB.prepare('SELECT COUNT(DISTINCT member_id) AS n FROM participants WHERE played_at >= ?').bind(since),
    // 이번 주(월요일 0시 KST부터) 모임 판(회원 2명 이상)을 가장 많이 한 세 사람
    env.DB.prepare(`SELECT m.nick AS nick, COUNT(*) AS n FROM participants p JOIN members m ON m.id = p.member_id JOIN matches g ON g.game_id = p.game_id
      WHERE p.played_at >= ? AND g.crew_count >= 2 GROUP BY p.member_id ORDER BY n DESC LIMIT 3`).bind(ws),
    env.DB.prepare(`SELECT m.nick AS nick, p.champion_id AS c, p.kills AS k, p.feats AS f FROM participants p JOIN members m ON m.id = p.member_id
      WHERE p.played_at >= ? AND p.feats IS NOT NULL`).bind(since),
    env.DB.prepare(`SELECT a.augment_id AS id, a.win AS w FROM participant_augments a JOIN participants p ON p.game_id = a.game_id AND p.member_id = a.member_id
      WHERE p.played_at >= ?`).bind(since),
  ]);
  const rows = <T,>(r: D1Result) => r.results as T[];
  const stats: Record<number, AugStat> = Object.fromEntries(rows<{ id: number; n: number; w: number }>(statR).map((x) => [x.id, { n: x.n, w: x.w }]));
  const week: Record<number, AugStat> = Object.fromEntries(rows<{ id: number; n: number; w: number }>(weekR).map((x) => [x.id, { n: x.n, w: x.w }]));
  const roleGames: Partial<Record<ChallengeRole, number>> = {};
  for (const x of rows<{ c: number; n: number }>(roleR)) { const r = challengeRole(x.c); if (r) roleGames[r] = (roleGames[r] ?? 0) + x.n; }
  const tonight = tonightOf({ day, stats, week, roleGames, recentThemes: hist.map((h) => h.theme), recentAugs: hist.flatMap((h) => h.augs) });

  const web = webUrl(env);
  const champName = (c: number) => CHAMPIONS[c]?.name ?? '';
  const parts: unknown[] = [
    text('## 💎 오늘 밤 증바람?'),
    text(`### ${tonight.name}\n-# ${tonight.sub}`),
    line(),
  ];
  for (const p of tonight.picks) {
    const a = AUGMENT[p.aug];
    const lines = [
      `**${a.name}**  ·  ${RARITY_KO[a.rarity]}\n${a.note}`,
      `-# 잘 맞는 챔프 (${p.tier}티어)  ${p.champs.map(champName).join(' · ')}${p.stat ? `\n-# 모임에서 ${p.stat.n}번 골라 ${p.stat.w}승` : ''}`,
    ];
    const face = p.champs[0] ? cdragon(CHAMPIONS[p.champs[0]]?.tile) : '';
    parts.push(face ? section(lines, thumb(face)) : text(lines.join('\n')));
  }
  if (tonight.together?.length) parts.push(text(`-# 셋 다 잘 맞는 챔프  ${tonight.together.map(champName).join(' · ')}`));
  parts.push(text('-# 🎯 오늘의 도전 — 위 증강을 그 챔프로 골라 보세요. 증강 도감의 목표가 하나 채워져요'));

  // C: 기록이 있을 때만
  const extra: string[] = [];
  const best = rows<{ nick: string; c: number; k: number; f: string }>(feats)
    .map((x) => ({ ...x, multi: parseFeat(x.f)?.multi ?? 0 }))
    .filter((x) => x.multi >= 4).sort((a, b) => b.multi - a.multi || b.k - a.k).slice(0, 3);
  if (best.length) extra.push(`**어제의 명장면**\n${best.map((x) => `${x.nick.split('#')[0]} · ${champName(x.c)} ${x.multi >= 5 ? '펜타킬' : '쿼드라킬'}`).join('\n')}`);
  const yday = hist[0];
  if (yday) {
    const ys = new Set(yday.augs);
    const got = rows<{ id: number; w: number }>(yPicks).filter((x) => ys.has(x.id));
    if (got.length) {
      const by = new Map<number, { n: number; w: number }>();
      for (const x of got) { const e = by.get(x.id) ?? { n: 0, w: 0 }; e.n++; e.w += x.w; by.set(x.id, e); }
      extra.push(`**어제의 증강, 어땠나요**\n${[...by].map(([id, x]) => `${AUGMENT[id]?.name ?? id} ${x.n}번 골라 ${x.w}승`).join(' · ')}`);
    }
  }
  const tt = (t.results[0] ?? {}) as { games?: number; crew?: number | null };
  if (tt.games) extra.push(`**지난 24시간**  ${tt.games}판 · 모임 판 ${tt.crew ?? 0} · ${(who.results[0] as { n?: number })?.n ?? 0}명`);
  const tops = rows<{ nick: string; n: number }>(top);
  if (tops.length) extra.push(`**이번 주 가장 많이 함께한**\n${tops.map((x, i) => `${['🥇', '🥈', '🥉'][i]} ${x.nick.split('#')[0]} ${x.n}판`).join('   ')}`);
  if (extra.length) parts.push(line(), ...extra.map(text));

  parts.push(
    line(true),
    linkButtons(tonight.picks.map((p) => [AUGMENT[p.aug].name, `${web}/augments/${p.aug}`] as [string, string])),
    linkButtons([['이번 주 미션', `${web}/missions`], ['모임 기록', `${web}/crew`]]),
  );
  return { tonight, hist, message: { flags: V2, components: card(parts) } };
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
