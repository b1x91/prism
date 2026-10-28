/**
 * #PRSM 태그 보상 (CLAUDE.md v3.116). 롤 닉네임 태그가 #PRSM 인 회원에게 한 번만 5,000 피스 (배율 밖 고정값).
 * 롤 계정을 연결할 때·판이 기록될 때·상점/내 정보를 열 때 확인하고, 처음 확정되면 봇이 채널에 축하한다.
 * 확정 기록(tag_rewards)이 남으므로 나중에 태그를 바꿔도 줄지 않는다.
 */
import type { Env } from './util.js';
import { TAG_BONUS, hasPrismTag } from '../../packages/core/src/shop.js';
import { sendToChannel } from './bot.js';

export async function checkTagBonus(env: Env, memberId: string, riotId: string | null | undefined) {
  if (!hasPrismTag(riotId)) return false;
  const r = await env.DB.prepare('INSERT OR IGNORE INTO tag_rewards (member_id, riot_id, at) VALUES (?, ?, ?)').bind(memberId, riotId, Date.now()).run().catch(() => null);
  if (!r?.meta?.changes) return false;
  if (env.BOT_CHANNEL_ID && env.DISCORD_BOT_TOKEN) {
    await sendToChannel(env, env.BOT_CHANNEL_ID, {
      content: `💎 <@${memberId}> 님이 롤 닉네임 태그를 **#${TAG_BONUS.tag}** 로 바꾸셨어요! **${TAG_BONUS.pieces.toLocaleString('ko-KR')} 피스**를 드렸어요.`,
      allowed_mentions: { users: [memberId] },
    }).catch(() => false);
  }
  return true;
}
