/**
 * Prism 실시간 채팅 클라이언트. 앱이 서버와 WebSocket 을 유지하고,
 * 브라우저 화면에는 SSE 로 전달한다 (로그인 토큰은 화면에 내보내지 않는다).
 */
import { SERVER_URL } from './config.js';
import { api } from './prism.js';

const KEEP = 200;
const PING_MS = 30_000;

export type ChatMsg = { id: number; memberId: string; nick: string; text: string; at: number };
type Listener = (event: unknown) => void;

export const chat = {
  connected: false,
  me: null as string | null,
  online: [] as { id: string; nick: string }[],
  messages: [] as ChatMsg[],
  error: null as string | null,
};

const listeners = new Set<Listener>();
let ws: WebSocket | null = null;
let wanted = false;
let retry = 0;
let ping: ReturnType<typeof setInterval> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

const emit = (e: unknown) => listeners.forEach((l) => l(e));

export function subscribe(l: Listener) {
  listeners.add(l);
  l({ type: 'snapshot', ...chat });
  return () => listeners.delete(l);
}

export function startChat() {
  if (wanted || !SERVER_URL) return;
  wanted = true;
  void connect();
}

export function stopChat() {
  wanted = false;
  if (retryTimer) clearTimeout(retryTimer);
  ws?.close(1000);
  ws = null;
  chat.connected = false;
  chat.messages = [];
  chat.online = [];
  emit({ type: 'snapshot', ...chat });
}

async function connect() {
  if (!wanted) return;
  try {
    const { ticket } = await api<{ ticket: string }>('/api/chat/ticket', { method: 'POST' });
    const url = SERVER_URL.replace(/^http/, 'ws') + `/chat/ws?ticket=${encodeURIComponent(ticket)}`;
    const sock = new WebSocket(url);
    ws = sock;
    sock.onopen = () => {
      retry = 0;
      chat.connected = true;
      chat.error = null;
      ping = setInterval(() => sock.readyState === sock.OPEN && sock.send('{"type":"ping"}'), PING_MS);
    };
    sock.onmessage = (ev) => {
      let d: any;
      try {
        d = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (d.type === 'hello') {
        chat.me = d.me;
        chat.messages = d.history;
        chat.online = d.online;
        emit({ type: 'snapshot', ...chat });
      } else if (d.type === 'message') {
        chat.messages = [...chat.messages, d.message].slice(-KEEP);
        emit(d);
      } else if (d.type === 'deleted') {
        chat.messages = chat.messages.filter((m) => m.id !== d.id);
        emit(d);
      } else if (d.type === 'presence') {
        chat.online = d.online;
        emit(d);
      } else if (d.type === 'error') {
        emit(d);
      }
    };
    sock.onclose = () => {
      if (ping) clearInterval(ping);
      chat.connected = false;
      emit({ type: 'status', connected: false });
      if (ws === sock) ws = null;
      scheduleRetry();
    };
    sock.onerror = () => {
      chat.error = '채팅 서버 연결이 끊겼습니다. 다시 연결하는 중…';
    };
  } catch (e) {
    chat.error = e instanceof Error ? e.message : String(e);
    emit({ type: 'status', connected: false, error: chat.error });
    scheduleRetry();
  }
}

function scheduleRetry() {
  if (!wanted) return;
  // 2초 → 4 → 8 … 최대 60초
  const wait = Math.min(60_000, 2_000 * 2 ** retry++);
  retryTimer = setTimeout(connect, wait);
}

export function sendChat(text: string) {
  if (!ws || ws.readyState !== ws.OPEN) throw new Error('채팅 서버에 연결되어 있지 않습니다.');
  ws.send(JSON.stringify({ type: 'send', text }));
}

export function deleteChat(id: number) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'delete', id }));
}
