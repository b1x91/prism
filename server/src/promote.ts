/**
 * 디스코드 역할 자동 승급·강등 (CLAUDE.md v3.53). 매일 한 번(크론) 기록에서 다시 계산해, 바뀔 사람만 봇이 역할을 주고 뺀다.
 * - 준회원 → 정회원: 최근 14일 안에 모임 판(회원 2명 이상) 5판 이상 또는 내전(사용자 설정 판, 회원 2명 이상) 1회
 * - 정회원 → 우수회원: 최근 14일 안에 7일 연속(KST 날짜) 매일 모임 판이 있고, 그 7일 동안 운영자(ADMIN 첫 번째)와 같은 판 3판 이상
 * - 30일 동안 판·접속이 모두 없으면 한 단계 내림 (우수회원 → 정회원, 정회원 → 준회원)
 * - 운영진·특별회원·관리자는 사람이 정한다 (건드리지 않는다)
 * 승급은 역할을 더하기만 한다 (아래 역할을 빼지 않아 채널 권한이 그대로). 강등은 그 단계 역할만 뺀다.
 * 봇 역할이 서버 역할 목록에서 운영진 아래 · 회원 역할들 위에 있어야 한다.
 */
import { sendToChannel } from './bot.js';
import { ROLES, levelOf, rolesOf } from './roles.js';
import type { Env, Member } from './util.js';

/** 숫자는 여기 한 곳 */
export const PROMOTION = {
  regular: { days: 14, crewGames: 5, scrims: 1 },
  excellent: { window: 14, streak: 7, withHost: 3 },
  demoteAfterDays: 30,
} as const;

const DAY = 86400_000, KST = 9 * 3600_000;
const role = (key: string) => ROLES.find((r) => r.key === key)!.id;
const kstDay = (t: number) => Math.floor((t + KST) / DAY);

async function setRole(env: Env, memberId: string, roleId: string, on: boolean, reason: string): Promise<boolean> {
  const r = await fetch(`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${memberId}/roles/${roleId}`, {
    method: on ? 'PUT' : 'DELETE',
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'X-Audit-Log-Reason': encodeURIComponent(reason) },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!r?.ok) console.error('역할 바꾸기 실패', memberId, roleId, r?.status, await r?.text().catch(() => ''));
  return Boolean(r?.ok);
}

/** 디스코드에 지금 역할을 물어본다 (12시간마다 갱신하는 로컬 기록이 늦을 수 있어서). 실패하면 null */
async function liveRoles(env: Env, memberId: string): Promise<string[] | null> {
  const r = await fetch(`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${memberId}`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }, signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json().catch(() => null)) as { roles?: string[] } | null;
  return Array.isArray(j?.roles) ? j!.roles : null;
}

