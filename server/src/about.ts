/**
 * 나를 소개해요 (CLAUDE.md v3.47). 온보딩에서 받은 소개(좋아하는 역할·자주 접속하는 요일·시간대·MBTI)를 저장하고,
 * 처음 채운 한 번만 디스코드에 소개 카드를 올린다 (봇이 있으면 봇이 WELCOME_CHANNEL_ID 에, 없으면 채널 웹훅 WELCOME_WEBHOOK_URL).
 * 웹훅이 없거나 실패하면 저장만 하고, 다음에 다시 저장할 때 한 번 더 시도한다.
 */
import { aboutWhen, cleanAbout, type About } from '../../packages/core/src/about.js';
import { CHAMPIONS } from '../../packages/core/src/data.js';
import { ROLE_KO } from '../../packages/core/src/text.js';
import skinData from '../../packages/core/data/skins.json';
import { botReady, sendToChannel } from './bot.js';
import { HttpError, json, type Env, type Member } from './util.js';

const CDRAGON = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/';
const SKINS = skinData.skins as unknown as Record<string, [string, number, string, string]>;

export function aboutOf(m: Member): About | null {
  try { return m.about ? cleanAbout(JSON.parse(m.about)) : null; } catch { return null; }
}

export async function saveAbout(req: Request, env: Env, me: Member) {
  const body = (await req.json().catch(() => ({}))) as { about?: unknown };
  const about = cleanAbout(body.about);
  if (!about) throw new HttpError(400, '역할·요일·시간대·MBTI 를 모두 골라 주세요.');
  await env.DB.prepare('UPDATE members SET about = ? WHERE id = ?').bind(JSON.stringify(about), me.id).run();
  let posted = Boolean(me.about_posted_at);
  if (!posted && (botReady(env) || env.WELCOME_WEBHOOK_URL)) {
    posted = await postWelcome(env, me, about).catch(() => false);
    if (posted) await env.DB.prepare('UPDATE members SET about_posted_at = ? WHERE id = ?').bind(Date.now(), me.id).run();
  }
  return json({ about, posted });
}

/** 멤버 환영 카드: 회원 멘션 + 최애 챔프(대표 스킨) 그림 + 역할·접속·MBTI. 봇이 있으면 봇이, 없으면 채널 웹훅으로 */
async function postWelcome(env: Env, me: Member, a: About): Promise<boolean> {
  const name = me.nick.split('#')[0];
  const skin = me.profile_skin ? SKINS[String(me.profile_skin)] : undefined;
  const champ = me.profile_skin ? CHAMPIONS[Math.floor(me.profile_skin / 1000)] : undefined;
  const img = (p?: string) => (p ? CDRAGON + p.toLowerCase() : undefined);
  const payload = {
    username: 'Prism',
    content: `<@${me.id}> 님, Prism 에 오신 걸 환영해요! 💎`,
    allowed_mentions: { users: [me.id] },
    embeds: [{
      color: 0x7c9cff,
      title: `${name} 님을 소개해요`,
      image: skin ? { url: img(skin[3]) } : undefined,
      fields: [
        { name: '최애 챔프', value: champ?.name ?? '–', inline: true },
        { name: 'MBTI', value: a.mbti, inline: true },
        { name: '좋아하는 역할', value: a.roles.map((r) => ROLE_KO[r] ?? r).join(' · '), inline: false },
        { name: '주로 접속', value: aboutWhen(a), inline: false },
      ],
      footer: { text: '같이 한 판 하실 분은 음성 채널로! · przm.web.app' },
    }],
  };
  if (botReady(env)) return sendToChannel(env, env.WELCOME_CHANNEL_ID || env.BOT_CHANNEL_ID!, { ...payload, username: undefined });
  const r = await fetch(env.WELCOME_WEBHOOK_URL!, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
  return r.ok;
}
