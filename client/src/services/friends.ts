import { apiFetch } from './api';
import type { FriendRequestsResponse, FriendSummary } from '../types/friend';

export async function listFriends(): Promise<{ friends: FriendSummary[] }> {
  return apiFetch('/v1/friends');
}

export async function listFriendRequests(): Promise<FriendRequestsResponse> {
  return apiFetch('/v1/friends/requests');
}

export async function sendFriendRequest(user_id: string): Promise<void> {
  await apiFetch('/v1/friends/request', {
    method: 'POST',
    body: JSON.stringify({ user_id }),
  });
}

export async function acceptFriendRequest(id: string): Promise<void> {
  await apiFetch(`/v1/friends/${id}/accept`, { method: 'POST' });
}

export async function declineFriendRequest(id: string): Promise<void> {
  await apiFetch(`/v1/friends/${id}/decline`, { method: 'POST' });
}

export async function removeFriend(id: string): Promise<void> {
  await apiFetch(`/v1/friends/${id}`, { method: 'DELETE' });
}
