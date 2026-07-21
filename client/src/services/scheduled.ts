import { apiFetch } from './api';
import type { OverlayConfig, OverlayType } from './pranks';

export type ScheduleTrigger = 'at_time' | 'on_online';

export interface SchedulePrankBody {
  target_id: string | null;
  media_id: string | null;
  overlay_type: OverlayType;
  text_content: string | null;
  duration_ms: number;
  config: OverlayConfig;
  trigger_type: ScheduleTrigger;
  run_at?: string | null;
  online_user_id?: string | null;
}

export interface ScheduledPrankItem {
  id: string;
  room_id: string;
  sender_id: string;
  target_id: string | null;
  trigger_type: ScheduleTrigger;
  run_at: string | null;
  online_user_id: string | null;
  status: string;
  created_at: string;
  fired_at: string | null;
  overlay_type: OverlayType;
  text_content: string | null;
}

export async function schedulePrank(
  roomId: string,
  body: SchedulePrankBody,
): Promise<{ id: string }> {
  return apiFetch(`/v1/rooms/${roomId}/scheduled`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function listScheduled(roomId: string): Promise<ScheduledPrankItem[]> {
  const res = await apiFetch<{ items: ScheduledPrankItem[] }>(
    `/v1/rooms/${roomId}/scheduled`,
  );
  return res.items;
}

export async function cancelScheduled(roomId: string, schedId: string): Promise<void> {
  await apiFetch(`/v1/rooms/${roomId}/scheduled/${schedId}`, { method: 'DELETE' });
}
