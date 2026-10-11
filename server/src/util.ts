export interface Env {
  DB: D1Database;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_GUILD_ID: string;
  ADMIN_DISCORD_IDS: string; // 쉼표 구분
  PUBLIC_URL: string; // 이 Worker 의 외부 주소 (OAuth redirect_uri 용)
  DISCORD_INVITE_URL?: string; // 모임 디스코드 초대 주소 (공개)
  KAKAO_OPENCHAT_URL?: string; // 모임 카카오톡 오픈채팅 주소 (공개)
  DEV_LOGIN?: string; // '1' 이면 로컬 개발용 가짜 로그인 허용. 배포 환경에서는 절대 켜지 않는다
}

export type Member = {
  id: string;
  discord_name: string;
  discord_avatar: string | null;
  nick: string;
  intro: string;
  tier: 'guest' | 'member' | 'admin';
  riot_puuid: string | null;
  riot_id: string | null;
  opt_in_at: number | null;
  joined_at: number;
  last_seen_at: number;
  last_played_at: number | null;
};

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, '본문이 JSON 이 아닙니다.');
  }
}

export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** 앱이 로컬에서 받는 콜백만 허용한다 (127.0.0.1 / localhost) */
export function isLoopback(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
  } catch {
    return false;
  }
}

export const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);
export const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
