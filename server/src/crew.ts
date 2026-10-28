/**
 * Prism 회원 전용 기능. 모든 응답은 회원 데이터이므로 로그인한 회원에게만 준다 (CLAUDE.md 2절 11).
 * 집계는 저장하지 않고 원본에서 계산한다.
 */
import { can, isPending, levelOf, permsOf, rankingGate, ratesOf, topRole } from './roles.js';
import { FACE, HttpError, canHostScrim, json, type Env, type Member } from './util.js';
import { adoptProspect } from './prospects.js';
import { knownFeats, tallyByMember } from './artisans.js';
import { SKIN_TIERS, skinNeed } from '../../packages/core/src/skin-tiers.js';
import skinData from '../../packages/core/data/skins.json';
import { presenceOf } from '../../packages/core/src/presence.js';
import { aboutOf } from './about.js';
import { ITEM } from '../../packages/core/src/data.js';
import { unreadNews } from './news.js';
import { isFinished, type CrewItems } from '../../packages/core/src/build.js';
import { bondOf } from '../../packages/core/src/duo.js';
import type { DuoGame } from '../../packages/core/src/profile.js';
import { stakesOf } from '../../packages/core/src/weekly.js';
import { shortNick } from '../../packages/core/src/text.js';
import { weeklyOf } from './weekly.js';

/** 스킨 등급 (없는 스킨이면 null) */
const skinTier = (id: number): number | null => (skinData.skins as unknown as Record<string, [string, number, string, string]>)[id]?.[1] ?? null;

const TIP_MAX = 120;
const MIN_PAIR_GAMES = 3;
const MIN_WINRATE_GAMES = 10;

type NW = { n: number; w: number };

// ───────── 내 정보 ─────────

export async function getMe(env: Env, me: Member) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(win), 0) AS w FROM participants WHERE member_id = ?').bind(me.id).first<NW>();
  const gate = await rankingGate(env, me);
  const newsUnread = await unreadNews(env, me);
  return json({
    newsUnread,
    id: me.id,
    nick: me.nick,
    tier: me.tier,
    riotId: me.riot_id,
    linked: Boolean(me.riot_puuid),
    consent: Boolean(me.opt_in_at),
    games: row ?? { n: 0, w: 0 },
    skin: me.profile_skin,
    canScrim: canHostScrim(env, me),
    role: topRole(me),
    pending: isPending(me),
    perms: { ...permsOf(me), ranking: gate.open },
    rankingGate: { have: gate.have, need: gate.need },
    level: Math.min(levelOf(me), 5),
    rates: ratesOf(me),
    rolesKnown: me.roles_at !== null || me.discord_roles !== null,
    presence: presenceOf({ webAt: me.web_seen_at, appAt: me.app_seen_at, lol: Boolean(me.app_lol), open: Boolean(me.app_open) }),
    about: aboutOf(me),
  });
}

/** 접속 알림 (앱·웹이 60초마다). 앱은 롤 켜짐·창 떠 있음도 함께 */
export async function setPresence(env: Env, me: Member, body: { via?: unknown; lol?: unknown; open?: unknown; phase?: unknown; champ?: unknown }) {
  const now = Date.now();
  if (body.via === 'app') {
    // 롤 단계·챔프 (멤버 근황 '지금', v3.74). 단계가 바뀔 때만 시작 시각을 새로
    const phase = body.lol && ['lobby', 'select', 'game'].includes(String(body.phase)) ? String(body.phase) : '';
    const champ = Number.isInteger(body.champ) && (body.champ as number) > 0 ? (body.champ as number) : 0;
    await env.DB.prepare(`UPDATE members SET app_seen_at = ?1, app_lol = ?2, app_open = ?3, app_champ = ?5,
        app_phase_at = CASE WHEN app_phase = ?4 THEN app_phase_at ELSE ?1 END, app_phase = ?4,
        app_first_at = CASE WHEN app_first_at = 0 THEN ?1 ELSE app_first_at END WHERE id = ?6`)
      .bind(now, body.lol ? 1 : 0, body.open ? 1 : 0, phase, champ, me.id).run();
    Object.assign(me, { app_first_at: me.app_first_at || now, app_seen_at: now, app_lol: body.lol ? 1 : 0, app_open: body.open ? 1 : 0 });
  } else if (body.via === 'app-quit') {
    await env.DB.prepare("UPDATE members SET app_seen_at = 0, app_lol = 0, app_open = 0, app_phase = '' WHERE id = ?").bind(me.id).run();
    Object.assign(me, { app_seen_at: 0, app_lol: 0, app_open: 0 });
  } else {
    await env.DB.prepare('UPDATE members SET web_seen_at = ? WHERE id = ?').bind(now, me.id).run();
    me.web_seen_at = now;
  }
  // 안 읽은 소식 수도 함께 — 앱·웹이 1분마다 알릴 때 메뉴의 빨간 점을 맞춘다
  return json({ presence: presenceOf({ webAt: me.web_seen_at, appAt: me.app_seen_at, lol: Boolean(me.app_lol), open: Boolean(me.app_open) }, now), newsUnread: await unreadNews(env, me) });
}

