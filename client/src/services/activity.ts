import { apiFetch } from './api';

export interface ActivityItem {
  id: string;
  kind: 'prank' | 'member_joined';
  at: string;
  actor_name?: string | null;
  target_name?: string | null;
  overlay_type?: string | null;
  status?: string | null;
  text?: string | null;
}

export async function listRoomActivity(
  roomId: string,
  limit = 40,
): Promise<ActivityItem[]> {
  const res = await apiFetch<{ items: ActivityItem[] }>(
    `/v1/rooms/${roomId}/activity?limit=${limit}`,
  );
  return res.items;
}
