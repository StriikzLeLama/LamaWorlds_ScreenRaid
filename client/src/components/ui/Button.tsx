import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-raid-accent hover:bg-raid-accent-hover text-raid-bg font-medium',
  secondary:
    'bg-raid-surface border border-raid-border hover:border-raid-text-secondary text-raid-text',
  ghost:
    'hover:bg-raid-surface text-raid-text-secondary hover:text-raid-text',
  danger: 'bg-raid-danger hover:bg-red-600 text-white font-medium',
};

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
