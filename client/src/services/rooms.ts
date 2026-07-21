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