export async function promoteSweep(env: Env, now = Date.now()) {
  if (!env.DISCORD_BOT_TOKEN) return;
  const host = (env.ADMIN_DISCORD_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)[0];
  const { results: members } = await env.DB.prepare('SELECT * FROM members').all<Member>();
  const since = now - PROMOTION.regular.days * DAY;
  const win = now - PROMOTION.excellent.window * DAY;

  const count = async (sql: string, ...args: unknown[]) => {
    const m = new Map<string, number>();
    for (const r of (await env.DB.prepare(sql).bind(...args).all<{ id: string; n: number }>()).results) m.set(r.id, r.n);
    return m;
  };
  const crew = await count('SELECT member_id AS id, COUNT(*) AS n FROM participants WHERE played_at >= ? AND crew_count >= 2 GROUP BY member_id', since);
  const scrims = await count(`SELECT p.member_id AS id, COUNT(*) AS n FROM participants p JOIN matches m ON m.game_id = p.game_id
    WHERE p.played_at >= ? AND p.crew_count >= 2 AND m.queue_id != 2400 GROUP BY p.member_id`, since);
  // 우수회원 판단용: 최근 창의 모임 판 (판·날짜·운영자와 같은 판인지)
  const { results: rows } = await env.DB.prepare(`SELECT p.member_id AS id, p.played_at AS t,
      EXISTS (SELECT 1 FROM participants h WHERE h.game_id = p.game_id AND h.member_id = ?) AS withHost
    FROM participants p WHERE p.played_at >= ? AND p.crew_count >= 2`).bind(host ?? '', win).all<{ id: string; t: number; withHost: number }>();
  const byMember = new Map<string, { day: number; host: boolean }[]>();
  for (const r of rows) (byMember.get(r.id) ?? byMember.set(r.id, []).get(r.id)!).push({ day: kstDay(r.t), host: Boolean(r.withHost) });

  /** 7일 연속 매일 모임 판이 있고, 그 7일 동안 운영자와 같은 판이 3판 이상인 구간이 있는가 */
  const excellent = (id: string) => {
    const g = byMember.get(id);
    if (!g) return false;
    const days = new Set(g.map((x) => x.day));
    for (const start of days) {
      let ok = true;
      for (let d = start; d < start + PROMOTION.excellent.streak; d++) if (!days.has(d)) { ok = false; break; }
      if (!ok) continue;
      const withHost = g.filter((x) => x.host && x.day >= start && x.day < start + PROMOTION.excellent.streak).length;
      if (withHost >= PROMOTION.excellent.withHost) return true;
    }
    return false;
  };

  // 마지막 강등 시각 (강등 뒤 30일이 다시 지나야 또 내려간다)
  const demoted = new Map<string, number>();
  for (const r of (await env.DB.prepare("SELECT k, at FROM ext_cache WHERE k LIKE 'demoted-%'").all<{ k: string; at: number }>()).results) demoted.set(r.k.slice(8), r.at);

  const R = { associate: role('associate'), regular: role('regular'), excellent: role('excellent') };
  const cheers: string[] = [];
  for (const m of members) {
    if (m.tier === 'admin' || m.id === host) continue;
    const lv = levelOf(m);
    if (lv >= 4) continue; // 특별회원·운영진은 사람이 정한다
    const mine = new Set(rolesOf(m));
    const lastActive = Math.max(m.last_seen_at ?? 0, m.last_played_at ?? 0, demoted.get(m.id) ?? 0);
    const idle = now - lastActive > PROMOTION.demoteAfterDays * DAY;
    let changed = false;
    if (idle) {
      // 한 단계 내림
      if (lv === 3 && await setRole(env, m.id, R.excellent, false, 'Prism: 30일 활동 없음')) { mine.delete(R.excellent); changed = true; }
      else if (lv === 2 && await setRole(env, m.id, R.regular, false, 'Prism: 30일 활동 없음')) {
        mine.delete(R.regular); changed = true;
        if (!mine.has(R.associate) && await setRole(env, m.id, R.associate, true, 'Prism: 30일 활동 없음')) mine.add(R.associate);
      }
      if (changed) await env.DB.prepare('INSERT OR REPLACE INTO ext_cache (k, v, at) VALUES (?, ?, ?)').bind(`demoted-${m.id}`, '1', now).run();
    } else {
      const up = lv <= 1 && ((crew.get(m.id) ?? 0) >= PROMOTION.regular.crewGames || (scrims.get(m.id) ?? 0) >= PROMOTION.regular.scrims) ? { id: R.regular, lv: 2, name: '정회원', why: 'Prism: 모임 판 기준 충족' }
        : lv === 2 && excellent(m.id) ? { id: R.excellent, lv: 3, name: '우수회원', why: 'Prism: 7일 연속 모임 판' } : null;
      if (up) {
        const live = await liveRoles(env, m.id);
        if (live === null) continue; // 서버를 나갔거나 확인 실패 — 다음 날 다시
        mine.clear(); live.forEach((x) => mine.add(x)); changed = true; // 디스코드의 지금 역할로 맞춘다
        // 그사이 사람이 이미 그 단계 이상으로 올렸으면 그대로 둔다
        if (levelOf({ tier: m.tier, discord_roles: JSON.stringify(live) }) < up.lv && await setRole(env, m.id, up.id, true, up.why)) { mine.add(up.id); cheers.push(`<@${m.id}> 님이 **${up.name}**이 되었어요!`); }
      }
    }
    // 앱 권한에 바로 반영 (12시간 갱신을 기다리지 않게)
    if (changed) await env.DB.prepare('UPDATE members SET discord_roles = ?, roles_at = ? WHERE id = ?').bind(JSON.stringify([...mine]), now, m.id).run();
  }
  if (cheers.length && env.BOT_CHANNEL_ID) {
    await sendToChannel(env, env.BOT_CHANNEL_ID, { content: `🎉 ${cheers.join('\n')}`, allowed_mentions: { users: cheers.map((c) => c.slice(2, c.indexOf('>'))) } });
  }
}
