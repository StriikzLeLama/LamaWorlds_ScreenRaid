import { apiFetch } from './api';
import { ackPrankWs } from './websocket';

export type OverlayType = 'image' | 'gif' | 'video' | 'text' | 'sound';
export type Animation = 'fade' | 'zoom' | 'bounce' | 'none';

export interface OverlayConfig {
  animation: Animation;
  position: {
    monitor_index: number;
    x: number;
    y: number;
    preset?: string;
  };
  scale: number;
  opacity: number;
  volume: number;
}

export interface SendPrankRequest {
  target_id: string | null;
  media_id: string | null;
  overlay_type: OverlayType;
  text_content: string | null;
  duration_ms: number;
  config: OverlayConfig;
}

export interface PrankResponse {
  id: string;
  room_id: string;
  status: string;
  expires_at: string;
  created_at: string;
}

export interface PrankIncomingPayload {
  prank_id: string;
  room_id: string;
  sender: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  overlay_type: OverlayType;
  media: {
    id: string;
    url: string;
    mime_type: string;
    hash_sha256: string;
  } | null;
  text_content: string | null;
  duration_ms: number;
  config: OverlayConfig;
  expires_at: string;
}

export interface PrankHistoryItem {
  id: string;
  sender_id: string;
  target_id: string | null;
  overlay_type: string;
  status: string;
  created_at: string;
}

export async function sendPrank(
  roomId: string,
  request: SendPrankRequest,
): Promise<PrankResponse> {
  return apiFetch<PrankResponse>(`/v1/rooms/${roomId}/pranks`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function listPrankHistory(roomId: string): Promise<PrankHistoryItem[]> {
  const res = await apiFetch<{ items: PrankHistoryItem[] }>(
    `/v1/rooms/${roomId}/pranks?limit=20`,
  );
  return res.items;
}

export function ackPrank(prankId: string, rendered: boolean): void {
  ackPrankWs(prankId, rendered);
}

export const defaultOverlayConfig = (): OverlayConfig => ({
  animation: 'fade',
  position: { monitor_index: 0, x: 0.5, y: 0.5, preset: 'center' },
  scale: 1.0,
  opacity: 1.0,
  volume: 0.8,
});