/** 내 판 목록 (최근 100판). 웹·앱의 "내 기록" 화면용. 본인 것만 */
export async function myGames(env: Env, me: Member) {
  const r = await env.DB.prepare(
    `SELECT p.game_id AS gameId, p.played_at AS playedAt, m.duration AS duration, p.champion_id AS championId, p.win, p.kills, p.deaths, p.assists,
            p.dmg_champ AS damageToChampions, p.dmg_taken AS damageTaken, p.gold AS goldEarned, p.items, p.augments, m.queue_id AS queueId
     FROM participants p JOIN matches m ON m.game_id = p.game_id WHERE p.member_id = ? ORDER BY p.played_at DESC LIMIT 100`,
  )
    .bind(me.id)
    .all();
  const games = r.results.map((g: any) => ({ ...g, win: g.win === 1, custom: g.queueId !== 2400, items: g.items ? JSON.parse(g.items) : [], augments: g.augments ? JSON.parse(g.augments) : [] }));
  return json({ games });
}

/**
 * 도감: Prism 에 기록된 내 모든 판으로 만난 챔피언·고른 증강 (처음 만난 날 포함).
 * 판 목록(최근 100판)과 달리 개수 제한 없이 집계만 보낸다.
 */
export async function myDex(env: Env, me: Member) {
  return json(await dexRows(env, me.id));
}

/** 한 회원의 도감 재료 (도감 화면·피스 계산·공개 링크가 같이 쓴다) */
export async function dexRows(env: Env, id: string) {
  const me = { id };
  const [champs, augs, pairs, feats] = await env.DB.batch([
    env.DB.prepare('SELECT champion_id AS id, COUNT(*) AS n, SUM(win) AS w, MIN(played_at) AS first, MAX(played_at) AS last FROM participants WHERE member_id = ? GROUP BY champion_id').bind(me.id),
    env.DB.prepare(
      `SELECT CAST(j.value AS INTEGER) AS id, COUNT(*) AS n, SUM(p.win) AS w, MIN(p.played_at) AS first, MAX(p.played_at) AS last
       FROM participants p, json_each(p.augments) j WHERE p.member_id = ? AND p.augments IS NOT NULL GROUP BY 1`,
    ).bind(me.id),
    env.DB.prepare(
      `SELECT CAST(j.value AS INTEGER) AS aug, p.champion_id AS champ, COUNT(*) AS n, SUM(p.win) AS w
       FROM participants p, json_each(p.augments) j WHERE p.member_id = ? AND p.augments IS NOT NULL GROUP BY 1, 2`,
    ).bind(me.id),
    env.DB.prepare('SELECT member_id, champion_id AS championId, win, kills, deaths, feats FROM participants WHERE member_id = ? AND feats IS NOT NULL').bind(me.id),
  ]);
  const known = await knownFeats(env);
  const challenges = tallyByMember(feats.results as Parameters<typeof tallyByMember>[0], known).get(me.id) ?? { counts: {}, known };
  return { champions: champs.results, augments: augs.results, pairs: pairs.results, challenges } as unknown as import('../../packages/core/src/history.js').DexRows;
}

