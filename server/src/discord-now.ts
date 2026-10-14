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

async function widget(env: Env): Promise<Widget | null> {
  const url = `https://discord.com/api/guilds/${env.DISCORD_GUILD_ID}/widget.json`;
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(url);
  let res = await cache.match(key);
  if (!res) {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!r) return null;
    res = new Response(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${TTL}` } });
    await cache.put(key, res.clone()).catch(() => {});
  }
  if (!res.ok) return null; // 위젯 꺼짐(403) 등
  return (await res.json()) as Widget;
}

export async function discordNow(env: Env) {
  // 로컬 개발(DEV_LOGIN=1)에서만: 위젯이 꺼져 있으면 화면 확인용 예시 (배포 환경에서는 DEV_LOGIN 을 절대 켜지 않는다)
  const w = (await widget(env)) ?? (env.DEV_LOGIN === '1' ? DEV_SAMPLE : null);
  if (!w) return json({ enabled: false, invite: env.DISCORD_INVITE_URL ?? null });
  const inVoice = w.members.filter((m) => m.channel_id);
  const names = [...new Set(w.members.map((m) => m.username))];
  const faces = new Map<string, { id: string; skin: number | null; main: number | null }>();
  if (names.length) {
    const { results } = await env.DB.prepare(
      `SELECT m.id, m.discord_name AS name, m.nick, ${FACE('m')} FROM members m WHERE m.discord_name IN (${names.map(() => '?').join(',')}) OR m.nick IN (${names.map(() => '?').join(',')})`,
    ).bind(...names, ...names).all<{ id: string; name: string; nick: string; skin: number | null; main: number | null }>();
    for (const r of results) { faces.set(r.name, r); faces.set(r.nick, r); }
  }
  // 음성 채널 바로가기: 서버 회원이 누르면 디스코드가 그 채널을 열고 '참가'를 띄운다 (초대 링크는 봇이 있어야 만들 수 있다)
  const channels = [...w.channels].sort((a, b) => a.position - b.position).map((c) => ({
    id: c.id,
    name: c.name,
    link: `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${c.id}`,
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
  ],
};
