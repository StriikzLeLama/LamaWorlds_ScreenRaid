import { apiFetch } from './api';
import { ackPrankWs, isWebSocketConnected } from './websocket';

export type OverlayType = 'image' | 'gif' | 'video' | 'text' | 'sound';

/** Must stay in sync with `Animation` in crates/screenraid-types. */
export type Animation =
  | 'fade'
  | 'zoom'
  | 'bounce'
  | 'slide_left'
  | 'slide_right'
  | 'slide_up'
  | 'slide_down'
  | 'shake'
  | 'pop'
  | 'none';

/** Human-readable labels for the prank composer select. */
export const ANIMATION_OPTIONS: { value: Animation; label: string }[] = [
  { value: 'fade', label: 'Fade' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'bounce', label: 'Bounce' },
  { value: 'slide_left', label: 'Slide left' },
  { value: 'slide_right', label: 'Slide right' },
  { value: 'slide_up', label: 'Slide up' },
  { value: 'slide_down', label: 'Slide down' },
  { value: 'shake', label: 'Shake' },
  { value: 'pop', label: 'Pop' },
  { value: 'none', label: 'None' },
];

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
  sfx?: 'none' | 'pop' | 'whoosh';
  text_color?: string | null;
  bg_color?: string | null;
  accent_color?: string | null;
  font_family?: string | null;
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
  /** Intentional self overlay — bypasses consent / quiet hours. */
  self_test?: boolean;
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

/** Overlay test on yourself — works without a room. */
export async function selfTestPrank(
  request: Omit<SendPrankRequest, 'target_id'> & { target_id?: string | null },
): Promise<PrankResponse> {
  return apiFetch<PrankResponse>('/v1/pranks/self-test', {
    method: 'POST',
    body: JSON.stringify({
      target_id: null,
      media_id: request.media_id,
      overlay_type: request.overlay_type,
      text_content: request.text_content,
      duration_ms: request.duration_ms,
      config: request.config,
    }),
  });
}

export async function listPrankHistory(roomId: string): Promise<PrankHistoryItem[]> {
  const res = await apiFetch<{ items: PrankHistoryItem[] }>(
    `/v1/rooms/${roomId}/pranks?limit=20`,
  );
  return res.items;
}

export async function ackPrank(
  prankId: string,
  rendered: boolean,
  roomId?: string,
): Promise<void> {
  if (isWebSocketConnected()) {
    ackPrankWs(prankId, rendered);
    return;
  }
  if (!roomId || roomId === 'self-test' || roomId === '00000000-0000-0000-0000-000000000000') {
    return;
  }
  await apiFetch(`/v1/rooms/${roomId}/pranks/${prankId}/ack`, {
    method: 'POST',
    body: JSON.stringify({ prank_id: prankId, rendered }),
  });
}

export const defaultOverlayConfig = (): OverlayConfig => ({
  animation: 'fade',
  position: { monitor_index: 0, x: 0.5, y: 0.5, preset: 'exact' },
  scale: 1.0,
  opacity: 1.0,
  volume: 0.8,
  sfx: 'none',
  text_color: null,
  bg_color: null,
  accent_color: null,
  font_family: null,
});
