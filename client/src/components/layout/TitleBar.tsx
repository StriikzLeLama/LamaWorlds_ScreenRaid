import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';

export function TitleBar() {
  const appWindow = getCurrentWindow();

  return (
    <div
      data-tauri-drag-region
      className="flex h-10 shrink-0 items-center justify-between border-b border-raid-border bg-raid-surface px-4"
    >
      <div data-tauri-drag-region className="flex items-center gap-2">
        <div className="h-2.5 w-2.5 rounded-full bg-raid-accent" />
        <span data-tauri-drag-region className="text-sm font-semibold text-raid-text">
          ScreenRaid
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => appWindow.minimize()}
          className="rounded-lg p-1.5 text-raid-text-secondary transition-colors hover:bg-raid-card hover:text-raid-text"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          className="rounded-lg p-1.5 text-raid-text-secondary transition-colors hover:bg-raid-card hover:text-raid-text"
        >
          <Square size={14} />
        </button>
        <button
          onClick={() => appWindow.close()}
          className="rounded-lg p-1.5 text-raid-text-secondary transition-colors hover:bg-raid-danger hover:text-white"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
