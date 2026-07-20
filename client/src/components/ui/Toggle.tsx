import type { ButtonHTMLAttributes } from 'react';

interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}

/** Accessible On/Off switch used for “Receive raids” and similar settings. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  className = '',
  ...props
}: ToggleProps) {
  return (
    <div className={`flex items-center justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-raid-text">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-raid-text-secondary">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-raid-accent disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'bg-raid-accent' : 'bg-raid-border'
        }`}
        {...props}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-150 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
