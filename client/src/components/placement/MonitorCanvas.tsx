import { useCallback, useEffect, useRef, useState } from 'react';
import type { MonitorDescriptor } from '../../services/monitors';

export interface PlacementPosition {
  /** 0-based monitor id from layout sync (maps per receiver by index). */
  monitor_index: number;
  /** Normalized 0–1 position within the monitor (0,0 = top-left). */
  x: number;
  y: number;
}

interface Props {
  monitors: MonitorDescriptor[];
  position: PlacementPosition;
  onChange: (pos: PlacementPosition) => void;
  previewLabel?: string;
}

const CANVAS_W = 560;
const CANVAS_H = 200;

const QUICK: { label: string; x: number; y: number }[] = [
  { label: 'Top', x: 0.5, y: 0.12 },
  { label: 'Bottom', x: 0.5, y: 0.88 },
  { label: 'Left', x: 0.12, y: 0.5 },
  { label: 'Right', x: 0.88, y: 0.5 },
  { label: 'Center', x: 0.5, y: 0.5 },
];

function layoutBounds(monitors: MonitorDescriptor[]) {
  if (monitors.length === 0) return { minX: 0, minY: 0, maxX: 1920, maxY: 1080 };
  let minX = monitors[0].x;
  let minY = monitors[0].y;
  let maxX = monitors[0].x + monitors[0].width;
  let maxY = monitors[0].y + monitors[0].height;
  for (const m of monitors) {
    minX = Math.min(minX, m.x);
    minY = Math.min(minY, m.y);
    maxX = Math.max(maxX, m.x + m.width);
    maxY = Math.max(maxY, m.y + m.height);
  }
  return { minX, minY, maxX, maxY };
}

/** Fallback layout so placement still works when the target has not synced monitors. */
export const FALLBACK_MONITORS: MonitorDescriptor[] = [
  {
    id: 0,
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    scale_factor: 1,
    is_primary: true,
  },
];

export function MonitorCanvas({ monitors, position, onChange, previewLabel = 'GIF' }: Props) {
  const displayMonitors = monitors.length > 0 ? monitors : FALLBACK_MONITORS;
  const [activeMonitor, setActiveMonitor] = useState(position.monitor_index);
  const dragRef = useRef<number | null>(null);

  // Keep local selection aligned with parent (e.g. target change).
  useEffect(() => {
    setActiveMonitor(position.monitor_index);
  }, [position.monitor_index]);

  const bounds = layoutBounds(displayMonitors);
  const totalW = Math.max(1, bounds.maxX - bounds.minX);
  const totalH = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(CANVAS_W / totalW, CANVAS_H / totalH);

  const toCanvas = useCallback(
    (m: MonitorDescriptor) => ({
      left: (m.x - bounds.minX) * scale,
      top: (m.y - bounds.minY) * scale,
      width: m.width * scale,
      height: m.height * scale,
    }),
    [bounds.minX, bounds.minY, scale],
  );

  const setPos = (monitorIndex: number, x: number, y: number) => {
    onChange({
      monitor_index: monitorIndex,
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    });
    setActiveMonitor(monitorIndex);
  };

  const handlePointerDown = (e: React.PointerEvent, monitorIndex: number) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const localX = (e.clientX - rect.left) / rect.width;
    const localY = (e.clientY - rect.top) / rect.height;
    dragRef.current = monitorIndex;
    setPos(monitorIndex, localX, localY);
  };

  const handlePointerMove = (e: React.PointerEvent, monitorIndex: number) => {
    if (dragRef.current !== monitorIndex) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const localX = (e.clientX - rect.left) / rect.width;
    const localY = (e.clientY - rect.top) / rect.height;
    setPos(monitorIndex, localX, localY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
    dragRef.current = null;
  };

  const active =
    displayMonitors.find((m) => m.id === activeMonitor) ??
    displayMonitors.find((m) => m.id === position.monitor_index) ??
    displayMonitors[0];
  const activeBox = toCanvas(active);

  return (
    <div className="space-y-3">
      {monitors.length === 0 && (
        <p className="text-xs text-raid-warning">
          Target has not synced monitors yet — using a default screen. Position still applies;
          monitor index maps to the receiver&apos;s screens by number.
        </p>
      )}
      <div
        className="relative rounded-xl border border-raid-border bg-raid-surface p-3"
        style={{ width: CANVAS_W + 24, maxWidth: '100%' }}
      >
        <div className="relative" style={{ width: CANVAS_W, height: CANVAS_H }}>
          {displayMonitors.map((m) => {
            const box = toCanvas(m);
            const isActive = m.id === active.id;
            return (
              <div
                key={m.id}
                className={`absolute cursor-crosshair touch-none rounded-lg border-2 ${
                  isActive ? 'border-raid-accent' : 'border-raid-border'
                } bg-raid-card/80`}
                style={{
                  left: box.left,
                  top: box.top,
                  width: box.width,
                  height: box.height,
                }}
                onPointerDown={(e) => handlePointerDown(e, m.id)}
                onPointerMove={(e) => handlePointerMove(e, m.id)}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                <span className="absolute left-1 top-1 text-[10px] text-raid-text-secondary">
                  M{m.id + 1} {m.is_primary ? '●' : ''} {m.width}×{m.height}
                </span>
              </div>
            );
          })}
          <div
            className="pointer-events-none absolute flex h-10 w-14 items-center justify-center rounded bg-raid-accent/90 text-xs font-bold text-white shadow-lg"
            style={{
              left: activeBox.left + position.x * activeBox.width - 28,
              top: activeBox.top + position.y * activeBox.height - 20,
            }}
          >
            {previewLabel}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {displayMonitors.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`rounded-lg px-2 py-1 text-xs ${
              active.id === m.id
                ? 'bg-raid-accent text-white'
                : 'bg-raid-surface text-raid-text-secondary'
            }`}
            onClick={() => setPos(m.id, position.x, position.y)}
          >
            Monitor {m.id + 1}
          </button>
        ))}
        {QUICK.map((q) => (
          <button
            key={q.label}
            type="button"
            className="rounded-lg bg-raid-surface px-2 py-1 text-xs text-raid-text-secondary hover:text-raid-text"
            onClick={() => setPos(active.id, q.x, q.y)}
          >
            {q.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-raid-text-secondary">
        Position: x {position.x.toFixed(2)}, y {position.y.toFixed(2)} (monitor{' '}
        {position.monitor_index + 1}) — click the screen or use Top / Bottom / …
      </p>
    </div>
  );
}
