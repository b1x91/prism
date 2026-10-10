/**
 * Prism 서버 (Cloudflare Worker + D1).
 * 모든 /api/* 는 로그인한 회원만. 회원 데이터는 어떤 형태로도 비로그인 응답에 넣지 않는다.
 */
import { authenticate, devLogin, discordCallback, exchangeCode, logout, startDiscord } from './auth.js';
import { addTip, board, champSelect, crewTargets, deleteTip, getChampion, getMe, linkRiot, setConsent, setProfile, toggleLike } from './crew.js';
import { ingest } from './ingest.js';
import { HttpError, json, type Env } from './util.js';

async function route(req: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(req.url);
  const m = req.method;

  if (m === 'GET' && pathname === '/') return json({ name: 'Prism', ok: true });
  if (m === 'GET' && pathname === '/auth/discord/start') return startDiscord(req, env);
  if (m === 'GET' && pathname === '/auth/discord/callback') return discordCallback(req, env);
  if (m === 'GET' && pathname === '/auth/dev') return devLogin(req, env);
  if (m === 'POST' && pathname === '/api/app/token') return exchangeCode(req, env);
  if (m === 'POST' && pathname === '/api/logout') return logout(req, env);

  if (!pathname.startsWith('/api/')) throw new HttpError(404, 'not found');
  const me = await authenticate(req, env);

  if (m === 'GET' && pathname === '/api/me') return getMe(env, me);
  if (m === 'POST' && pathname === '/api/me/riot') return linkRiot(req, env, me);
  if (m === 'POST' && pathname === '/api/me/consent') return setConsent(req, env, me);
  if (m === 'POST' && pathname === '/api/me/profile') return setProfile(req, env, me);
  if (m === 'GET' && pathname === '/api/crew/targets') return crewTargets(env);
  if (m === 'POST' && pathname === '/api/ingest') return ingest(req, env, me);
  if (m === 'POST' && pathname === '/api/champselect') return champSelect(req, env, me);
  if (m === 'GET' && pathname === '/api/board') return board(env, me);
  if (m === 'POST' && pathname === '/api/tips') return addTip(req, env, me);

  const champ = pathname.match(/^\/api\/champions\/(\d+)$/);
  if (m === 'GET' && champ) return getChampion(env, me, Number(champ[1]));
  const like = pathname.match(/^\/api\/tips\/(\d+)\/like$/);
  if (m === 'POST' && like) return toggleLike(env, me, Number(like[1]));
  const tip = pathname.match(/^\/api\/tips\/(\d+)$/);
  if (m === 'DELETE' && tip) return deleteTip(env, me, Number(tip[1]));

  throw new HttpError(404, 'not found');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await route(req, env);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: '서버 오류가 발생했습니다.' }, 500);
    }
  },

  // 만료된 1회용 코드·state 정리 (매일)
  async scheduled(_controller: ScheduledController, env: Env) {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM auth_codes WHERE expires_at < ?').bind(now),
      env.DB.prepare('DELETE FROM oauth_states WHERE expires_at < ?').bind(now),
    ]);
  },
} satisfies ExportedHandler<Env>;
