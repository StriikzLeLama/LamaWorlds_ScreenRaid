import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-raid-text-secondary">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full rounded-xl border border-raid-border bg-raid-card px-3 py-2.5 text-sm text-raid-text placeholder:text-raid-text-secondary focus:border-raid-accent focus:outline-none focus:ring-1 focus:ring-raid-accent ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-raid-danger">{error}</p>}
    </div>
  );
}
