/**
 * 앱을 쓰는 멤버들 (CLAUDE.md v3.84): 멤버 화면 '아카이브' 아래.
 * Prism 기록은 앱을 켠 멤버의 PC 에서 모인다 — 그분들을 소개하고 고마움을 보인다. 멤버가 누가 있는지 궁금할 때 들어오는 곳.
 * 회원 전용. 기록에서 늘 다시 만든다.
 */
import { presenceOf } from '../../packages/core/src/presence.js';
import { cleanAbout } from '../../packages/core/src/about.js';
import type { AppMember } from '../../packages/core/src/api.js';
import { FACE, json, type Env } from './util.js';

export async function appMembers(env: Env): Promise<Response> {
  const now = Date.now();
  const rows = await env.DB.prepare(
    `SELECT m.id, m.nick, ${FACE('m')}, m.about, m.joined_at AS joined, m.web_seen_at AS webAt, m.app_seen_at AS appAt, m.app_lol AS lol, m.app_open AS open,
       (SELECT COUNT(*) FROM matches g WHERE g.collected_by = m.id) AS collected,
       (SELECT COUNT(*) FROM participants p WHERE p.member_id = m.id) AS games,
       (SELECT COUNT(*) FROM participants p WHERE p.member_id = m.id AND p.crew_count >= 2) AS crew
     FROM members m WHERE m.app_seen_at > 0 ORDER BY collected DESC, games DESC LIMIT 60`,
  ).all<any>();
  const list: AppMember[] = rows.results.map((r) => {
    let about = null; try { about = r.about ? cleanAbout(JSON.parse(r.about)) : null; } catch { /* 없음 */ }
    return {
      id: r.id, nick: r.nick, skin: r.skin, main: r.main, about,
      joined: r.joined, collected: r.collected, games: r.games, crew: r.crew,
      presence: presenceOf({ webAt: r.webAt, appAt: r.appAt, lol: Boolean(r.lol), open: Boolean(r.open) }, now),
    };
  });
  return json({ members: list });
}
