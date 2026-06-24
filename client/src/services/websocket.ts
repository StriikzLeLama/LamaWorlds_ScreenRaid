import { getServerUrl } from './api';
import { useAuthStore } from '../stores/authStore';

type MessageHandler = (type: string, payload: unknown) => void;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoff = 1000;
const handlers = new Set<MessageHandler>();

function wsUrl(token: string): string {
  const base = getServerUrl().replace(/^http/, 'ws');
  return `${base}/v1/ws?token=${encodeURIComponent(token)}`;
}

export function onWsMessage(handler: MessageHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function connectWebSocket(): void {
  const token = useAuthStore.getState().accessToken;
  if (!token || socket?.readyState === WebSocket.OPEN) return;

  disconnectWebSocket(false);

  socket = new WebSocket(wsUrl(token));

  socket.onopen = () => {
    backoff = 1000;
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as { type: string; payload: unknown };
      handlers.forEach((h) => h(msg.type, msg.payload));
    } catch {
      // ignore malformed
    }
  };

  socket.onclose = () => {
    socket = null;
    if (useAuthStore.getState().isAuthenticated) {
      reconnectTimer = setTimeout(() => {
        backoff = Math.min(backoff * 2, 30000);
        connectWebSocket();
      }, backoff);
    }
  };
}

export function disconnectWebSocket(clearBackoff = true): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (clearBackoff) backoff = 1000;
  socket?.close();
  socket = null;
}

export function subscribeRoom(roomId: string): void {
  send({ type: 'subscribe_room', payload: { room_id: roomId } });
}

export function unsubscribeRoom(roomId: string): void {
  send({ type: 'unsubscribe_room', payload: { room_id: roomId } });
}

export function syncConsentWs(payload: {
  global_consent: boolean;
  is_paused: boolean;
  room_consents: Record<string, boolean>;
}): void {
  send({ type: 'consent:sync', payload });
}

export function ackPrankWs(prankId: string, rendered: boolean): void {
  send({ type: 'prank:ack', payload: { prank_id: prankId, rendered } });
}

export function syncMonitorsWs(monitors: unknown[]): void {
  send({ type: 'monitor:update', payload: { monitors } });
}

export function send(data: object): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        ...data,
        timestamp: new Date().toISOString(),
      }),
    );
  }
}

export function startHeartbeat(): ReturnType<typeof setInterval> {
  return setInterval(() => {
    send({ type: 'ping', payload: {} });
  }, 30000);
}
