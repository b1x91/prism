/**
 * 지금 디스코드: 음성 채널에 누가 있는지 (디스코드 '서버 위젯' JSON, 봇 없이).
 * 위젯이 꺼져 있으면 enabled=false. 디스코드 호출은 20초 동안 캐시한다 (회원이 많이 열어도 디스코드에 한 번).
 * 회원 매칭: 위젯은 디스코드 ID 를 감추므로 표시 이름으로 Prism 회원을 찾아 대표 스킨 얼굴을 붙인다.
 */
import { FACE, json, type Env } from './util.js';

type Widget = {
  instant_invite: string | null;
  presence_count: number;
  channels: { id: string; name: string; position: number }[];
  members: { username: string; avatar_url: string; status: string; channel_id?: string; self_mute?: boolean; self_deaf?: boolean; mute?: boolean; deaf?: boolean }[];
};

const TTL = 20;

/**
 * 위젯 읽기. 결과는 셋 중 하나:
 *  - Widget: 정상
 *  - 'off': 디스코드가 '위젯 꺼짐'이라고 분명히 답함 (403)
 *  - null: 잠깐 실패 (시간 초과·너무 많은 요청 429·5xx). 이때는 꺼졌다고 하지 않고 마지막 정상값을 쓴다
 * (예전에는 잠깐 실패도 '꺼짐'으로 보여 켜 둔 위젯 안내가 아무 때나 떴다)
 */
let memo: { w: Widget; at: number } | null = null;
let backoffUntil = 0;
const KEEP = 15 * 60_000; // 마지막 정상값을 쓸 수 있는 시간

