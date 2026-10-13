/**
 * Prism 서버 (Cloudflare Worker + D1).
 * 모든 /api/* 는 로그인한 회원만. 회원 데이터는 어떤 형태로도 비로그인 응답에 넣지 않는다.
 * /links 는 공개(디스코드·카카오톡 주소). 가입 전인 사람도 들어올 길이 있어야 하므로.
 */
import { authenticate, devLogin, discordCallback, exchangeCode, logout, startDiscord } from './auth.js';
import { addTip, augmentStats, board, myGames, champSelect, crewTargets, deleteTip, getChampion, getMe, linkRiot, setConsent, setProfile, toggleLike } from './crew.js';
import { ingest } from './ingest.js';
import { memberPage, ranking } from './members.js';
import { addNote, deleteNote, links, listNotes } from './notes.js';
import { cancelParty, joinParty, leaveParty, listParties, openParty } from './parties.js';
import { HttpError, json, webOrigins, type Env } from './util.js';

async function route(req: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(req.url);
  const m = req.method;

  if (m === 'GET' && pathname === '/') return json({ name: 'Prism', ok: true });
  if (m === 'GET' && pathname === '/auth/discord/start') return startDiscord(req, env);
  if (m === 'GET' && pathname === '/auth/discord/callback') return discordCallback(req, env);
  if (m === 'GET' && pathname === '/auth/dev') return devLogin(req, env);
  if (m === 'POST' && pathname === '/api/app/token') return exchangeCode(req, env);
  if (m === 'POST' && pathname === '/api/logout') return logout(req, env);
  if (m === 'GET' && pathname === '/links') return json(links(env));

  if (!pathname.startsWith('/api/')) throw new HttpError(404, 'not found');
  const me = await authenticate(req, env);

  if (m === 'GET' && pathname === '/api/me') return getMe(env, me);
  if (m === 'GET' && pathname === '/api/me/games') return myGames(env, me);
  if (m === 'POST' && pathname === '/api/me/riot') return linkRiot(req, env, me);
  if (m === 'POST' && pathname === '/api/me/consent') return setConsent(req, env, me);
  if (m === 'POST' && pathname === '/api/me/profile') return setProfile(req, env, me);
  if (m === 'GET' && pathname === '/api/crew/targets') return crewTargets(env);
  if (m === 'POST' && pathname === '/api/ingest') return ingest(req, env, me);
  if (m === 'POST' && pathname === '/api/champselect') return champSelect(req, env, me);
  if (m === 'GET' && pathname === '/api/board') return board(env, me);
  if (m === 'POST' && pathname === '/api/tips') return addTip(req, env, me);
  if (m === 'GET' && pathname === '/api/notes') return listNotes(env, me);
  if (m === 'GET' && pathname === '/api/ranking') return ranking(env, new URL(req.url).searchParams.get('period'));
  if (m === 'POST' && pathname === '/api/notes') return addNote(req, env, me);
  if (m === 'GET' && pathname === '/api/parties') return listParties(env, me);
  if (m === 'POST' && pathname === '/api/parties') return openParty(req, env, me);
  if (m === 'GET' && pathname === '/api/augments') {
    const c = Number(new URL(req.url).searchParams.get('champion'));
    return augmentStats(env, Number.isInteger(c) && c > 0 ? c : null);
  }

  const champ = pathname.match(/^\/api\/champions\/(\d+)$/);
  if (m === 'GET' && champ) return getChampion(env, me, Number(champ[1]));
  const member = pathname.match(/^\/api\/members\/([0-9A-Za-z_-]{1,40})$/);
  if (m === 'GET' && member) return memberPage(env, me, member[1]);
  const like = pathname.match(/^\/api\/tips\/(\d+)\/like$/);
  if (m === 'POST' && like) return toggleLike(env, me, Number(like[1]));
  const party = pathname.match(/^\/api\/parties\/(\d+)\/(join|leave|cancel)$/);
  if (m === 'POST' && party) {
    const id = Number(party[1]);
    return party[2] === 'join' ? joinParty(env, me, id) : party[2] === 'leave' ? leaveParty(env, me, id) : cancelParty(env, me, id);
  }
  const note = pathname.match(/^\/api\/notes\/(\d+)$/);
  if (m === 'DELETE' && note) return deleteNote(env, me, Number(note[1]));
  const tip = pathname.match(/^\/api\/tips\/(\d+)$/);
  if (m === 'DELETE' && tip) return deleteTip(env, me, Number(tip[1]));

  throw new HttpError(404, 'not found');
}

/** 등록된 웹 사이트에서 오는 요청만 CORS 허용 (토큰은 Authorization 헤더, 쿠키 안 씀) */
function withCors(req: Request, env: Env, res: Response): Response {
  const origin = req.headers.get('Origin');
  if (!origin || !webOrigins(env).includes(origin)) return res;
  const r = new Response(res.body, res);
  r.headers.set('Access-Control-Allow-Origin', origin);
  r.headers.set('Vary', 'Origin');
  return r;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') {
      const origin = req.headers.get('Origin');
      if (!origin || !webOrigins(env).includes(origin)) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, DELETE',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        },
      });
    }
    try {
      return withCors(req, env, await route(req, env));
    } catch (e) {
      if (e instanceof HttpError) return withCors(req, env, json({ error: e.message }, e.status));
      console.error(e);
      return withCors(req, env, json({ error: '서버 오류가 발생했습니다.' }, 500));
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
