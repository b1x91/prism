/**
 * Rust 명령 호출. 앱 안에서는 Tauri invoke, 개발 중 브라우저에서는 dev-bridge(HTTP)를 쓴다.
 * 로그인 토큰은 Rust 에만 있고 화면에는 오지 않는다.
 */
import { invoke } from '@tauri-apps/api/core';
import { ApiError, type Api } from '@prism/core';

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
  lcuGet: <T = any>(path: string) => call<T>('lcu_get', { path }).catch((e) => { throw err(e); }),
  session: () => call<{ configured: boolean; loggedIn: boolean }>('session'),
  login: () => call<void>('login').catch((e) => { throw err(e); }),
  logout: () => call<void>('logout'),
  openUrl: (url: string) => call<void>('open_url', { url }).catch(() => window.open(url, '_blank')),
  autostart: (enable?: boolean) => call<boolean>('autostart', enable === undefined ? {} : { enable }),
  updateCheck: () => call<UpdateInfo>('update_check').catch((e) => { throw err(e); }),
  updateInstall: () => call<void>('update_install').catch((e) => { throw err(e); }),
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
export type UpdateInfo = { current: string; latest: string; available: boolean; notes: string };

export const api: Api = {
  get: (path) => call('api', { method: 'GET', path }).catch((e) => { throw err(e); }) as any,
  post: (path, body) => call('api', { method: 'POST', path, body: body ?? {} }).catch((e) => { throw err(e); }) as any,
  del: (path) => call('api', { method: 'DELETE', path }).catch((e) => { throw err(e); }) as any,
};
