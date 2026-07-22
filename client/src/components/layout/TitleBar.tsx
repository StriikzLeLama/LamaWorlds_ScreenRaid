import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { useAppVersion } from '../../lib/version';

function windowAction(action: () => Promise<void>): void {
  void action().catch((err) => {
    console.error('[TitleBar]', err);
  });
}

export function TitleBar() {
  const appWindow = getCurrentWindow();
  const version = useAppVersion();

  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-raid-border bg-raid-surface px-3">
      <div
        data-tauri-drag-region
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        <BrandLogo size={22} withWordmark subtitle="Receiver" />
        <span className="rounded-md bg-raid-card px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-raid-text-secondary">
          v{version}
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
          aria-label="Réduire dans la barre système"
          title="Réduire dans la barre système (Quitter via l’icône tray)"
          onClick={() => windowAction(() => appWindow.hide())}
          className="rounded-lg p-1.5 text-raid-text-secondary transition-colors hover:bg-raid-danger hover:text-white"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
