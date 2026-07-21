import { getWebSocketUrl, onServerUrlChange } from './serverConfig';
import { useAuthStore } from '../stores/authStore';
import { refreshToken } from './auth';
import { log } from '../lib/log';

type MessageHandler = (type: string, payload: unknown) => void;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoff = 1000;
/** Server base URL the current socket was opened against (detect stale connections). */
let connectedServerBase: string | null = null;
/** Access token used for the active (or last attempted) connection. */
let connectedToken: string | null = null;
let wsConnected = false;
let wsAuthenticated = false;
/** True when the server rejected the auth message (bad/expired token). */
let authRejected = false;
let refreshInFlight: Promise<boolean> | null = null;
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

function wsUrl(): string {
  return `${getWebSocketUrl()}/v1/ws`;
}

function sendAuth(token: string): void {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(
    JSON.stringify({
      type: 'auth',
      payload: { token },
      timestamp: new Date().toISOString(),
    }),
  );
}

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const stored = useAuthStore.getState().refreshToken;
    if (!stored) return false;
    try {
      const res = await refreshToken(stored);
      useAuthStore.getState().login(
        { access: res.access_token, refresh: res.refresh_token },
        res.user,
      );
      log.info('WS auth: refreshed access token');
      return true;
    } catch (err) {
      log.warn('WS auth: refresh failed', err);
      useAuthStore.getState().logout();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export function onWsMessage(handler: MessageHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function connectWebSocket(): void {
  const token = useAuthStore.getState().accessToken;
  if (!token) {
    log.warn('connectWebSocket: no token, abort');
    return;
  }

  const base = getWebSocketUrl();
  if (
    socket?.readyState === WebSocket.OPEN &&
    connectedServerBase === base &&
    connectedToken === token &&
    wsAuthenticated
  ) {
    log.info('connectWebSocket: already open to', base);
    return;
  }

  log.info('connectWebSocket: opening to', base);
  disconnectWebSocket(false);
  connectedServerBase = base;
  connectedToken = token;
  wsAuthenticated = false;
  authRejected = false;

  const url = wsUrl();
  log.info('connectWebSocket: ws url', url);
  socket = new WebSocket(url);

  socket.onopen = () => {
    log.info('WS open, sending auth message');
    backoff = 1000;
    sendAuth(token);
  };

  socket.onerror = (event) => {
    log.warn('WS error', event);
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as { type: string; payload: unknown };
      log.info('WS msg', msg.type);
      if (msg.type === 'auth_required') {
        const latest = useAuthStore.getState().accessToken;
        if (latest && !wsAuthenticated) {
          log.info('WS auth_required — (re)sending auth');
          sendAuth(latest);
        }
      }
      if (msg.type === 'connected') {
        wsAuthenticated = true;
        authRejected = false;
        setWsConnected(true);
      }
      if (msg.type === 'auth_failed') {
        authRejected = true;
        log.warn('WS auth_failed', msg.payload);
      }
      handlers.forEach((h) => h(msg.type, msg.payload));
    } catch (e) {
      log.warn('WS malformed message', e);
    }
  };

  socket.onclose = (event) => {
    log.info('WS close code=', event.code, 'reason=', event.reason);
    const wasAuthenticated = wsAuthenticated;
    const wasRejected = authRejected;
    socket = null;
    connectedServerBase = null;
    connectedToken = null;
    wsAuthenticated = false;
    authRejected = false;
    setWsConnected(false);

    if (!useAuthStore.getState().isAuthenticated) return;

    // Auth rejected (expired/invalid access token) → refresh then reconnect once.
    if (!wasAuthenticated && wasRejected) {
      void (async () => {
        const ok = await refreshAccessToken();
        if (!ok) {
          log.warn('WS: stopping reconnect after auth failure');
          return;
        }
        reconnectTimer = setTimeout(() => connectWebSocket(), 300);
      })();
      return;
    }

    // Closed before auth completed without explicit auth_failed — still try refresh.
    if (!wasAuthenticated) {
      void (async () => {
        const ok = await refreshAccessToken();
        if (!ok) return;
        reconnectTimer = setTimeout(() => {
          backoff = Math.min(backoff * 2, 30000);
          connectWebSocket();
        }, Math.min(backoff, 2000));
      })();
      return;
    }

    reconnectTimer = setTimeout(() => {
      backoff = Math.min(backoff * 2, 30000);
      log.info('WS reconnect backoff=', backoff);
      connectWebSocket();
    }, backoff);
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
  wsAuthenticated = false;
  authRejected = false;
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
  if (socket?.readyState === WebSocket.OPEN && wsAuthenticated) {
    socket.send(
      JSON.stringify({
        ...data,
        timestamp: new Date().toISOString(),
      }),
    );
  } else {
    log.warn('WS send skipped (not open)', (data as { type?: string }).type);
  }
}

export function startHeartbeat(): ReturnType<typeof setInterval> {
  return setInterval(() => {
    send({ type: 'ping', payload: {} });
  }, 30000);
}

onServerUrlChange(() => reconnectWebSocket());
