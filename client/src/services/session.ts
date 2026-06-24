import { useAuthStore } from '../stores/authStore';
import { useConsentStore } from '../stores/consentStore';
import { disconnectWebSocket } from './websocket';

/** Drop local auth/consent and close WebSocket immediately (no server round-trip). */
export function clearLocalSession(): void {
  disconnectWebSocket();
  useAuthStore.getState().logout();
  useConsentStore.getState().reset();
}