async function fetchWidget(env: Env): Promise<Widget | 'off' | null> {
  const url = `https://discord.com/api/guilds/${env.DISCORD_GUILD_ID}/widget.json`;
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(url);
  const hit = await cache.match(key);
  if (hit) return (await hit.json()) as Widget;
  if (Date.now() < backoffUntil) return null;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!r) return null;
  if (r.status === 403) return 'off';
  if (r.status === 429) {
    const after = Number(r.headers.get('Retry-After') ?? '') || 30;
    backoffUntil = Date.now() + Math.min(after, 300) * 1000;
    return null;
  }
  if (!r.ok) return null;
  const text = await r.text();
  try {
    const w = JSON.parse(text) as Widget;
    await cache.put(key, new Response(text, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${TTL}` } })).catch(() => {});
    return w;
  } catch {
    return null;
  }
}

async function widget(env: Env): Promise<Widget | 'off' | null> {
  const got = await fetchWidget(env);
  const now = Date.now();
  if (got && got !== 'off') {
    // 마지막 정상값: 이 Worker 메모리 + D1 (다른 Worker 인스턴스도 쓰도록, 1분에 한 번만 쓴다)
    if (!memo || now - memo.at > 60_000) {
      await env.DB.prepare('INSERT INTO ext_cache (k, v, at) VALUES (?, ?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v, at = excluded.at')
        .bind('discord-widget', JSON.stringify(got), now).run().catch(() => {});
    }
    memo = { w: got, at: now };
    return got;
  }
  if (got === 'off') return 'off';
  if (memo && now - memo.at < KEEP) return memo.w;
  const row = await env.DB.prepare('SELECT v, at FROM ext_cache WHERE k = ?').bind('discord-widget').first<{ v: string; at: number }>().catch(() => null);
  if (row && now - row.at < KEEP) {
    try { const w = JSON.parse(row.v) as Widget; memo = { w, at: row.at }; return w; } catch { /* 깨진 값 */ }
  }
  return null;
}

export async function discordNow(env: Env) {
  // 로컬 개발(DEV_LOGIN=1)에서만: 위젯이 꺼져 있으면 화면 확인용 예시 (배포 환경에서는 DEV_LOGIN 을 절대 켜지 않는다)
  const got = await widget(env);
  const w = got && got !== 'off' ? got : env.DEV_LOGIN === '1' ? DEV_SAMPLE : null;
  // 꺼짐은 디스코드가 분명히 '꺼짐'이라고 할 때만. 잠깐 실패면 unavailable (화면은 이전 내용을 그대로 둔다)
  if (!w) return json(got === 'off' ? { enabled: false, invite: env.DISCORD_INVITE_URL ?? null } : { enabled: true, unavailable: true, invite: env.DISCORD_INVITE_URL ?? null });
  const inVoice = w.members.filter((m) => m.channel_id);
  const names = [...new Set(w.members.map((m) => m.username))];
  const faces = new Map<string, { id: string; skin: number | null; main: number | null }>();
  if (names.length) {
    const { results } = await env.DB.prepare(
      `SELECT m.id, m.discord_name AS name, m.nick, ${FACE('m')} FROM members m WHERE m.discord_name IN (${names.map(() => '?').join(',')}) OR m.nick IN (${names.map(() => '?').join(',')})`,
    ).bind(...names, ...names).all<{ id: string; name: string; nick: string; skin: number | null; main: number | null }>();
    for (const r of results) { faces.set(r.name, r); faces.set(r.nick, r); }
  }
  // 음성 채널마다 두 가지 주소:
  //  link   = 서버 회원용 바로가기 (앱 '들어가기'. 디스코드가 그 채널을 연다)
  //  invite = 누구나 들어올 수 있는 초대 링크 ('링크 복사'). 채널별 초대(VOICE_INVITES)가 없으면 서버 초대로
  const voiceInvites = new Map((env.VOICE_INVITES ?? '').split(',').map((x) => x.trim().split('=') as [string, string]).filter(([k, v]) => k && v));
  const channels = [...w.channels].sort((a, b) => a.position - b.position).map((c) => ({
    id: c.id,
    name: c.name,
    link: `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${c.id}`,
    invite: voiceInvites.get(c.id) ?? w.instant_invite ?? env.DISCORD_INVITE_URL ?? null,
    members: inVoice.filter((m) => m.channel_id === c.id).map((m) => {
      const f = faces.get(m.username);
      return { name: m.username, avatar: m.avatar_url, muted: Boolean(m.self_mute || m.mute), deaf: Boolean(m.self_deaf || m.deaf), memberId: f?.id ?? null, skin: f?.skin ?? null, main: f?.main ?? null };
    }),
  }));
  // 접속 중인 사람 (온라인 > 자리 비움 > 방해 금지 순). 무슨 게임을 하는지는 쓰지 않는다
  const rank = (m: Widget['members'][number]) => (m.status === 'online' ? 0 : m.status === 'idle' ? 1 : 2);
  const online = [...w.members].sort((a, b) => rank(a) - rank(b)).slice(0, 30).map((m) => {
    const f = faces.get(m.username);
    return { name: m.username, avatar: m.avatar_url, status: m.status, memberId: f?.id ?? null, skin: f?.skin ?? null, main: f?.main ?? null };
  });
  return json({ enabled: true, online: w.presence_count, inVoice: inVoice.length, invite: w.instant_invite ?? env.DISCORD_INVITE_URL ?? null, channels, members: online });
}

const DEV_SAMPLE: Widget = {
  instant_invite: null,
  presence_count: 23,
  channels: [{ id: 'v1', name: '증바람 1번방', position: 0 }, { id: 'v2', name: '증바람 2번방', position: 1 }, { id: 'v3', name: '내전방', position: 2 }],
  members: [
    { username: '하제', avatar_url: '', status: 'online', channel_id: 'v1' },
    { username: '노을', avatar_url: '', status: 'online' },
    { username: '바람', avatar_url: '', status: 'idle' },
    { username: '빛', avatar_url: '', status: 'online', channel_id: 'v1', self_mute: true },
    { username: '굴절', avatar_url: '', status: 'online', channel_id: 'v1' },
    { username: '분광', avatar_url: '', status: 'idle', channel_id: 'v3', self_deaf: true },
    { username: 'Dante', avatar_url: '', status: 'online' },
    { username: 'Andrew.Hwang', avatar_url: '', status: 'online' },
    { username: 'Jockie Music (3)', avatar_url: '', status: 'online' },
    { username: 'Listen', avatar_url: '', status: 'online' },
    { username: '나코치', avatar_url: '', status: 'idle' },
    { username: '내실력불법대출', avatar_url: '', status: 'online' },
    { username: '노래하는하리보', avatar_url: '', status: 'online' },
    { username: '망할련', avatar_url: '', status: 'online' },
    { username: '스으달', avatar_url: '', status: 'online' },
    { username: '양념', avatar_url: '', status: 'idle' },
    { username: '주누', avatar_url: '', status: 'online' },
    { username: '지농이', avatar_url: '', status: 'online' },
    { username: '타잔', avatar_url: '', status: 'online' },
    { username: '티어', avatar_url: '', status: 'online' },
    { username: '사지찢기', avatar_url: '', status: 'idle' },
    { username: '창창', avatar_url: '', status: 'online' },
    { username: 'Ryu gam.', avatar_url: '', status: 'online' },
  ],
};
