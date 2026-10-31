/**
 * 디스코드 서버 별명 = 롤 게임 이름 (CLAUDE.md v3.131).
 * 롤 계정을 연결할 때 바로, 그리고 매일 새벽 한 번 전체를 맞춘다 (롤 이름을 바꾼 회원도 하루 안에 따라간다).
 * 봇에게 '별명 관리' 권한이 있어야 하고, 서버 주인·봇보다 높은 역할의 별명은 디스코드가 막는다 (그 회원은 건너뛴다).
 */
import type { Env } from './util.js';

/** '이름#태그' → 디스코드 별명 (게임 안에서 보이는 이름만, 32자) */
export const gameNameOf = (riotId: string | null | undefined) => {
  const name = (riotId ?? '').split('#')[0]?.trim() ?? '';
  return name ? name.slice(0, 32) : null;
};

/** 결과: 0 = 바꿀 것 없음, 200 = 바꿈, 그 밖 = 디스코드 응답 코드 (403 = 권한·역할 순서, -1 = 연결 실패) */
export async function syncNick(env: Env, memberId: string, riotId: string | null | undefined, current?: string | null): Promise<number> {
  const nick = gameNameOf(riotId);
  if (!nick || !env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID || current === nick) return 0;
  const r = await fetch(`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${memberId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json', 'X-Audit-Log-Reason': encodeURIComponent('Prism: 롤 게임 이름에 맞춤') },
    body: JSON.stringify({ nick }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!r?.ok) {
    console.error('디스코드 별명 바꾸기 실패', memberId, r?.status, await r?.text().catch(() => ''));
    return r?.status ?? -1;
  }
  await env.DB.prepare('UPDATE members SET discord_nick = ? WHERE id = ?').bind(nick, memberId).run();
  return 200;
}

/** 매일: 롤 이름이 있는데 디스코드 별명이 아직 다른 회원만 */
export async function nickSweep(env: Env) {
  const out = { total: 0, same: 0, changed: [] as string[], failed: [] as { name: string; status: number }[] };
  if (!env.DISCORD_BOT_TOKEN) return out;
  const { results } = await env.DB.prepare("SELECT id, riot_id, discord_nick FROM members WHERE riot_id LIKE '%#%'").all<{ id: string; riot_id: string; discord_nick: string | null }>();
  out.total = results.length;
  for (const m of results) {
    const name = gameNameOf(m.riot_id) ?? '';
    if (name === m.discord_nick) { out.same++; continue; }
    const st = await syncNick(env, m.id, m.riot_id, m.discord_nick);
    if (st === 200) out.changed.push(name);
    else if (st !== 0) out.failed.push({ name, status: st });
    await new Promise((res) => setTimeout(res, 400)); // 디스코드 요청 제한에 걸리지 않게 천천히
  }
  return out;
}

/** 지금 바로 한 번 (배포 워크플로가 봇 토큰으로 부른다 — 사람 로그인 없이) */
export async function nickSyncNow(req: Request, env: Env) {
  const auth = req.headers.get('Authorization') ?? '';
  if (!env.DISCORD_BOT_TOKEN || auth !== `Bot ${env.DISCORD_BOT_TOKEN}`) return new Response('forbidden', { status: 403 });
  // 저장소가 공개라 실행 기록에 회원 이름이 남지 않게 수만 돌려준다
  const r = await nickSweep(env);
  const why: Record<string, number> = {};
  for (const f of r.failed) why[f.status] = (why[f.status] ?? 0) + 1;
  return Response.json({ total: r.total, same: r.same, changed: r.changed.length, failed: r.failed.length, failedByStatus: why });
}