/** 앱이 로그인된 롤 계정을 연결한다. 클라이언트에 로그인된 계정이라 아이콘 인증을 대신한다 */
export async function linkRiot(req: Request, env: Env, me: Member) {
  const { puuid, riotId } = (await req.json().catch(() => ({}))) as { puuid?: string; riotId?: string };
  if (!puuid || typeof puuid !== 'string') throw new HttpError(400, 'puuid 가 없습니다.');
  const owner = await env.DB.prepare('SELECT id FROM members WHERE riot_puuid = ?').bind(puuid).first<{ id: string }>();
  if (owner && owner.id !== me.id) throw new HttpError(409, '이 롤 계정은 이미 다른 회원에게 연결되어 있습니다.');
  const rid = typeof riotId === 'string' && riotId.includes('#') ? riotId.trim().slice(0, 40) : null;
  // 표시 이름 = 롤 계정 이름 (이름#태그)
  await env.DB.prepare('UPDATE members SET riot_puuid = ?1, riot_id = ?2, nick = COALESCE(?3, nick) WHERE id = ?4').bind(puuid, rid, rid, me.id).run();
  return json({ ok: true });
}

export async function setConsent(req: Request, env: Env, me: Member) {
  const { agree } = (await req.json().catch(() => ({}))) as { agree?: boolean };
  await env.DB.prepare('UPDATE members SET opt_in_at = ? WHERE id = ?').bind(agree === true ? Date.now() : null, me.id).run();
  // 함께한 친구들였다면 그동안 함께한 판을 내 기록으로 (v3.10)
  if (agree === true && me.riot_puuid) await adoptProspect(env, me.id, me.riot_puuid);
  return json({ ok: true, consent: agree === true });
}

export async function setProfile(req: Request, env: Env, me: Member) {
  // 이름은 바꿀 수 없다: 롤 계정 이름(이름#태그)을 따라간다 (v3.35). 소개·대표 스킨만
  const { intro, skin } = (await req.json().catch(() => ({}))) as { intro?: string; skin?: number | null };
  const i = typeof intro === 'string' ? intro.trim().slice(0, 60) : me.intro;
  let s = me.profile_skin;
  if (skin === null) s = null;
  else if (skin !== undefined) {
    if (!Number.isInteger(skin)) throw new HttpError(400, '스킨이 올바르지 않습니다.');
    const tier = skinTier(skin);
    if (tier === null) throw new HttpError(400, '없는 스킨입니다.');
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM participants WHERE member_id = ?').bind(me.id).first<{ n: number }>();
    const need = skinNeed(tier);
    if ((row?.n ?? 0) < need) throw new HttpError(403, `${SKIN_TIERS[tier].name} 스킨은 ${need}판부터 쓸 수 있어요.`);
    s = skin;
  }
  await env.DB.prepare('UPDATE members SET intro = ?, profile_skin = ? WHERE id = ?').bind(i, s, me.id).run();
  return json({ ok: true });
}

/** 앱이 대신 수집할 회원 목록 (동의 + 계정 연결된 회원만) */
export async function crewTargets(env: Env) {
  const { results } = await env.DB.prepare('SELECT riot_puuid AS puuid, last_played_at AS lastPlayedAt FROM members WHERE opt_in_at IS NOT NULL AND riot_puuid IS NOT NULL').all();
  return json({ targets: results });
}

// ───────── 챔피언 단위 ─────────

/** 신발 (완성 신발 6종) */
const BOOTS = new Set([3006, 3009, 3020, 3047, 3111, 3158]);

/**
 * 아이템 추천의 사실 쪽 (v3.88): 기록된 판(10명 전체, matches.players)에서 이 챔프가 끝에 갖고 있던 완성 아이템·신발.
 * 판수가 적으면 화면이 역할 기본 빌드를 쓴다 (buildFor). 외부 통계는 쓰지 않는다.
 */
