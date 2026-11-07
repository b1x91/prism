/**
 * 디스코드 역할 자동 승급·강등 (CLAUDE.md v3.53). 매일 한 번(크론) 기록에서 다시 계산해, 바뀔 사람만 봇이 역할을 주고 뺀다.
 * - 준회원 → 정회원: 자동이 아니다 (v3.107). 운영진과 같은 판 3판 이상이면 '운영' 페이지 정회원 심사 → 운영진 승인 (staff.ts)
 * - 정회원 → 우수회원: 자동이 아니다 (v3.190). 운영진이 고른다 — 예전 기준(14일 안 7일 연속 모임 판 + 운영자와 3판)은 '우수회원 후보' 추천으로만
 * - 정회원·우수회원은 운영진이 카톡방에 있는 것을 확인한 회원만 (members.kakao_at, v3.190, staff.ts)
 * - 30일 동안 판·접속이 모두 없으면 한 단계 내림 (우수회원 → 정회원, 정회원 → 준회원)
 * - 운영진·특별회원·관리자는 사람이 정한다 (건드리지 않는다)
 * 승급은 역할을 더하기만 한다 (아래 역할을 빼지 않아 채널 권한이 그대로). 강등은 그 단계 역할만 뺀다.
 * 봇 역할이 서버 역할 목록에서 운영진 아래 · 회원 역할들 위에 있어야 한다.
 */
import { ROLES, levelOf, rolesOf } from './roles.js';
import type { Env, Member } from './util.js';

/** 숫자는 여기 한 곳 */
export const PROMOTION = {
  /** 정회원 심사에 올라가는 기준: 운영진(운영진 역할·관리자)과 같은 판 수 (v3.107, staff.ts) */
  regularReview: { withStaff: 3 },
  excellent: { window: 14, streak: 7, withHost: 3 },
  demoteAfterDays: 30,
} as const;

const DAY = 86400_000, KST = 9 * 3600_000;
const role = (key: string) => ROLES.find((r) => r.key === key)!.id;
const kstDay = (t: number) => Math.floor((t + KST) / DAY);

export async function setRole(env: Env, memberId: string, roleId: string, on: boolean, reason: string): Promise<boolean> {
  const r = await fetch(`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${memberId}/roles/${roleId}`, {
    method: on ? 'PUT' : 'DELETE',
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'X-Audit-Log-Reason': encodeURIComponent(reason) },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!r?.ok) console.error('역할 바꾸기 실패', memberId, roleId, r?.status, await r?.text().catch(() => ''));
  return Boolean(r?.ok);
}

/** 디스코드에 지금 역할을 물어본다 (12시간마다 갱신하는 로컬 기록이 늦을 수 있어서). 실패하면 null */
export async function liveRoles(env: Env, memberId: string): Promise<string[] | null> {
  const r = await fetch(`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${memberId}`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }, signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json().catch(() => null)) as { roles?: string[] } | null;
  return Array.isArray(j?.roles) ? j!.roles : null;
}

const hostId = (env: Env) => (env.ADMIN_DISCORD_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)[0];

/**
 * 우수회원 후보 (v3.190: 자동 승급을 없애고 운영진이 고른다 — 이 기준은 운영 › 할 일 '우수회원 후보'의 추천으로만 쓴다).
 * 최근 PROMOTION.excellent.window 일 안에 streak 일 연속 매일 모임 판이 있고, 그 구간에 운영자와 같은 판이 withHost 판 이상.
 */
export async function excellentHints(env: Env, now = Date.now()): Promise<Set<string>> {
  const host = hostId(env);
  const win = now - PROMOTION.excellent.window * DAY;
  const { results: rows } = await env.DB.prepare(`SELECT p.member_id AS id, p.played_at AS t,
      EXISTS (SELECT 1 FROM participants h WHERE h.game_id = p.game_id AND h.member_id = ?) AS withHost
    FROM participants p WHERE p.played_at >= ? AND p.crew_count >= 2`).bind(host ?? '', win).all<{ id: string; t: number; withHost: number }>();
  const byMember = new Map<string, { day: number; host: boolean }[]>();
  for (const r of rows) (byMember.get(r.id) ?? byMember.set(r.id, []).get(r.id)!).push({ day: kstDay(r.t), host: Boolean(r.withHost) });
  const out = new Set<string>();
  for (const [id, g] of byMember) {
    const days = new Set(g.map((x) => x.day));
    for (const start of days) {
      let ok = true;
      for (let d = start; d < start + PROMOTION.excellent.streak; d++) if (!days.has(d)) { ok = false; break; }
      if (!ok) continue;
      if (g.filter((x) => x.host && x.day >= start && x.day < start + PROMOTION.excellent.streak).length >= PROMOTION.excellent.withHost) { out.add(id); break; }
    }
  }
  return out;
}

export async function promoteSweep(env: Env, now = Date.now()) {
  if (!env.DISCORD_BOT_TOKEN) return;
  const host = hostId(env);
  const { results: members } = await env.DB.prepare('SELECT * FROM members').all<Member>();
  // 마지막 강등 시각 (강등 뒤 30일이 다시 지나야 또 내려간다)
  const demoted = new Map<string, number>();
  for (const r of (await env.DB.prepare("SELECT k, at FROM ext_cache WHERE k LIKE 'demoted-%'").all<{ k: string; at: number }>()).results) demoted.set(r.k.slice(8), r.at);

  const R = { associate: role('associate'), regular: role('regular'), excellent: role('excellent') };
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
    }
    // 승급은 자동으로 하지 않는다 — 준회원 → 정회원은 정회원 심사 + 카톡방 확인, 정회원 → 우수회원은 운영진 선발 (v3.107, v3.190, staff.ts)
    // 앱 권한에 바로 반영 (12시간 갱신을 기다리지 않게)
    if (changed) await env.DB.prepare('UPDATE members SET discord_roles = ?, roles_at = ? WHERE id = ?').bind(JSON.stringify([...mine]), now, m.id).run();
  }
}
