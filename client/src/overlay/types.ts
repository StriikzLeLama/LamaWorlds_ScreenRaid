export interface OverlayShowPayload {
  id: string;
  overlay_type: string;
  media_url: string | null;
  text: string | null;
  duration_ms: number;
  animation: string;
  sender_name: string;
  position_x: number;
  position_y: number;
  monitor_index: number;
  scale: number;
  opacity: number;
}

export interface ActiveOverlay extends OverlayShowPayload {
  visible: boolean;
}
