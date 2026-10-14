/**
 * 접속 상태 점 하나: 웹 / 앱 / 게임 / 앱+게임.
 * 게임(롤 켜짐)은 앱만 알 수 있다. 그래서 '게임' = 롤은 켜져 있고 앱은 창을 닫아 트레이에서 돌고 있을 때,
 * '앱+게임' = 앱 창을 띄워 둔 채 롤도 켜져 있을 때. 트레이에서 롤 없이 돌기만 하는 앱은 접속으로 치지 않는다.
 */
export type Presence = 'off' | 'web' | 'app' | 'game' | 'both';

export const PRESENCE_TTL = 150_000; // 앱·웹은 60초마다 알린다. 2분 반 소식이 없으면 나간 것으로

export const PRESENCE_LABEL: Record<Presence, string> = {
  off: '접속 안 함',
  web: '웹 접속',
  app: '앱 접속',
  game: '게임 접속',
  both: '앱 + 게임 접속',
};

export type PresenceRaw = { webAt: number; appAt: number; lol: boolean; open: boolean };

export function presenceOf(p: PresenceRaw, now = Date.now()): Presence {
  const app = now - p.appAt < PRESENCE_TTL;
  const web = now - p.webAt < PRESENCE_TTL;
  if (app && p.lol) return p.open ? 'both' : 'game';
  if (app && p.open) return 'app';
  if (web) return 'web';
  return 'off';
}
