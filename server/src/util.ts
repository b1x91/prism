import { can } from './roles.js';

export interface Env {
  DB: D1Database;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_GUILD_ID: string;
  ADMIN_DISCORD_IDS: string; // 쉼표 구분
  PUBLIC_URL: string; // 이 Worker 의 외부 주소 (OAuth redirect_uri 용). 비우면 요청 주소
  DISCORD_INVITE_URL?: string; // 모임 디스코드 초대 주소 (공개)
  VOICE_INVITES?: string; // 음성 채널별 초대 링크 "채널ID=https://discord.gg/xxx,..." (만료 없음으로 만든 것)
  KAKAO_OPENCHAT_URL?: string; // 모임 카카오톡 오픈채팅 주소 (공개)
  WEB_ORIGINS?: string; // 웹 사이트 주소 (쉼표 구분). 예: https://przm.web.app,https://przm.gg
  RELEASE_REPO?: string; // 앱 설치 파일을 올리는 GitHub 저장소 (owner/repo)
  RELEASE_API?: string; // 시험용 GitHub API 주소 (비우면 api.github.com)
  RELEASE_TOKEN?: string; // 저장소가 비공개일 때 Release 를 읽는 GitHub 토큰 (비밀값, 읽기 전용)
  WELCOME_WEBHOOK_URL?: string; // 디스코드 '멤버 환영' 채널 웹훅 (비밀값). 소개를 처음 채우면 소개 카드를 올린다
  DISCORD_BOT_TOKEN?: string; // 디스코드 봇 토큰 (비밀값, GitHub Secrets → deploy-server)
  DISCORD_PUBLIC_KEY?: string; // 슬래시 명령 서명 확인용 공개 키 (공개돼도 되는 값)
  BOT_CHANNEL_ID?: string; // 봇이 글을 올리는 채널 (매일 밤 공지·첫 기록·승급 축하)
  WELCOME_CHANNEL_ID?: string; // 멤버 환영 카드 채널 (비우면 BOT_CHANNEL_ID)
  DEV_LOGIN?: string; // '1' 이면 로컬 개발용 가짜 로그인 허용. 배포 환경에서는 절대 켜지 않는다
}

export type Member = {
  id: string;
  profile_skin: number | null;
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
  discord_roles: string | null; // 로그인 때 받은 디스코드 역할 ID 배열 (JSON)
  discord_refresh: string | null; // 역할을 다시 확인할 때 쓰는 디스코드 refresh token (서버에만)
  roles_at: number | null; // 역할을 마지막으로 확인한 시각
  web_seen_at: number;
  app_seen_at: number;
  app_lol: number;
  app_open: number;
  about: string | null; // 나를 소개해요 (JSON, v3.47)
  about_posted_at: number | null; // 멤버 환영 채널에 소개를 올린 때
  approved_at?: number | null; // 운영진이 승인한 때 (v3.106)
  invited_by?: string | null; // 초대한 회원
  invite_code?: string | null; // 내 초대 링크 번호
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
/** 웹 사이트 주소 목록 (쉼표 구분 vars WEB_ORIGINS). 로그인 후 돌아갈 곳과 CORS 허용에 쓴다 */
export function webOrigins(env: Env): string[] {
  return (env.WEB_ORIGINS ?? '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
}

/** 로그인 후 돌아갈 주소: 앱 루프백 또는 등록된 웹 사이트 */
export function allowedRedirect(url: string, env: Env): boolean {
  if (isLoopback(url)) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? webOrigins(env).includes(u.origin) : webOrigins(env).includes(u.origin) && u.hostname === 'localhost';
  } catch {
    return false;
  }
}

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

/** 회원 얼굴 재료: 대표 스킨 + 주 챔피언 (스킨이 없을 때). 모든 회원 목록 쿼리에 같이 넣는다. a = members 테이블 별칭 */
export const FACE = (a: string) =>
  `${a}.profile_skin AS skin, (SELECT fp.champion_id FROM participants fp WHERE fp.member_id = ${a}.id GROUP BY fp.champion_id ORDER BY COUNT(*) DESC LIMIT 1) AS main`;

/** 내전을 열 수 있는가 (역할 표 roles.ts 의 scrim 단계 이상, 관리자는 늘 가능) */
export function canHostScrim(_env: Env, m: Member) {
  return can(m, 'scrim');
}
