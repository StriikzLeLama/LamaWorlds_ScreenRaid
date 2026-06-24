import { useCallback, useRef, useState } from 'react';
import type { MonitorDescriptor } from '../../services/monitors';

export interface PlacementPosition {
  monitor_index: number;
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

export function MonitorCanvas({ monitors, position, onChange, previewLabel = 'GIF' }: Props) {
  const [activeMonitor, setActiveMonitor] = useState(position.monitor_index);
  const dragRef = useRef<number | null>(null);

  const bounds = layoutBounds(monitors);
  const totalW = bounds.maxX - bounds.minX;
  const totalH = bounds.maxY - bounds.minY;
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

  const handlePointerDown = (e: React.PointerEvent, monitorIndex: number) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const localX = (e.clientX - rect.left) / rect.width;
    const localY = (e.clientY - rect.top) / rect.height;
    dragRef.current = monitorIndex;
    onChange({
      monitor_index: monitorIndex,
      x: Math.min(1, Math.max(0, localX)),
      y: Math.min(1, Math.max(0, localY)),
    });
    setActiveMonitor(monitorIndex);
  };

  const handlePointerMove = (e: React.PointerEvent, monitorIndex: number) => {
    if (dragRef.current !== monitorIndex) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const localX = (e.clientX - rect.left) / rect.width;
    const localY = (e.clientY - rect.top) / rect.height;
    onChange({
      monitor_index: monitorIndex,
      x: Math.min(1, Math.max(0, localX)),
      y: Math.min(1, Math.max(0, localY)),
    });
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  if (monitors.length === 0) {
    return (
      <p className="text-sm text-raid-text-secondary">
        Target has not synced their monitor layout yet.
      </p>
    );
  }

  const active = monitors.find((m) => m.id === activeMonitor) ?? monitors[0];
  const activeBox = toCanvas(active);

  return (
    <div className="space-y-3">
      <div
        className="relative rounded-xl border border-raid-border bg-raid-surface p-3"
        style={{ width: CANVAS_W + 24, maxWidth: '100%' }}
      >
        <div className="relative" style={{ width: CANVAS_W, height: CANVAS_H }}>
          {monitors.map((m) => {
            const box = toCanvas(m);
            const isActive = m.id === activeMonitor;
            return (
              <div
                key={m.id}
                className={`absolute cursor-crosshair rounded-lg border-2 ${
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
                onPointerLeave={handlePointerUp}
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
        {monitors.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`rounded-lg px-2 py-1 text-xs ${
              activeMonitor === m.id
                ? 'bg-raid-accent text-white'
                : 'bg-raid-surface text-raid-text-secondary'
            }`}
            onClick={() => {
              setActiveMonitor(m.id);
              onChange({ ...position, monitor_index: m.id });
            }}
          >
            Monitor {m.id + 1}
          </button>
        ))}
        <button
          type="button"
          className="rounded-lg bg-raid-surface px-2 py-1 text-xs text-raid-text-secondary"
          onClick={() => onChange({ monitor_index: activeMonitor, x: 0.5, y: 0.5 })}
        >
          Center
        </button>
      </div>
      <p className="text-xs text-raid-text-secondary">
        Position: x {position.x.toFixed(2)}, y {position.y.toFixed(2)} (monitor{' '}
        {position.monitor_index + 1})
      </p>
    </div>
  );
}
