import { apiFetch } from './api';
import type { RoomDetail, RoomSummary } from '../types/room';

export async function listRooms(): Promise<{ rooms: RoomSummary[] }> {
  return apiFetch('/v1/rooms');
}

export async function createRoom(name: string): Promise<RoomSummary> {
  return apiFetch('/v1/rooms', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function joinRoom(invite_code: string): Promise<RoomSummary> {
  return apiFetch('/v1/rooms/join', {
    method: 'POST',
    body: JSON.stringify({ invite_code }),
  });
}

/** One-click join by room id (friends app — no invite). */
export async function joinRoomById(roomId: string): Promise<RoomSummary> {
  return apiFetch('/v1/rooms/join', {
    method: 'POST',
    body: JSON.stringify({ room_id: roomId }),
  });
}

/** Join via guest/member invite link token (expiry + max uses). */
export async function joinRoomByToken(invite_token: string): Promise<RoomSummary> {
  return apiFetch('/v1/rooms/join', {
    method: 'POST',
    body: JSON.stringify({ invite_token }),
  });
}

export interface RoomInvite {
  id: string;
  room_id: string;
  token: string;
  role: string;
  expires_at: string | null;
  max_uses: number;
  use_count: number;
  is_active: boolean;
  created_at: string;
}

export async function createRoomInvite(
  roomId: string,
  opts: { role?: string; expires_in_hours?: number; max_uses?: number } = {},
): Promise<RoomInvite> {
  return apiFetch(`/v1/rooms/${roomId}/invites`, {
    method: 'POST',
    body: JSON.stringify({
      role: opts.role ?? 'guest',
      expires_in_hours: opts.expires_in_hours ?? 24,
      max_uses: opts.max_uses ?? 1,
    }),
  });
}

export async function listRoomInvites(roomId: string): Promise<RoomInvite[]> {
  const res = await apiFetch<{ invites: RoomInvite[] }>(`/v1/rooms/${roomId}/invites`);
  return res.invites;
}

export async function deactivateRoomInvite(roomId: string, inviteId: string): Promise<void> {
  await apiFetch(`/v1/rooms/${roomId}/invites/${inviteId}`, { method: 'DELETE' });
}

export async function getRoom(id: string): Promise<RoomDetail> {
  return apiFetch(`/v1/rooms/${id}`);
}

export async function leaveRoom(id: string): Promise<void> {
  return apiFetch(`/v1/rooms/${id}/leave`, { method: 'POST' });
}

export async function deleteRoom(id: string): Promise<void> {
  return apiFetch(`/v1/rooms/${id}`, { method: 'DELETE' });
}

export async function kickMember(roomId: string, userId: string): Promise<void> {
  return apiFetch(`/v1/rooms/${roomId}/members/${userId}`, { method: 'DELETE' });
}

export async function changeMemberRole(
  roomId: string,
  userId: string,
  role: string,
): Promise<void> {
  return apiFetch(`/v1/rooms/${roomId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}