async function crewItems(env: Env, championIds: number[]): Promise<Map<number, CrewItems>> {
  const ids = [...new Set(championIds)].filter((x) => Number.isInteger(x) && x > 0).slice(0, 16);
  const out = new Map<number, CrewItems>();
  if (!ids.length) return out;
  const rows = await env.DB.prepare(
    `SELECT json_extract(j.value, '$.championId') AS c, json_extract(j.value, '$.items') AS items, json_extract(j.value, '$.win') AS win
     FROM matches m, json_each(m.players) j
     WHERE m.players IS NOT NULL AND json_extract(j.value, '$.championId') IN (${ids.map(() => '?').join(',')})
     ORDER BY m.played_at DESC LIMIT 3000`,
  ).bind(...ids).all<{ c: number; items: string | null; win: number | boolean }>().catch(() => ({ results: [] as { c: number; items: string | null; win: number | boolean }[] }));
  const acc = new Map<number, { games: number; items: Map<number, { n: number; w: number }>; boots: Map<number, { n: number; w: number }> }>();
  for (const r of rows.results) {
    let list: number[] = [];
    try { list = JSON.parse(r.items ?? '[]'); } catch { /* 빈 기록 */ }
    if (!Array.isArray(list) || !list.length) continue;
    const a = acc.get(Number(r.c)) ?? { games: 0, items: new Map(), boots: new Map() };
    acc.set(Number(r.c), a);
    if (a.games >= 400) continue; // 챔프마다 최근 400판까지
    a.games++;
    const win = r.win === true || r.win === 1 ? 1 : 0;
    for (const id of new Set(list.map(Number))) {
      const box = BOOTS.has(id) ? a.boots : isFinished(id) && ITEM[id] ? a.items : null;
      if (!box) continue;
      const x = box.get(id) ?? { n: 0, w: 0 };
      x.n++; x.w += win; box.set(id, x);
    }
  }
  const top = (m: Map<number, { n: number; w: number }>, k: number) => [...m].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.n - a.n || b.w - a.w).slice(0, k);
  for (const id of ids) { const a = acc.get(id); out.set(id, { games: a?.games ?? 0, items: a ? top(a.items, 8) : [], boots: a ? top(a.boots, 2) : [] }); }
  return out;
}

async function championInfo(env: Env, me: Member, championId: number, tipLimit: number, items?: CrewItems) {
  const [crew, mine, augs, masters, tips] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(win), 0) AS w FROM participants WHERE champion_id = ?').bind(championId),
    env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(win), 0) AS w FROM participants WHERE champion_id = ? AND member_id = ?').bind(championId, me.id),
    env.DB.prepare(
      `SELECT augment_id AS id, COUNT(*) AS n, SUM(win) AS w FROM participant_augments WHERE champion_id = ?
       GROUP BY augment_id HAVING n >= 2 ORDER BY n DESC, w DESC LIMIT 6`,
    ).bind(championId),
    env.DB.prepare(
      `SELECT m.id, m.nick, m.profile_skin AS skin, COUNT(*) AS n, SUM(p.win) AS w FROM participants p JOIN members m ON m.id = p.member_id
       WHERE p.champion_id = ? GROUP BY m.id ORDER BY n DESC, w DESC LIMIT 3`,
    ).bind(championId),
    env.DB.prepare(
      `SELECT t.id, t.augment_id AS augmentId, t.text, t.created_at AS createdAt, m.id AS memberId, m.nick, ${FACE('m')}, t.member_id = ?2 AS mine,
         (SELECT COUNT(*) FROM tip_likes l WHERE l.tip_id = t.id) AS likes,
         EXISTS (SELECT 1 FROM tip_likes l WHERE l.tip_id = t.id AND l.member_id = ?2) AS liked
       FROM tips t JOIN members m ON m.id = t.member_id
       WHERE t.champion_id = ?1 AND t.deleted_at IS NULL ORDER BY likes DESC, t.created_at DESC LIMIT ?3`,
    ).bind(championId, me.id, tipLimit),
  ]);
  return {
    crew: crew.results[0] as NW,
    me: mine.results[0] as NW,
    items: items ?? (await crewItems(env, [championId])).get(championId),
    topAugments: augs.results,
    masters: masters.results,
    tips: tips.results,
  };
}

