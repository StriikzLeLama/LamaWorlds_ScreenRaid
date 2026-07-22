import { invoke } from '@tauri-apps/api/core';

export type CursorPos = { monitor_index: number; x: number; y: number };

export type MotionPreset =
  | 'exact'
  | 'follow_mouse'
  | 'orbit'
  | 'trail'
  | 'dodge'
  | 'clickbait'
  | 'takeover';

export const MOTION_OPTIONS: { value: MotionPreset; label: string; hint: string }[] = [
  { value: 'exact', label: 'Fixe', hint: 'Position choisie / centre' },
  { value: 'follow_mouse', label: 'Suit souris', hint: 'Colle au curseur ~3s' },
  { value: 'orbit', label: 'Orbit', hint: 'Tourne autour de la souris' },
  { value: 'trail', label: 'Trail', hint: '3 mini-GIFs qui suivent' },
  { value: 'dodge', label: 'Dodge', hint: 'Fuit quand tu approches' },
  { value: 'clickbait', label: 'Click bait', hint: 'Faux bouton Fermer → 2e raid' },
  { value: 'takeover', label: 'Takeover', hint: 'Bandeau plein écran puis GIF' },
];

export function isCursorMotion(preset: string | undefined): boolean {
  return (
    preset === 'follow_mouse' ||
    preset === 'orbit' ||
    preset === 'trail' ||
    preset === 'dodge'
  );
}

export async function sampleCursor(): Promise<CursorPos> {
  return invoke<CursorPos>('get_cursor_normalized');
}

export async function moveOverlay(
  id: string,
  x: number,
  y: number,
  monitorIndex?: number | null,
): Promise<void> {
  await invoke('move_overlay', {
    id,
    positionX: Math.min(1, Math.max(0, x)),
    positionY: Math.min(1, Math.max(0, y)),
    monitorIndex: monitorIndex ?? null,
  });
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

/** Poll the OS cursor and drive overlay motion until `durationMs`. */
export async function runCursorMotion(opts: {
  preset: MotionPreset;
  overlayId: string;
  durationMs: number;
  /** Extra overlay ids for trail clones (length 3). */
  trailIds?: string[];
  startX?: number;
  startY?: number;
}): Promise<void> {
  const followMs = Math.min(Math.max(opts.durationMs, 800), 4000);
  const started = Date.now();
  const history: CursorPos[] = [];
  let angle = Math.random() * Math.PI * 2;
  let ox = opts.startX ?? 0.5;
  let oy = opts.startY ?? 0.5;

  while (Date.now() - started < followMs) {
    let cursor: CursorPos;
    try {
      cursor = await sampleCursor();
    } catch {
      break;
    }
    history.push(cursor);
    if (history.length > 24) history.shift();

    if (opts.preset === 'follow_mouse') {
      await moveOverlay(opts.overlayId, cursor.x, cursor.y);
    } else if (opts.preset === 'orbit') {
      angle += 0.18;
      const r = 0.14;
      await moveOverlay(
        opts.overlayId,
        clamp01(cursor.x + Math.cos(angle) * r),
        clamp01(cursor.y + Math.sin(angle) * r),
      );
    } else if (opts.preset === 'dodge') {
      const dx = ox - cursor.x;
      const dy = oy - cursor.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      if (dist < 0.28) {
        const push = (0.28 - dist) * 0.55;
        ox = clamp01(ox + (dx / dist) * push);
        oy = clamp01(oy + (dy / dist) * push);
      } else {
        // Slow drift back toward center-ish so it stays on screen
        ox = clamp01(ox * 0.98 + 0.5 * 0.02);
        oy = clamp01(oy * 0.98 + 0.5 * 0.02);
      }
      await moveOverlay(opts.overlayId, ox, oy);
    } else if (opts.preset === 'trail' && opts.trailIds?.length) {
      await moveOverlay(opts.overlayId, cursor.x, cursor.y);
      const lags = [6, 12, 18];
      for (let i = 0; i < opts.trailIds.length; i++) {
        const idx = Math.max(0, history.length - 1 - lags[i]);
        const p = history[idx] ?? cursor;
        await moveOverlay(opts.trailIds[i], p.x, p.y);
      }
    }

    await sleep(33);
  }
}
