import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title: string;
  children: ReactNode;
  closable?: boolean;
}

export function Modal({ open, onClose, title, children, closable = true }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-raid-border bg-raid-card shadow-lg">
        <div className="flex items-center justify-between border-b border-raid-border px-6 py-4">
          <h2 className="text-lg font-semibold text-raid-text">{title}</h2>
          {closable && onClose && (
            <Button variant="ghost" onClick={onClose} className="!p-2">
              <X size={18} />
            </Button>
          )}
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