/** 챔프 선택 화면용: 여러 챔피언 + 같은 팀 회원 케미를 한 번에 */
export async function champSelect(req: Request, env: Env, me: Member) {
  const { championIds, teammatePuuids } = (await req.json().catch(() => ({}))) as { championIds?: unknown; teammatePuuids?: unknown };
  const champs = (Array.isArray(championIds) ? championIds : []).filter((x): x is number => Number.isInteger(x) && x > 0).slice(0, 16);
  const mates = (Array.isArray(teammatePuuids) ? teammatePuuids : []).filter((x): x is string => typeof x === 'string').slice(0, 4);

  const champions: Record<number, unknown> = {};
  const items = await crewItems(env, champs);
  for (const id of new Set(champs)) champions[id] = await championInfo(env, me, id, 3, items.get(id));

  const teammates = [];
  for (const puuid of mates) {
    // 수집에 동의한 회원만 Prism 회원으로 표시한다
    const m = await env.DB.prepare(`SELECT m.id, m.nick, ${FACE('m')} FROM members m WHERE m.riot_puuid = ? AND m.opt_in_at IS NOT NULL`).bind(puuid).first<{ id: string; nick: string; skin: number | null; main: number | null }>();
    if (!m || m.id === me.id) continue;
    // 함께한 판(같은 팀) · 그 회원의 최근 판 (지금 이어지는 연승)
    const [tg, rec] = await env.DB.batch([
      env.DB.prepare(
        `SELECT a.played_at AS t, a.win AS w FROM participants a JOIN participants b
         ON a.game_id = b.game_id AND a.team_id = b.team_id WHERE a.member_id = ? AND b.member_id = ?`,
      ).bind(me.id, m.id),
      env.DB.prepare('SELECT win AS w FROM participants WHERE member_id = ? ORDER BY played_at DESC LIMIT 30').bind(m.id),
    ]);
    const T = tg.results as { t: number; w: number }[];
    const R = rec.results as { w: number }[];
    const streak = R.findIndex((x) => !x.w);
    const bond = bondOf(T.map((x) => ({ t: x.t, w: x.w ? 1 : 0 }) as DuoGame));
    teammates.push({
      puuid, id: m.id, nick: m.nick, skin: m.skin, main: m.main,
      together: { n: T.length, w: T.filter((x) => x.w).length },
      bond: { grade: bond.grade, name: bond.name },
      streak: streak < 0 ? R.length : streak,
    });
  }
  // 이번 판에 걸린 것 (이번 주 도전, v3.90)
  const weekly = await weeklyOf(env, me);
  const stakes = stakesOf(weekly, teammates.map((t) => ({ id: t.id, nick: shortNick(t.nick) })));
  return json({ champions, teammates, stakes });
}

/**
 * 아수라장 증강 실전 통계 (회원 전용). 회원이 실제로 고른 증강의 판수·승률.
 * championId 가 있으면 그 챔피언으로 고른 것만 따로 준다. 원본에서 매번 계산한다 (저장하지 않음).
 */
export async function augmentStats(env: Env, championId: number | null) {
  const [games, overall, champ] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(DISTINCT game_id) AS n FROM participant_augments'),
    env.DB.prepare('SELECT augment_id AS id, COUNT(*) AS n, SUM(win) AS w FROM participant_augments GROUP BY augment_id'),
    env.DB.prepare('SELECT augment_id AS id, COUNT(*) AS n, SUM(win) AS w FROM participant_augments WHERE champion_id = ? GROUP BY augment_id').bind(championId ?? 0),
  ]);
  return json({ games: (games.results[0] as { n: number }).n, overall: overall.results, champion: championId ? champ.results : [] });
}

export async function getChampion(env: Env, me: Member, championId: number) {
  return json(await championInfo(env, me, championId, 50));
}

// ───────── 팁 ─────────

export async function addTip(req: Request, env: Env, me: Member) {
  const { championId, augmentId, text } = (await req.json().catch(() => ({}))) as { championId?: number; augmentId?: number; text?: string };
  if (!Number.isInteger(championId) || championId! <= 0) throw new HttpError(400, '챔프가 없습니다.');
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) throw new HttpError(400, '내용을 입력해주세요.');
  if (t.length > TIP_MAX) throw new HttpError(400, `${TIP_MAX}자까지 쓸 수 있습니다.`);
  const aug = Number.isInteger(augmentId) && augmentId! > 0 ? augmentId! : null;
  const r = await env.DB.prepare('INSERT INTO tips (member_id, champion_id, augment_id, text, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(me.id, championId, aug, t, Date.now())
    .first<{ id: number }>();
  return json({ id: r?.id });
}

export async function toggleLike(env: Env, me: Member, tipId: number) {
  const del = await env.DB.prepare('DELETE FROM tip_likes WHERE tip_id = ? AND member_id = ?').bind(tipId, me.id).run();
  if (del.meta.changes === 0) {
    const exists = await env.DB.prepare('SELECT 1 FROM tips WHERE id = ? AND deleted_at IS NULL').bind(tipId).first();
    if (!exists) throw new HttpError(404, '팁이 없습니다.');
    await env.DB.prepare('INSERT INTO tip_likes (tip_id, member_id) VALUES (?, ?)').bind(tipId, me.id).run();
    return json({ liked: true });
  }
  return json({ liked: false });
}

