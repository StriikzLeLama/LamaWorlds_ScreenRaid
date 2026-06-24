import { useEffect } from 'react';
import {
  disconnectWebSocket,
  onWsMessage,
  reconnectWebSocket,
  startHeartbeat,
} from '../services/websocket';
import { useAuthStore } from '../stores/authStore';
import { useConsentStore } from '../stores/consentStore';
import type { ConsentState } from '../services/consent';

export function useWebSocket() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const loadConsent = useConsentStore((s) => s.loadFromServer);
  const applyServerState = useConsentStore((s) => s.applyServerState);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      disconnectWebSocket();
      return;
    }

    reconnectWebSocket();
    loadConsent().catch(() => undefined);
    const heartbeat = startHeartbeat();

    const unsub = onWsMessage((type, payload) => {
      if (type === 'connected') {
        console.debug('[WS] connected', payload);
      }
      if (type === 'consent:updated') {
        applyServerState(payload as ConsentState);
      }
      if (type === 'presence:changed') {
        window.dispatchEvent(new CustomEvent('screenraid:presence', { detail: payload }));
      }
      if (type === 'friend:request' || type === 'friend:accepted') {
        window.dispatchEvent(new CustomEvent('screenraid:friends', { detail: { type, payload } }));
      }
      if (type.startsWith('room:')) {
        window.dispatchEvent(new CustomEvent('screenraid:room', { detail: { type, payload } }));
      }
      if (type === 'prank:sent' || type === 'prank:blocked') {
        window.dispatchEvent(new CustomEvent('screenraid:room', { detail: { type, payload } }));
      }
      if (type === 'monitor:changed') {
        window.dispatchEvent(new CustomEvent('screenraid:monitors', { detail: payload }));
      }
    });

    return () => {
      unsub();
      clearInterval(heartbeat);
      disconnectWebSocket();
    };
  }, [isAuthenticated, accessToken, loadConsent, applyServerState]);
}
