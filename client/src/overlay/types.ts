export interface OverlayShowPayload {
  id: string;
  overlay_type: string;
  media_url: string | null;
  local_path: string | null;
  text: string | null;
  duration_ms: number;
  animation: string;
  sender_name: string;
  position_x: number;
  position_y: number;
  monitor_index: number;
  scale: number;
  opacity: number;
  volume: number;
  sfx?: string;
  text_color?: string | null;
  bg_color?: string | null;
  accent_color?: string | null;
  font_family?: string | null;
}

export interface ActiveOverlay extends OverlayShowPayload {
  visible: boolean;
  exiting?: boolean;
}