export async function deleteTip(env: Env, me: Member, tipId: number) {
  const r = await env.DB.prepare('UPDATE tips SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL AND (member_id = ? OR ? = 1)')
    .bind(Date.now(), tipId, me.id, can(me, 'moderate') ? 1 : 0)
    .run();
  if (r.meta.changes === 0) throw new HttpError(404, '지울 수 있는 팁이 없습니다.');
  return json({ ok: true });
}

// ───────── 모임 보드 ─────────

export async function board(env: Env, me: Member) {
  // KST 이번 달 1일 0시
  const KST = 9 * 3_600_000;
  const kstNow = new Date(Date.now() + KST);
  const monthStart = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), 1) - KST;
  const weekAgo = Date.now() - 7 * 86_400_000;

  const [totals, maxKills, longest, monthly, dex, winrate, pairs, recent, crewDex, newTips] = await env.DB.batch([
    env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM members WHERE riot_puuid IS NOT NULL AND opt_in_at IS NOT NULL) AS linked,
              (SELECT COUNT(*) FROM matches) AS games,
              (SELECT COUNT(*) FROM matches WHERE crew_count >= 2) AS crewGames,
              (SELECT COUNT(*) FROM matches WHERE crew_count >= 2 AND played_at >= ?) AS crewGamesWeek`,
    ).bind(weekAgo),
    env.DB.prepare(
      `SELECT m.nick, p.kills AS value, p.champion_id AS championId, p.played_at AS at FROM participants p JOIN members m ON m.id = p.member_id
       ORDER BY p.kills DESC, p.played_at ASC LIMIT 1`,
    ),
    env.DB.prepare(
      `SELECT m.nick, x.duration AS value, p.champion_id AS championId, x.played_at AS at FROM participants p
       JOIN matches x ON x.game_id = p.game_id JOIN members m ON m.id = p.member_id ORDER BY x.duration DESC, x.played_at ASC LIMIT 1`,
    ),
    env.DB.prepare(
      `SELECT m.nick, COUNT(*) AS value FROM participants p JOIN members m ON m.id = p.member_id WHERE p.played_at >= ?
       GROUP BY m.id ORDER BY value DESC LIMIT 1`,
    ).bind(monthStart),
    env.DB.prepare(
      `SELECT m.nick, COUNT(DISTINCT p.champion_id) AS value FROM participants p JOIN members m ON m.id = p.member_id
       GROUP BY m.id ORDER BY value DESC LIMIT 1`,
    ),
    env.DB.prepare(
      `SELECT m.nick, COUNT(*) AS n, SUM(p.win) AS w FROM participants p JOIN members m ON m.id = p.member_id
       GROUP BY m.id HAVING n >= ? ORDER BY CAST(w AS REAL) / n DESC, n DESC LIMIT 1`,
    ).bind(MIN_WINRATE_GAMES),
    env.DB.prepare(
      `SELECT ma.nick AS a, mb.nick AS b, ma.profile_skin AS sa, mb.profile_skin AS sb, COUNT(*) AS n, SUM(pa.win) AS w FROM participants pa
       JOIN participants pb ON pa.game_id = pb.game_id AND pa.team_id = pb.team_id AND pa.member_id < pb.member_id
       JOIN members ma ON ma.id = pa.member_id JOIN members mb ON mb.id = pb.member_id
       GROUP BY pa.member_id, pb.member_id HAVING n >= ? ORDER BY CAST(w AS REAL) / n DESC, n DESC LIMIT 5`,
    ).bind(MIN_PAIR_GAMES),
    env.DB.prepare(
      `SELECT x.game_id AS gameId, x.played_at AS at, x.duration,
         json_group_array(json_object('nick', m.nick, 'championId', p.champion_id, 'win', p.win, 'k', p.kills, 'd', p.deaths, 'a', p.assists)) AS crew
       FROM matches x JOIN participants p ON p.game_id = x.game_id JOIN members m ON m.id = p.member_id
       WHERE x.crew_count >= 2 GROUP BY x.game_id ORDER BY x.played_at DESC LIMIT 10`,
    ),
    env.DB.prepare('SELECT COUNT(DISTINCT champion_id) AS n FROM participants'),
    env.DB.prepare(
      `SELECT t.id, t.champion_id AS championId, t.augment_id AS augmentId, t.text, m.nick, t.created_at AS createdAt
       FROM tips t JOIN members m ON m.id = t.member_id WHERE t.deleted_at IS NULL ORDER BY t.created_at DESC LIMIT 5`,
    ),
  ]);

  const one = (r: D1Result) => r.results[0] ?? null;
  return json({
    totals: one(totals),
    records: [
      { key: 'max_kills', label: '한 판 최다 킬', ...(one(maxKills) ?? {}) },
      { key: 'longest_game', label: '가장 긴 판', ...(one(longest) ?? {}) },
      { key: 'most_played_month', label: '이달 최다 출전', ...(one(monthly) ?? {}) },
      { key: 'dex_rank', label: '도감 1위', ...(one(dex) ?? {}) },
      { key: 'best_winrate', label: `최고 승률 (${MIN_WINRATE_GAMES}판 이상)`, ...(one(winrate) ?? {}) },
    ],
    pairs: pairs.results,
    recent: recent.results.map((r: any) => ({ ...r, crew: JSON.parse(r.crew) })),
    crewDex: (one(crewDex) as { n: number } | null)?.n ?? 0,
    newTips: newTips.results,
    me: { nick: me.nick },
  });
}

/**
 * 한 판 상세: 그 판의 기록(시간·팀 합계)과 10명 전체(matches.players, v3.44). 함께한 Prism 회원은 팀+챔프로 맞춰 얼굴을 붙인다.
 * 10명 기록이 없는 예전 판은 회원 것만 (앱이 다시 보내면 채워진다).
 */
export async function gameDetail(env: Env, gameId: number) {
  const m = await env.DB.prepare('SELECT game_id AS gameId, queue_id AS queueId, played_at AS playedAt, duration, team_totals AS teamTotals, players FROM matches WHERE game_id = ?')
    .bind(gameId).first<{ gameId: number; queueId: number; playedAt: number; duration: number; teamTotals: string; players: string | null }>();
  if (!m) throw new HttpError(404, '기록되지 않은 판입니다.');
  const { results } = await env.DB.prepare(
    `SELECT p.member_id AS memberId, m.nick, ${FACE('m')}, p.champion_id AS championId, p.team_id AS teamId, p.win, p.kills, p.deaths, p.assists,
            p.dmg_champ AS damageToChampions, p.dmg_taken AS damageTaken, p.gold AS goldEarned, p.items, p.augments
     FROM participants p JOIN members m ON m.id = p.member_id WHERE p.game_id = ?`,
  ).bind(gameId).all<any>();
  let totals: Record<string, { win?: boolean; kills?: number; champions?: number[] }> = {};
  try { totals = JSON.parse(m.teamTotals || '{}'); } catch { /* 옛 기록 */ }
  const members = results.map((r) => ({ ...r, win: r.win === 1, name: r.nick, items: r.items ? JSON.parse(r.items) : [], augments: r.augments ? JSON.parse(r.augments) : [] }));
  let all: any[] | null = null;
  try { all = m.players ? JSON.parse(m.players) : null; } catch { /* 깨진 기록 */ }
  // 10명 기록이 있으면 그것을 쓰고, 회원은 같은 팀+챔프(한 판에 한 명뿐)로 맞춰 얼굴·이름을 붙인다
  const key = (p: { teamId: number; championId: number }) => `${p.teamId}:${p.championId}`;
  const byKey = new Map(members.map((p) => [key(p), p]));
  const players = Array.isArray(all) && all.length >= 10
    ? all.map((p) => { const mm = byKey.get(key(p)); const name = typeof p.name === 'string' ? p.name.split('#')[0] : null; return mm ? { ...p, ...mm } : { ...p, name }; })
    : members;
  return json({
    gameId: m.gameId, playedAt: m.playedAt, duration: m.duration, custom: m.queueId !== 2400, full: players.length >= 10,
    teams: Object.fromEntries(Object.entries(totals).map(([t, v]) => [t, { win: Boolean(v.win), kills: v.kills ?? null, champions: Array.isArray(v.champions) ? v.champions : null }])),
    players,
  });
}
