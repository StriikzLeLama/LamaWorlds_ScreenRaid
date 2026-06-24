import { apiFetch } from './api';

export interface ConsentState {
  global_consent: boolean;
  is_paused: boolean;
  room_consents: Record<string, boolean>;
  consented_at: string | null;
  updated_at: string;
}

export async function getConsent(): Promise<ConsentState> {
  return apiFetch('/v1/consent');
}

export async function grantConsent(): Promise<ConsentState> {
  return apiFetch('/v1/consent/grant', { method: 'POST' });
}

export async function revokeConsent(): Promise<ConsentState> {
  return apiFetch('/v1/consent/revoke', { method: 'POST' });
}

export async function pauseConsent(): Promise<ConsentState> {
  return apiFetch('/v1/consent/pause', { method: 'POST' });
}

export async function resumeConsent(): Promise<ConsentState> {
  return apiFetch('/v1/consent/resume', { method: 'POST' });
}

export async function setRoomConsent(roomId: string, consented: boolean): Promise<ConsentState> {
  return apiFetch(`/v1/consent/rooms/${roomId}`, {
    method: 'PATCH',
    body: JSON.stringify({ consented }),
  });
}
