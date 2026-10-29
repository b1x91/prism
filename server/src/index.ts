/**
 * Prism 서버 (Cloudflare Worker + D1).
 * 모든 /api/* 는 로그인한 회원만. 회원 데이터는 어떤 형태로도 비로그인 응답에 넣지 않는다.
 * /links 는 공개(디스코드·카카오톡 주소). 가입 전인 사람도 들어올 길이 있어야 하므로.
 * /public/:id 는 본인이 켠 공개 링크만 (모임 정보 없이 그 사람의 강점, v3.24).
 */
import { saveAbout } from './about.js';
import { dailyPayload, dailyPost, interactions } from './bot.js';
import { pulse } from './pulse.js';
import { appMembers } from './appmembers.js';
import { promoteSweep } from './promote.js';
import { download, latest } from './release.js';
import { authenticate, devLogin, discordCallback, exchangeCode, logout, startDiscord } from './auth.js';
import { artisanRanking, augmentArtisans, championArtisans, itemArtisans } from './artisans.js';
import { addTip, augmentStats, board, gameDetail, myDex, myGames, champSelect, crewTargets, deleteTip, getChampion, getMe, linkRiot, setPresence, setConsent, setProfile, toggleLike } from './crew.js';
import { ingest } from './ingest.js';
import { memberPage, ranking } from './members.js';
import { addNote, deleteNote, links, listNotes } from './notes.js';
import { deleteProspect, listProspects } from './prospects.js';
import { discordNow } from './discord-now.js';
import { listScrims, openScrim, scrimAction } from './scrims.js';
import { cancelParty, joinParty, leaveParty, listParties, openParty } from './parties.js';
import { buy, equip, getShop, markDaily, publicProfile, setShare } from './shop.js';
import { claimMissions, favCount, getFavs, getMissions, rerollMission, setFav } from './missions.js';
import { buyUse, gift, giftTargets, insight, myHighlights, openBox, pinHighlight, saveHighlights } from './goods.js';
import { claimWeekly, getWeekly } from './weekly.js';
import { assertRanking } from './roles.js';
import { diagShots, listDiag, saveDiag } from './diag.js';
import { myInquiries, postInquiry } from './inquiry.js';
import { createNews, deleteNews, editNews, ensureAuto, heartNews, listNews, readNews } from './news.js';
import { claimInvite, lookupMembers, myInvite, publicInvite, staffAction, staffMembers } from './staff.js';
import { HttpError, json, webOrigins, type Env } from './util.js';

