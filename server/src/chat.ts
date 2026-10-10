/**
 * Prism 실시간 채팅 — 방 하나(#prism)를 Durable Object 하나가 맡는다.
 * WebSocket Hibernation API 를 써서 접속만 있고 대화가 없을 때는 비용이 거의 들지 않는다.
 * 인증은 Worker 가 끝낸 뒤 X-Prism-* 헤더로 회원 정보를 넘긴다 (클라이언트가 보낸 같은 헤더는 Worker 가 지운다).
 */
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './util.js';

const MAX_TEXT = 300;
const HISTORY = 50;
const KEEP = 2000; // 보관 메시지 수
const MIN_INTERVAL_MS = 800; // 도배 방지

type Who = { id: string; nick: string; admin: boolean; lastAt: number };
type Msg = { id: number; memberId: string; nick: string; text: string; at: number };

export class ChatRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (
         id INTEGER PRIMARY KEY AUTOINCREMENT, member_id TEXT NOT NULL, nick TEXT NOT NULL,
         text TEXT NOT NULL, at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)`,
    );
    // 연결 유지용 ping 은 방(DO)을 깨우지 않고 런타임이 바로 답한다
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  private history(): Msg[] {
    return this.ctx.storage.sql
      .exec<{ id: number; member_id: string; nick: string; text: string; at: number }>(
        'SELECT id, member_id, nick, text, at FROM messages WHERE deleted = 0 ORDER BY id DESC LIMIT ?',
        HISTORY,
      )
      .toArray()
      .reverse()
      .map((r) => ({ id: r.id, memberId: r.member_id, nick: r.nick, text: r.text, at: r.at }));
  }

  /** 접속 중인 회원 (한 사람이 여러 창이어도 1명) */
  private online(except?: WebSocket): { id: string; nick: string }[] {
    const seen = new Map<string, string>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const w = ws.deserializeAttachment() as Who | null;
      if (w) seen.set(w.id, w.nick);
    }
    return [...seen].map(([id, nick]) => ({ id, nick }));
  }

  private broadcast(data: unknown) {
    const s = JSON.stringify(data);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(s);
      } catch {
        /* 끊긴 소켓은 close 이벤트에서 정리된다 */
      }
    }
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 });
    const who: Who = {
      id: req.headers.get('X-Prism-Member') ?? '',
      nick: decodeURIComponent(req.headers.get('X-Prism-Nick') ?? ''),
      admin: req.headers.get('X-Prism-Admin') === '1',
      lastAt: 0,
    };
    if (!who.id) return new Response('unauthorized', { status: 401 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [who.id]);
    server.serializeAttachment(who);
    server.send(JSON.stringify({ type: 'hello', me: who.id, history: this.history(), online: this.online() }));
    this.broadcast({ type: 'presence', online: this.online() });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const who = ws.deserializeAttachment() as Who;
    let data: any;
    try {
      data = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }

    if (data?.type === 'send') {
      const text = typeof data.text === 'string' ? data.text.trim().slice(0, MAX_TEXT) : '';
      if (!text) return;
      const now = Date.now();
      if (now - who.lastAt < MIN_INTERVAL_MS) {
        ws.send(JSON.stringify({ type: 'error', message: '조금 천천히 보내주세요.' }));
        return;
      }
      who.lastAt = now;
      ws.serializeAttachment(who);
      const row = this.ctx.storage.sql
        .exec<{ id: number }>('INSERT INTO messages (member_id, nick, text, at) VALUES (?, ?, ?, ?) RETURNING id', who.id, who.nick, text, now)
        .one();
      this.ctx.storage.sql.exec('DELETE FROM messages WHERE id <= ?', row.id - KEEP);
      this.broadcast({ type: 'message', message: { id: row.id, memberId: who.id, nick: who.nick, text, at: now } satisfies Msg });
      return;
    }

    if (data?.type === 'delete' && Number.isInteger(data.id)) {
      // 본인 메시지 또는 관리자만
      const r = this.ctx.storage.sql.exec('UPDATE messages SET deleted = 1 WHERE id = ? AND deleted = 0 AND (member_id = ? OR ? = 1)', data.id, who.id, who.admin ? 1 : 0);
      if (r.rowsWritten > 0) this.broadcast({ type: 'deleted', id: data.id });
      return;
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {
      /* 이미 닫힘 */
    }
    // 닫히는 소켓은 아직 목록에 남아 있을 수 있으므로 빼고 센다
    this.broadcast({ type: 'presence', online: this.online(ws) });
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws, 1011);
  }
}
