import { getServerUrl, onServerUrlChange } from './serverConfig';
import { useAuthStore } from '../stores/authStore';

type MessageHandler = (type: string, payload: unknown) => void;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoff = 1000;
/** Server base URL the current socket was opened against (detect stale connections). */
let connectedServerBase: string | null = null;
/** Access token used for the active (or last attempted) connection. */
let connectedToken: string | null = null;
let wsConnected = false;
const handlers = new Set<MessageHandler>();
const connectionListeners = new Set<(connected: boolean) => void>();

function setWsConnected(connected: boolean): void {
  if (wsConnected === connected) return;
  wsConnected = connected;
  connectionListeners.forEach((listener) => listener(connected));
}

export function isWebSocketConnected(): boolean {
  return wsConnected;
}

export function onWebSocketConnectionChange(
  listener: (connected: boolean) => void,
): () => void {
  connectionListeners.add(listener);
  listener(wsConnected);
  return () => connectionListeners.delete(listener);
}

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
  if (!token) return;

  const base = getServerUrl();
  if (
    socket?.readyState === WebSocket.OPEN &&
    connectedServerBase === base &&
    connectedToken === token
  ) {
    return;
  }

  disconnectWebSocket(false);
  connectedServerBase = base;
  connectedToken = token;

  socket = new WebSocket(wsUrl(token));

  socket.onopen = () => {
    backoff = 1000;
    setWsConnected(true);
  };

  socket.onerror = (event) => {
    console.warn('[WS] error', event);
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
    connectedServerBase = null;
    connectedToken = null;
    setWsConnected(false);
    if (useAuthStore.getState().isAuthenticated) {
      reconnectTimer = setTimeout(() => {
        backoff = Math.min(backoff * 2, 30000);
        connectWebSocket();
      }, backoff);
    }
  };
}

/** Force a new connection (e.g. after server URL change). */
export function reconnectWebSocket(): void {
  if (!useAuthStore.getState().accessToken) return;
  disconnectWebSocket(false);
  connectWebSocket();
}

export function disconnectWebSocket(clearBackoff = true): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (clearBackoff) backoff = 1000;
  const s = socket;
  socket = null;
  connectedServerBase = null;
  connectedToken = null;
  setWsConnected(false);
  if (s) {
    s.onopen = null;
    s.onmessage = null;
    s.onerror = null;
    s.onclose = null;
    if (s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CONNECTING) {
      s.close();
    }
  }
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

onServerUrlChange(() => reconnectWebSocket());
