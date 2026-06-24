import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';

function windowAction(action: () => Promise<void>): void {
  void action().catch((err) => {
    console.error('[TitleBar]', err);
  });
}

export function TitleBar() {
  const appWindow = getCurrentWindow();

  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-raid-border bg-raid-surface px-4">
      <div
        data-tauri-drag-region
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-raid-accent" />
        <span className="truncate text-sm font-semibold text-raid-text">
          ScreenRaid Receiver
        </span>
      </div>
      {/* Must stay outside drag region or clicks are swallowed */}
      <div
        data-tauri-drag-region={false}
        className="flex shrink-0 items-center gap-1"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Minimize"
          onClick={() => windowAction(() => appWindow.minimize())}
          className="rounded-lg p-1.5 text-raid-text-secondary transition-colors hover:bg-raid-card hover:text-raid-text"
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          aria-label="Maximize"
          onClick={() => windowAction(() => appWindow.toggleMaximize())}
          className="rounded-lg p-1.5 text-raid-text-secondary transition-colors hover:bg-raid-card hover:text-raid-text"
        >
          <Square size={14} />
        </button>
        <button
          type="button"
          aria-label="Close"
          onClick={() => windowAction(() => appWindow.close())}
          className="rounded-lg p-1.5 text-raid-text-secondary transition-colors hover:bg-raid-danger hover:text-white"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
