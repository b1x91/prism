/**
 * 로그인 흐름 (앱은 루프백 주소, 웹은 WEB_ORIGINS 에 등록된 주소로 돌아간다):
 *   앱 → 브라우저로 /auth/discord/start?redirect=http://127.0.0.1:5199/auth/done
 *   → 디스코드 승인 → /auth/discord/callback → 서버 멤버 확인 → members upsert
 *   → 1회용 code 와 함께 앱 로컬 주소로 리다이렉트 → 앱이 POST /api/app/token 으로 토큰 교환
 * 등급은 DB 가 진실. 디스코드 역할은 읽지 않는다 (CLAUDE.md 6-1).
 */
import { allowedRedirect, HttpError, isLoopback, json, randomToken, sha256, type Env, type Member } from './util.js';

const STATE_TTL = 10 * 60_000;
const CODE_TTL = 60_000;
const DISCORD_API = 'https://discord.com/api/v10';
const TIMEOUT_MS = 10_000;

const NOT_A_MEMBER = 'Prism은 디스코드 서버 회원만 이용할 수 있습니다. 아는 분께 초대를 부탁해주세요.';

function page(title: string, message: string, status = 200) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<body style="font-family:'Pretendard Variable',Pretendard,system-ui,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;line-height:1.6"><h1 style="font-size:20px">${title}</h1><p>${message}</p></body>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function discordFetch(url: string, init: RequestInit) {
  // 외부 호출은 타임아웃과 1회 재시도
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      if (attempt >= 1) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

/** OAuth 콜백 주소. PUBLIC_URL 이 비어 있으면 이 요청이 들어온 주소 (workers.dev 주소를 미리 몰라도 된다) */
const callbackUrl = (req: Request, env: Env) => `${(env.PUBLIC_URL || new URL(req.url).origin).replace(/\/$/, '')}/auth/discord/callback`;

export async function startDiscord(req: Request, env: Env) {
  const redirect = new URL(req.url).searchParams.get('redirect') ?? '';
  if (!allowedRedirect(redirect, env)) throw new HttpError(400, '허용되지 않은 redirect 입니다.');
  const state = randomToken(16);
  await env.DB.prepare('INSERT INTO oauth_states (state, redirect, expires_at) VALUES (?, ?, ?)').bind(state, redirect, Date.now() + STATE_TTL).run();
  const u = new URL('https://discord.com/oauth2/authorize');
  u.searchParams.set('client_id', env.DISCORD_CLIENT_ID);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('redirect_uri', `${callbackUrl(req, env)}`);
  u.searchParams.set('scope', 'identify guilds.members.read');
  u.searchParams.set('state', state);
  u.searchParams.set('prompt', 'none');
  return Response.redirect(u.toString(), 302);
}

export async function discordCallback(req: Request, env: Env) {
  const q = new URL(req.url).searchParams;
  const st = await env.DB.prepare('DELETE FROM oauth_states WHERE state = ? RETURNING redirect, expires_at')
    .bind(q.get('state') ?? '')
    .first<{ redirect: string; expires_at: number }>();
  if (!st || st.expires_at < Date.now()) return page('로그인 실패', '로그인 요청이 만료되었습니다. 다시 시도해주세요.', 400);
  if (!q.get('code')) return page('로그인 취소', '디스코드 로그인이 취소되었습니다.', 400);

  const tokenRes = await discordFetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: q.get('code')!,
      redirect_uri: `${callbackUrl(req, env)}`,
    }),
  });
  if (!tokenRes.ok) return page('로그인 실패', `디스코드 응답 오류 (${tokenRes.status})`, 502);
  const { access_token, refresh_token } = (await tokenRes.json()) as { access_token: string; refresh_token?: string };

  // 서버 멤버 확인. 비회원이면 404
  const memRes = await discordFetch(`${DISCORD_API}/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (memRes.status === 404) return page('Prism 회원이 아닙니다', env.DISCORD_INVITE_URL ? `${NOT_A_MEMBER}<br><br><a href="${env.DISCORD_INVITE_URL}">디스코드 들어가기</a> 후 다시 로그인해주세요.` : NOT_A_MEMBER, 403);
  if (!memRes.ok) return page('로그인 실패', `디스코드 응답 오류 (${memRes.status})`, 502);
  const gm = (await memRes.json()) as { nick?: string | null; roles?: string[]; user: { id: string; username: string; global_name?: string | null; avatar?: string | null } };

  const id = gm.user.id;
  const name = gm.nick ?? gm.user.global_name ?? gm.user.username;
  return finishLogin(env, st.redirect, id, name, gm.user.avatar ?? null, Array.isArray(gm.roles) ? gm.roles : [], refresh_token ?? null);
}

/** 로컬 개발용 가짜 로그인. DEV_LOGIN=1 일 때만 */
export async function devLogin(req: Request, env: Env) {
  if (env.DEV_LOGIN !== '1') throw new HttpError(404, 'not found');
  const q = new URL(req.url).searchParams;
  const redirect = q.get('redirect') ?? '';
  if (!allowedRedirect(redirect, env)) throw new HttpError(400, '허용되지 않은 redirect 입니다.');
  const id = q.get('id') ?? 'dev-1';
  // 개발용: roles=역할1,역할2 로 디스코드 역할을 흉내낸다
  return finishLogin(env, redirect, id, q.get('name') ?? id, null, (q.get('roles') ?? '').split(',').filter(Boolean));
}

async function finishLogin(env: Env, redirect: string, id: string, name: string, avatar: string | null, roles: string[], refresh: string | null = null) {
  const now = Date.now();
  const admins = env.ADMIN_DISCORD_IDS.split(',').map((s) => s.trim()).filter(Boolean);
  // 신규는 guest, 기존은 등급 유지. 관리자 목록에 있으면 admin
  await env.DB.prepare(
    `INSERT INTO members (id, discord_name, discord_avatar, nick, tier, joined_at, last_seen_at, discord_roles, discord_refresh, roles_at)
     VALUES (?1, ?2, ?3, ?2, ?4, ?5, ?5, ?6, ?7, ?5)
     ON CONFLICT (id) DO UPDATE SET discord_name = ?2, discord_avatar = ?3, last_seen_at = ?5, discord_roles = ?6,
       discord_refresh = COALESCE(?7, members.discord_refresh), roles_at = ?5,
       tier = CASE WHEN ?4 = 'admin' THEN 'admin' ELSE members.tier END`,
  )
    .bind(id, name, avatar, admins.includes(id) ? 'admin' : 'guest', now, JSON.stringify(roles.slice(0, 100)), refresh)
    .run();
  // 앱(루프백 주소)으로 로그인 = 앱을 쓰는 회원 (승인 대기 조건, v3.108)
  if (isLoopback(redirect)) await env.DB.prepare('UPDATE members SET app_first_at = ?1 WHERE id = ?2 AND app_first_at = 0').bind(now, id).run();

  const code = randomToken(24);
  await env.DB.prepare('INSERT INTO auth_codes (code_hash, member_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(code), id, now + CODE_TTL).run();
  const back = new URL(redirect);
  back.searchParams.set('code', code);
  return Response.redirect(back.toString(), 302);
}

export async function exchangeCode(req: Request, env: Env) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  if (!code) throw new HttpError(400, 'code 가 없습니다.');
  const row = await env.DB.prepare('DELETE FROM auth_codes WHERE code_hash = ? RETURNING member_id, expires_at')
    .bind(await sha256(code))
    .first<{ member_id: string; expires_at: number }>();
  if (!row || row.expires_at < Date.now()) throw new HttpError(401, '코드가 만료되었습니다. 다시 로그인해주세요.');
  const token = randomToken(32);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO app_tokens (token_hash, member_id, created_at, last_used_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), row.member_id, now, now)
    .run();
  return json({ token });
}

/** Bearer 토큰으로 회원을 찾는다 */
export async function authenticate(req: Request, env: Env): Promise<Member> {
  const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new HttpError(401, '로그인이 필요합니다.');
  const hash = await sha256(token);
  const m = await env.DB.prepare('SELECT m.* FROM app_tokens t JOIN members m ON m.id = t.member_id WHERE t.token_hash = ?').bind(hash).first<Member>();
  if (!m) throw new HttpError(401, '로그인이 만료되었습니다. 다시 로그인해주세요.');
  const now = Date.now();
  // 디스코드 역할은 12시간마다 다시 확인 (역할이 바뀌어도 다시 로그인하지 않아도 되게)
  if (m.discord_refresh && now - (m.roles_at ?? 0) > ROLE_TTL) {
    const roles = await refreshRoles(env, m).catch(() => null);
    if (roles) { m.discord_roles = JSON.stringify(roles); m.roles_at = now; }
  }
  // 마지막 접속 시각은 1시간 단위로만 갱신 (쓰기 횟수 절약)
  if (now - m.last_seen_at > 3_600_000) {
    await env.DB.batch([
      env.DB.prepare('UPDATE members SET last_seen_at = ? WHERE id = ?').bind(now, m.id),
      env.DB.prepare('UPDATE app_tokens SET last_used_at = ? WHERE token_hash = ?').bind(now, hash),
    ]);
  }
  return m;
}

export async function logout(req: Request, env: Env) {
  const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (token) await env.DB.prepare('DELETE FROM app_tokens WHERE token_hash = ?').bind(await sha256(token)).run();
  return json({ ok: true });
}

const ROLE_TTL = 12 * 3600_000;

/**
 * refresh token 으로 디스코드에 다시 물어 역할을 갱신한다. 실패하면 null (다음 기회에).
 * 디스코드 서버를 나간 사람은 역할을 비운다.
 */
async function refreshRoles(env: Env, m: Member): Promise<string[] | null> {
  const t = await discordFetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: m.discord_refresh! }),
  });
  if (!t.ok) {
    // 토큰이 취소·만료됐으면 지우고 (다음 로그인 때 새로 받음), 확인 시각만 미룬다
    if (t.status === 400 || t.status === 401) await env.DB.prepare('UPDATE members SET discord_refresh = NULL, roles_at = ? WHERE id = ?').bind(Date.now(), m.id).run();
    return null;
  }
  const { access_token, refresh_token } = (await t.json()) as { access_token: string; refresh_token?: string };
  const r = await discordFetch(`${DISCORD_API}/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`, { headers: { Authorization: `Bearer ${access_token}` } });
  const roles = r.status === 404 ? [] : r.ok ? (((await r.json()) as { roles?: string[] }).roles ?? []) : null;
  if (!roles) return null;
  await env.DB.prepare('UPDATE members SET discord_roles = ?, discord_refresh = COALESCE(?, discord_refresh), roles_at = ? WHERE id = ?')
    .bind(JSON.stringify(roles.slice(0, 100)), refresh_token ?? null, Date.now(), m.id).run();
  return roles;
}