async function route(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const { pathname } = new URL(req.url);
  const m = req.method;

  if (m === 'GET' && pathname === '/') return json({ name: 'Prism', ok: true });
  if (m === 'GET' && pathname === '/auth/discord/start') return startDiscord(req, env);
  if (m === 'GET' && pathname === '/auth/discord/callback') return discordCallback(req, env);
  if (m === 'GET' && pathname === '/auth/dev') return devLogin(req, env);
  if (m === 'POST' && pathname === '/api/app/token') return exchangeCode(req, env);
  if (m === 'POST' && pathname === '/api/logout') return logout(req, env);
  if (m === 'GET' && pathname === '/links') return json(links(env));
  if (m === 'POST' && pathname === '/discord/interactions') return interactions(req, env, ctx);
  // 앱 설치 파일·업데이트 정보 (로그인 없이)
  if (m === 'GET' && pathname === '/app/latest') return latest(req, env);
  if (m === 'GET' && pathname === '/app/download') return download(req, env);
  const dl = pathname.match(/^\/app\/download\/([0-9A-Za-z._-]{1,40})\/([0-9A-Za-z._-]{1,60})$/);
  if (m === 'GET' && dl) return download(req, env, decodeURIComponent(dl[1]), dl[2]);

  const pub = pathname.match(/^\/public\/([0-9A-Za-z_-]{1,40})$/);
  if (m === 'GET' && pub) return publicProfile(env, pub[1]);
  // 친구 초대 링크의 초대한 사람 (이름·얼굴만, v3.107)
  const inv = pathname.match(/^\/public\/invite\/([a-z0-9]{4,12})$/);
  if (m === 'GET' && inv) return publicInvite(env, inv[1]);

  if (!pathname.startsWith('/api/')) throw new HttpError(404, 'not found');
  const me = await authenticate(req, env);

  if (m === 'GET' && pathname === '/api/me') return getMe(env, me);
  if (m === 'GET' && pathname === '/api/me/games') return myGames(env, me);
  if (m === 'GET' && pathname === '/api/shop') return getShop(env, me);
  if (m === 'POST' && pathname === '/api/shop/buy') return buy(req, env, me);
  if (m === 'POST' && pathname === '/api/me/equip') return equip(req, env, me);
  // 꾸밈 밖 상품 (v3.99)
  if (m === 'POST' && pathname === '/api/shop/use') return buyUse(req, env, me);
  if (m === 'POST' && pathname === '/api/shop/box') return openBox(env, me);
  if (m === 'GET' && pathname === '/api/shop/gift') return giftTargets(env, me);
  if (m === 'POST' && pathname === '/api/shop/gift') return gift(req, env, me);
  if (m === 'GET' && pathname.startsWith('/api/me/insight/')) return insight(env, me, pathname.slice('/api/me/insight/'.length));
  if (m === 'POST' && pathname === '/api/me/missions/reroll') return rerollMission(req, env, me);
  if (m === 'GET' && pathname === '/api/me/highlights') return myHighlights(env, me);
  if (m === 'POST' && pathname === '/api/me/highlights') return saveHighlights(req, env, me);
  if (m === 'POST' && pathname === '/api/me/pin') return pinHighlight(req, env, me);
  if (m === 'POST' && pathname === '/api/me/share') return setShare(req, env, me);
  if (m === 'GET' && pathname === '/api/me/dex') return myDex(env, me);
  if (m === 'GET' && pathname === '/api/me/missions') return getMissions(env, me);
  if (m === 'POST' && pathname === '/api/me/missions/claim') return claimMissions(req, env, me);
  if (m === 'GET' && pathname === '/api/me/weekly') return getWeekly(env, me);
  if (m === 'POST' && pathname === '/api/me/weekly/claim') return claimWeekly(req, env, me);
  if (m === 'GET' && pathname === '/api/me/favs') return getFavs(env, me);
  if (m === 'POST' && pathname === '/api/me/favs') return setFav(req, env, me);
  if (m === 'GET' && pathname === '/api/favs/count') { const q = new URL(req.url).searchParams; return favCount(env, q.get('kind'), Number(q.get('id'))); }
  if (m === 'POST' && pathname === '/api/me/riot') return linkRiot(req, env, me);
  if (m === 'POST' && pathname === '/api/me/consent') return setConsent(req, env, me);
  if (m === 'POST' && pathname === '/api/me/profile') return setProfile(req, env, me);
  if (m === 'POST' && pathname === '/api/me/about') return saveAbout(req, env, me);
  if (m === 'POST' && pathname === '/api/me/diag') return saveDiag(req, env, me);
  if (m === 'GET' && pathname === '/api/me/inquiry') return myInquiries(env, me);
  if (m === 'POST' && pathname === '/api/me/inquiry') return postInquiry(req, env, me, ctx);
  if (m === 'GET' && pathname === '/api/admin/diag') return listDiag(env, me);
  { const d = /^\/api\/admin\/diag\/(\d+)\/shots$/.exec(pathname); if (m === 'GET' && d) return diagShots(env, me, Number(d[1])); }
  // 소식 피드 (v3.111)
  if (m === 'GET' && pathname === '/api/news') return listNews(env, me);
  if (m === 'POST' && pathname === '/api/news') return createNews(req, env, me);
  if (m === 'POST' && pathname === '/api/news/read') return readNews(env, me);
  const nw = pathname.match(/^\/api\/news\/(\d{1,9})(\/heart)?$/);
  if (nw && m === 'POST' && nw[2]) return heartNews(env, me, Number(nw[1]));
  if (nw && m === 'POST' && !nw[2]) return editNews(req, env, me, Number(nw[1]));
  if (nw && m === 'DELETE' && !nw[2]) return deleteNews(env, me, Number(nw[1]));
  // 운영 (운영진만, v3.107) · 친구 초대
  if (m === 'GET' && pathname === '/api/staff/members') return staffMembers(env, me);
  const st = pathname.match(/^\/api\/staff\/members\/([0-9A-Za-z_-]{1,40})\/(approve|promote|level|special|inviter)$/);
  if (m === 'POST' && st) return staffAction(req, env, me, st[1], st[2]);
  if (m === 'GET' && pathname === '/api/me/invite') return myInvite(env, me);
  if (m === 'POST' && pathname === '/api/me/invited') return claimInvite(req, env, me);
  if (m === 'GET' && pathname === '/api/members/lookup') return lookupMembers(env, me, new URL(req.url).searchParams.get('q'));
  // 매일 밤 공지 미리 보기 (올리지 않는다). ?day=YYYY-MM-DD 로 다른 날
  if (m === 'GET' && pathname === '/api/admin/daily') {
    if (me.tier !== 'admin') throw new HttpError(403, '관리자만 볼 수 있어요');
    const q = new URL(req.url).searchParams.get('day');
    return json(await dailyPayload(env, q ? Date.parse(`${q}T21:00:00+09:00`) : Date.now()));
  }
  if (m === 'POST' && pathname === '/api/me/presence') { await markDaily(env, me.id); return setPresence(env, me, await req.json<Record<string, unknown>>().catch(() => ({}))); }
  if (m === 'GET' && pathname === '/api/crew/targets') return crewTargets(env);
  if (m === 'POST' && pathname === '/api/ingest') return ingest(req, env, me);
  if (m === 'POST' && pathname === '/api/champselect') return champSelect(req, env, me);
  if (m === 'GET' && pathname === '/api/board') return board(env, me);
  if (m === 'GET' && pathname === '/api/crew/pulse') return pulse(env);
  if (m === 'GET' && pathname === '/api/crew/app-members') return appMembers(env);
  if (m === 'POST' && pathname === '/api/tips') return addTip(req, env, me);
  if (m === 'GET' && pathname === '/api/notes') return listNotes(env, me);
  if (m === 'GET' && pathname === '/api/ranking/artisans') { await assertRanking(env, me); return artisanRanking(env, me); }
  if (m === 'GET' && pathname === '/api/ranking') { await assertRanking(env, me); const q = new URL(req.url).searchParams; return ranking(env, me, q.get('period'), q.get('by')); }
  if (m === 'POST' && pathname === '/api/notes') return addNote(req, env, me);
  if (m === 'GET' && pathname === '/api/parties') return listParties(env, me);
  if (m === 'POST' && pathname === '/api/parties') return openParty(req, env, me);
  if (m === 'GET' && pathname === '/api/scrims') return listScrims(env, me);
  if (m === 'GET' && pathname === '/api/discord/now') return discordNow(env);
  if (m === 'GET' && pathname === '/api/prospects') return listProspects(env, me);
  if (m === 'POST' && pathname === '/api/scrims') return openScrim(req, env, me);
  if (m === 'GET' && pathname === '/api/augments') {
    const c = Number(new URL(req.url).searchParams.get('champion'));
    return augmentStats(env, Number.isInteger(c) && c > 0 ? c : null);
  }

  const art = pathname.match(/^\/api\/artisans\/(champion|augment|item)\/(\d+)$/);
  if (m === 'GET' && art) return art[1] === 'champion' ? championArtisans(env, Number(art[2])) : art[1] === 'item' ? itemArtisans(env, Number(art[2])) : augmentArtisans(env, Number(art[2]));
  const gm = pathname.match(/^\/api\/games\/(\d+)$/);
  if (m === 'GET' && gm) return gameDetail(env, Number(gm[1]));
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
  const sc = pathname.match(/^\/api\/scrims\/(\d+)\/(join|leave|cancel|balance|swap|lock|unlock|confirm|unconfirm)$/);
  if (m === 'POST' && sc) return scrimAction(req, env, me, Number(sc[1]), sc[2]);
  const pr = pathname.match(/^\/api\/prospects\/([0-9A-Za-z_-]{10,100})$/);
  if (m === 'DELETE' && pr) return deleteProspect(env, me, pr[1]);
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
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
      return withCors(req, env, await route(req, env, ctx));
    } catch (e) {
      if (e instanceof HttpError) return withCors(req, env, json({ error: e.message }, e.status));
      console.error(e);
      return withCors(req, env, json({ error: '서버 오류가 발생했습니다.' }, 500));
    }
  },

  // 매일 밤 21:00 KST: 봇 공지 / 매일 03:17 KST: 만료 코드 정리 + 역할 자동 승급·강등
  async scheduled(controller: ScheduledController, env: Env) {
    if (controller.cron === '0 12 * * *') {
      await ensureAuto(env).catch((e) => console.error('자동 소식 실패', e));
      return dailyPost(env).catch((e) => console.error('매일 공지 실패', e));
    }
    await promoteSweep(env).catch((e) => console.error('역할 자동 승급 실패', e));
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM auth_codes WHERE expires_at < ?').bind(now),
      env.DB.prepare('DELETE FROM oauth_states WHERE expires_at < ?').bind(now),
    ]);
  },
} satisfies ExportedHandler<Env>;
