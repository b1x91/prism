import type { Links } from './api';

/**
 * 모임 소통 창구 기본값. 서버 설정(DISCORD_INVITE_URL·KAKAO_OPENCHAT_URL)이 있으면 그쪽이 우선.
 * 카카오톡 오픈채팅은 아직 없다 → 버튼은 "준비 중"으로 보인다.
 */
export const DEFAULT_LINKS: Links = { discord: 'https://discord.gg/rK3U7xB6WQ', kakao: null };

export const withDefaults = (l?: Partial<Links> | null): Links => ({ discord: l?.discord || DEFAULT_LINKS.discord, kakao: l?.kakao || DEFAULT_LINKS.kakao });
