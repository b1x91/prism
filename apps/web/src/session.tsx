/**
 * 웹 로그인 상태와 서버 호출.
 * 디스코드 로그인 → 서버가 1회용 code 와 함께 /auth/done 으로 돌려보냄 → 토큰으로 교환 → 이 브라우저에 저장.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, type Api, type Links, type Me } from '@prism/core';

export const SERVER = (import.meta.env.VITE_PRISM_SERVER ?? '').replace(/\/$/, '');
const DEV_LOGIN = import.meta.env.VITE_PRISM_DEV_LOGIN === '1';
const TOKEN_KEY = 'prism-token';
const FALLBACK_LINKS: Links = { discord: import.meta.env.VITE_DISCORD_URL || null, kakao: import.meta.env.VITE_KAKAO_URL || null };

const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const setToken = (t: string | null) => { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* 저장소 없음 */ } };

async function call<T>(method: string, path: string, body?: unknown, onUnauthorized?: () => void): Promise<T> {
  if (!SERVER) throw new ApiError(0, 'Prism 모임 기능은 곧 열립니다.');
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(SERVER + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, '서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해주세요.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { setToken(null); onUnauthorized?.(); }
  if (!res.ok) throw new ApiError(res.status, data.error ?? `오류 (${res.status})`);
  return data as T;
}

type Session = { api: Api; me: Me | null; ready: boolean; links: Links; login: () => void; logout: () => Promise<void>; finishLogin: (code: string) => Promise<void>; refresh: () => void };
const Ctx = createContext<Session | null>(null);
export const useSession = () => useContext(Ctx)!;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [links, setLinks] = useState<Links>(FALLBACK_LINKS);
  const api = useMemo<Api>(() => {
    const out = () => setMe(null);
    return { get: (p) => call('GET', p, undefined, out), post: (p, b) => call('POST', p, b ?? {}, out), del: (p) => call('DELETE', p, undefined, out) };
  }, []);
  const refresh = useCallback(() => {
    if (!getToken() || !SERVER) { setMe(null); setReady(true); return; }
    api.get<Me>('/api/me').then(setMe, () => setMe(null)).finally(() => setReady(true));
  }, [api]);
  useEffect(() => {
    refresh();
    if (SERVER) fetch(`${SERVER}/links`).then((r) => r.json()).then((l: Links) => setLinks({ discord: l.discord ?? FALLBACK_LINKS.discord, kakao: l.kakao ?? FALLBACK_LINKS.kakao })).catch(() => {});
  }, [refresh]);
  const value: Session = {
    api, me, ready, links, refresh,
    login: () => {
      if (!SERVER) return;
      const back = `${location.origin}/auth/done`;
      try { sessionStorage.setItem('prism-after-login', location.pathname); } catch { /* 저장소 없음 */ }
      location.href = DEV_LOGIN
        ? `${SERVER}/auth/dev?id=${encodeURIComponent(import.meta.env.VITE_PRISM_DEV_ID ?? 'me1')}&name=${encodeURIComponent(import.meta.env.VITE_PRISM_DEV_NAME ?? '하제')}&redirect=${encodeURIComponent(back)}`
        : `${SERVER}/auth/discord/start?redirect=${encodeURIComponent(back)}`;
    },
    logout: async () => { await api.post('/api/logout').catch(() => {}); setToken(null); setMe(null); },
    finishLogin: async (code) => {
      const { token } = await call<{ token: string }>('POST', '/api/app/token', { code });
      setToken(token);
      refresh();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
