/**
 * Rust 명령 호출. 앱 안에서는 Tauri invoke, 개발 중 브라우저에서는 dev-bridge(HTTP)를 쓴다.
 * 로그인 토큰은 Rust 에만 있고 화면에는 오지 않는다.
 */
import { invoke } from '@tauri-apps/api/core';
import { withCache, withNet, ApiError, type Api } from '@prism/core';

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const DEV = 'http://127.0.0.1:5199';

async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (inTauri) return invoke<T>(cmd, args);
  const r = await fetch(`${DEV}/${cmd}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw d.error ?? `오류 (${r.status})`;
  return d as T;
}

const err = (e: unknown) => new ApiError(0, typeof e === 'string' ? e : e instanceof Error ? e.message : String(e));

export const bridge = {
  lcuStatus: () => call<{ client: boolean; inGame: boolean }>('lcu_status'),
  discordRunning: () => call<boolean>('discord_running'),
  /** 롤 화면 모드: 0 전체 화면 · 1 창 · 2 테두리 없음, 모르면 null */
  windowMode: () => call<number | null>('window_mode'),
  bringToFront: () => call<null>('bring_to_front'),
  toastGet: () => call<ToastMsg | null>('toast_get'),
  toastClose: () => call<null>('toast_close'),
  lcuGet: <T = any>(path: string) => call<T>('lcu_get', { path }).catch((e) => { throw err(e); }),
  /** 추천 아이템을 롤 아이템 세트로 (내 세트 목록에 'Prism' 세트 하나, v3.92) */
  lcuItemSet: (champion: number, title: string, blocks: { name: string; items: number[] }[]) => call<null>('lcu_item_set', { champion, title, blocks }).catch((e) => { throw err(e); }),
  session: () => call<{ configured: boolean; loggedIn: boolean }>('session'),
  login: () => call<void>('login').catch((e) => { throw err(e); }),
  logout: () => call<void>('logout'),
  openUrl: (url: string) => call<void>('open_url', { url }).catch(() => window.open(url, '_blank')),
  autostart: (enable?: boolean) => call<boolean>('autostart', enable === undefined ? {} : { enable }),
  updateCheck: () => call<UpdateInfo>('update_check').catch((e) => { throw err(e); }),
  updateInstall: () => call<void>('update_install').catch((e) => { throw err(e); }),
  updatePrepare: () => call<UpdateInfo>('update_prepare').catch((e) => { throw err(e); }),
  /** 스토어 판: 스토어의 받기·설치 창 (못 띄우면 스토어의 Prism 페이지). 설치가 시작되면 true */
  storeUpdate: () => call<boolean>('store_update').catch((e) => { throw err(e); }),
  updateApply: (background = false) => call<void>('update_apply', { background }).catch((e) => { throw err(e); }),
  /** 게임 중 라이브 클라이언트 데이터 (게임이 없거나 동의 전이면 실패) */
  liveGame: () => call<unknown>('live_game'),
  visionGet: () => call<VisionState>('vision_get'),
  visionAllow: (allowed: boolean) => call<void>('vision_allow', { allowed }).catch(() => {}),
  visionSet: (enabled: boolean, position: 'right' | 'top') => call<void>('vision_set', { enabled, position }),
  visionTest: () => call<{ ids: number[]; text: string }>('vision_test').catch((e) => { throw err(e); }),
};

export type VisionStage = '' | 'off' | 'wait' | 'no-game' | 'back' | 'capture' | 'reading' | 'found';
export type VisionState = {
  settings: { enabled: boolean; position: 'right' | 'top' };
  report: { engine: 'ok' | 'no-korean' | 'unsupported' | ''; last_text: string; last_ids: number[]; last_at: number; stage?: VisionStage; stage_at?: number; hits?: number; window?: string; read_ms?: number };
};
/** ready: 받아 두어 바로 적용 가능 · managed: Microsoft Store 판(스토어가 업데이트) */
export type UpdateInfo = { current: string; latest: string; available: boolean; notes: string; ready?: boolean; managed?: boolean };

/** 서버 중계 (토큰은 Rust 에만). 화면이 받은 것은 1시간 담아 둔다 (withCache, v3.67) */
// 연결이 끊기면 알린다 (withNet → 연결 안내 화면, v3.122)
export const api: Api = withCache(withNet({
  get: (path) => call('api', { method: 'GET', path }).catch((e) => { throw err(e); }) as any,
  post: (path, body) => call('api', { method: 'POST', path, body: body ?? {} }).catch((e) => { throw err(e); }) as any,
  del: (path) => call('api', { method: 'DELETE', path }).catch((e) => { throw err(e); }) as any,
}));

/** 오른쪽 아래 알림 (Rust toast.rs) */
export type ToastMsg = { title: string; body: string; kind: 'info' | 'ok' | 'busy' | 'warn'; action?: '' | 'apply' | 'open'; at: number };
