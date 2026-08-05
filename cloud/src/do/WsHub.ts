import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../lib/http';
import { verifyAccessToken } from '../lib/auth';
import { fireOnOnline } from '../lib/prankDelivery';

interface Attachment {
  userId?: string;
  sessionId?: string;
  rooms: string[];
  authenticated: boolean;
  /** Unix ms — rate-limit pre-auth message flood. */
  preAuthWindowStart?: number;
  preAuthMessageCount?: number;
  /** Unix ms — soft cap on ping frequency per socket. */
  lastPingAt?: number;
}

interface HubMessage {
  type: string;
  payload: unknown;
  timestamp: string;
  request_id?: string;
}

function envelope(type: string, payload: unknown, requestId?: string): string {
  const msg: HubMessage = {
    type,
    payload,
    timestamp: new Date().toISOString(),
  };
  if (requestId) msg.request_id = requestId;
  return JSON.stringify(msg);
}

/**
 * Global WebSocket hub: presence, room subscriptions, prank fan-out,
 * and WebRTC signaling relay (offer/answer/ice) between peers.
 *
 * Heartbeat: clients send `ping` ~every 45s; hub replies with `pong` (no logging).
 */
export class WsHub extends DurableObject<Env> {
  /** Max unauthenticated messages per 10s window before the socket is closed. */
  private static readonly PRE_AUTH_MSG_LIMIT = 20;
  private static readonly PRE_AUTH_WINDOW_MS = 10_000;
  /** Min ms between accepted pings on one socket (drops excess pings silently). */
  private static readonly MIN_PING_INTERVAL_MS = 5_000;
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/internal/broadcast' && request.method === 'POST') {
      const body = (await request.json()) as {
        user_ids: string[];
        message: HubMessage;
      };
      this.broadcastToUsers(body.user_ids, body.message);
      return new Response('ok');
    }

    if (url.pathname === '/internal/online-count') {
      const count = this.onlineUserIds().size;
      return Response.json({ count });
    }

    if (url.pathname === '/internal/presence') {
      const ids = [...this.onlineUserIds()];
      return Response.json({
        online: ids.map((user_id) => ({
          user_id,
          username: '',
          display_name: '',
          session_count: this.sessionCount(user_id),
        })),
        online_count: ids.length,
      });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      authenticated: false,
      rooms: [],
    } satisfies Attachment);

    server.send(
      envelope('auth_required', {
        message: 'send auth message with access token',
      }),
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;
    let parsed: HubMessage;
    try {
      parsed = JSON.parse(message) as HubMessage;
    } catch {
      ws.send(envelope('error', { message: 'invalid_json' }));
      return;
    }

    const att = (ws.deserializeAttachment() as Attachment | null) ?? {
      authenticated: false,
      rooms: [],
    };

    if (!att.authenticated) {
      // Pre-auth flood limit: closes sockets that spam before `auth`.
      const now = Date.now();
      const windowStart = att.preAuthWindowStart ?? now;
      const inWindow = now - windowStart < WsHub.PRE_AUTH_WINDOW_MS;
      const count = inWindow ? (att.preAuthMessageCount ?? 0) + 1 : 1;
      att.preAuthWindowStart = inWindow ? windowStart : now;
      att.preAuthMessageCount = count;
      ws.serializeAttachment(att);
      if (count > WsHub.PRE_AUTH_MSG_LIMIT) {
        ws.close(1008, 'rate_limited');
        return;
      }

      if (parsed.type !== 'auth') {
        ws.send(envelope('error', { message: 'auth_required' }));
        return;
      }
      const token = (parsed.payload as { token?: string } | null)?.token;
      if (!token) {
        ws.send(envelope('auth_failed', { reason: 'empty_token' }));
        ws.close(1008, 'auth_failed');
        return;
      }
      try {
        const claims = await verifyAccessToken(this.env, token);
        att.authenticated = true;
        att.userId = claims.sub;
        att.sessionId = claims.sid;
        att.rooms = [];
        ws.serializeAttachment(att);
        ws.send(
          envelope('connected', {
            user_id: claims.sub,
            session_id: claims.sid,
          }),
        );
        this.broadcastPresence(claims.sub, 'online');
        this.ctx.waitUntil(fireOnOnline(this.env, claims.sub));
      } catch {
        ws.send(envelope('auth_failed', { reason: 'invalid_token' }));
        ws.close(1008, 'auth_failed');
      }
      return;
    }

    switch (parsed.type) {
      case 'ping': {
        const now = Date.now();
        if (
          att.lastPingAt != null &&
          now - att.lastPingAt < WsHub.MIN_PING_INTERVAL_MS
        ) {
          break;
        }
        att.lastPingAt = now;
        ws.serializeAttachment(att);
        ws.send(envelope('pong', {}));
        break;
      }
      case 'subscribe_room': {
        const roomId = (parsed.payload as { room_id?: string })?.room_id;
        if (!roomId || !att.userId) break;
        // Must be a room member — prevents WS subscription to foreign rooms.
        const member = await this.env.DB.prepare(
          `SELECT 1 AS ok FROM room_members WHERE room_id = ? AND user_id = ?`,
        )
          .bind(roomId, att.userId)
          .first();
        if (!member) {
          ws.send(
            envelope(
              'error',
              { message: 'not_a_member', room_id: roomId },
              parsed.request_id,
            ),
          );
          break;
        }
        if (!att.rooms.includes(roomId)) att.rooms.push(roomId);
        ws.serializeAttachment(att);
        ws.send(
          envelope('subscribed', { room_id: roomId }, parsed.request_id),
        );
        break;
      }
      case 'unsubscribe_room': {
        const roomId = (parsed.payload as { room_id?: string })?.room_id;
        if (!roomId) break;
        att.rooms = att.rooms.filter((r) => r !== roomId);
        ws.serializeAttachment(att);
        break;
      }
      case 'prank:ack': {
        // Persist ack via Worker-side REST is preferred; echo for hub completeness.
        break;
      }
      default:
        break;
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (att?.authenticated && att.userId) {
      // Only mark offline if no other sockets for this user remain.
      const stillOnline = this.ctx
        .getWebSockets()
        .some((other) => {
          if (other === ws) return false;
          const a = other.deserializeAttachment() as Attachment | null;
          return a?.authenticated && a.userId === att.userId;
        });
      if (!stillOnline) {
        this.broadcastPresence(att.userId, 'offline');
      }
    }
    try {
      ws.close(code, reason);
    } catch {
      // already closed
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('ws error', error);
    try {
      ws.close(1011, 'error');
    } catch {
      // ignore
    }
  }

  private onlineUserIds(): Set<string> {
    const set = new Set<string>();
    for (const client of this.ctx.getWebSockets()) {
      const att = client.deserializeAttachment() as Attachment | null;
      if (att?.authenticated && att.userId) set.add(att.userId);
    }
    return set;
  }

  private sessionCount(userId: string): number {
    let n = 0;
    for (const client of this.ctx.getWebSockets()) {
      const att = client.deserializeAttachment() as Attachment | null;
      if (att?.authenticated && att.userId === userId) n += 1;
    }
    return n;
  }

  private broadcastPresence(userId: string, status: 'online' | 'offline'): void {
    const msg: HubMessage = {
      type: 'presence:update',
      payload: { user_id: userId, status },
      timestamp: new Date().toISOString(),
    };
    for (const client of this.ctx.getWebSockets()) {
      const att = client.deserializeAttachment() as Attachment | null;
      if (!att?.authenticated) continue;
      if (att.userId === userId) continue;
      try {
        client.send(JSON.stringify(msg));
      } catch {
        // ignore broken sockets
      }
    }
  }

  private broadcastToUsers(userIds: string[], message: HubMessage): void {
    const set = new Set(userIds);
    const raw = JSON.stringify(message);
    for (const client of this.ctx.getWebSockets()) {
      const att = client.deserializeAttachment() as Attachment | null;
      if (!att?.authenticated || !att.userId) continue;
      if (!set.has(att.userId)) continue;
      try {
        client.send(raw);
      } catch {
        // ignore
      }
    }
  }
}
