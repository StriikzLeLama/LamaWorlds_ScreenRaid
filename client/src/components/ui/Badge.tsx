import type { ReactNode } from 'react';

type BadgeVariant = 'accent' | 'neutral' | 'success' | 'danger' | 'warning';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, string> = {
  accent: 'bg-raid-accent/15 text-raid-accent border-raid-accent/30',
  neutral: 'bg-raid-surface text-raid-text-secondary border-raid-border',
  success: 'bg-raid-success/15 text-raid-success border-raid-success/30',
  danger: 'bg-raid-danger/15 text-raid-danger border-raid-danger/30',
  warning: 'bg-raid-warning/15 text-raid-warning border-raid-warning/30',
};

export function Badge({ children, variant = 'neutral' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-medium ${variants[variant]}`}
    >
      {children}
    </span>
  );
}
