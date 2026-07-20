import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title: string;
  children: ReactNode;
  closable?: boolean;
  /** Wider modal for GIF picker / previews. */
  size?: 'md' | 'xl' | 'full';
}

export function Modal({
  open,
  onClose,
  title,
  children,
  closable = true,
  size = 'md',
}: ModalProps) {
  if (!open) return null;

  const width =
    size === 'full'
      ? 'max-w-5xl'
      : size === 'xl'
        ? 'max-w-3xl'
        : 'max-w-lg';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-raid-border bg-raid-card shadow-lg ${width}`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-raid-border px-6 py-4">
          <h2 className="text-lg font-semibold text-raid-text">{title}</h2>
          {closable && onClose && (
            <Button variant="ghost" onClick={onClose} className="!p-2">
              <X size={18} />
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
