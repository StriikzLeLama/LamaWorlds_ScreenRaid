import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConsentState } from '../services/consent';
import * as consentApi from '../services/consent';
import { syncConsentWs } from '../services/websocket';

interface ConsentStore {
  globalConsent: boolean;
  isPaused: boolean;
  consentPromptSeen: boolean;
  roomConsents: Record<string, boolean>;
  grant: () => Promise<void>;
  revoke: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  dismissPrompt: () => void;
  setRoomConsent: (roomId: string, consented: boolean) => Promise<void>;
  loadFromServer: () => Promise<void>;
  applyServerState: (state: ConsentState) => void;
}

function fromServer(state: ConsentState) {
  return {
    globalConsent: state.global_consent,
    isPaused: state.is_paused,
    roomConsents: state.room_consents,
  };
}

function wsPayload(s: {
  globalConsent: boolean;
  isPaused: boolean;
  roomConsents: Record<string, boolean>;
}) {
  return {
    global_consent: s.globalConsent,
    is_paused: s.isPaused,
    room_consents: s.roomConsents,
  };
}

export const useConsentStore = create<ConsentStore>()(
  persist(
    (set) => ({
      globalConsent: false,
      isPaused: false,
      consentPromptSeen: false,
      roomConsents: {},
      applyServerState: (state) => set(fromServer(state)),
      loadFromServer: async () => {
        const state = await consentApi.getConsent();
        set(fromServer(state));
      },
      grant: async () => {
        const state = await consentApi.grantConsent();
        const next = { ...fromServer(state), consentPromptSeen: true };
        set(next);
        syncConsentWs(wsPayload(next));
      },
      revoke: async () => {
        const state = await consentApi.revokeConsent();
        const next = fromServer(state);
        set(next);
        syncConsentWs(wsPayload(next));
      },
      pause: async () => {
        const state = await consentApi.pauseConsent();
        const next = fromServer(state);
        set(next);
        syncConsentWs(wsPayload(next));
      },
      resume: async () => {
        const state = await consentApi.resumeConsent();
        const next = fromServer(state);
        set(next);
        syncConsentWs(wsPayload(next));
      },
      dismissPrompt: () => set({ consentPromptSeen: true }),
      setRoomConsent: async (roomId, consented) => {
        const state = await consentApi.setRoomConsent(roomId, consented);
        const next = fromServer(state);
        set(next);
        syncConsentWs(wsPayload(next));
      },
    }),
    { name: 'screenraid-consent' },
  ),
);
